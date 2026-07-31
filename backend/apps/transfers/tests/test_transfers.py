from datetime import date
from decimal import Decimal

import pytest

from apps.accounting.models import BankAccount, ChartOfAccount, SubAccount
from apps.core.models import Roles, School, User
from apps.students.models import (
    AcademicYear,
    ClassRoom,
    Enrollment,
    Grade,
    Guardian,
    Student,
    StudentGuardian,
)
from apps.transfers.models import InterSchoolTransfer
from apps.transfers.services import execute_fund_transfer, execute_student_transfer
from conftest import assert_gl_balanced, make_invoice

pytestmark = pytest.mark.django_db

D = Decimal


@pytest.fixture
def school_a(seeded_db):
    return School.get_default()


@pytest.fixture
def school_b(seeded_db):
    from apps.core.models import Organization
    from apps.core.provisioning import provision_school

    b = School.objects.create(
        organization=Organization.get(), code='KNS', slug='kingsknot',
        name='Kingsknot Academy', base_currency='USD', secondary_currency='ZWG',
    )
    provision_school(b)
    return b


def _bank(school, code):
    return BankAccount.objects.get(school=school, code=code)


def _coa(school, code):
    return ChartOfAccount.objects.get(school=school, code=code)


def _make_student(school, code, first='Pupil', last='One', guardian=True):
    year = AcademicYear.objects.get(school=school, name='2026')
    grade = Grade.objects.get(school=school, name='Grade 1')
    room, _ = ClassRoom.objects.get_or_create(
        school=school, name='Grade 1 X', academic_year=year, grade=grade
    )
    s = Student.objects.create(
        school=school, code=code, first_name=first, last_name=last,
        admission_date=date(2026, 1, 13),
    )
    Enrollment.objects.create(student=s, academic_year=year, class_room=room, enrolled_date=date(2026, 1, 13))
    if guardian:
        g = Guardian.objects.create(school=school, code='G1', first_name='Par', last_name='Ent')
        StudentGuardian.objects.create(student=s, guardian=g, is_primary_contact=True, is_billing_contact=True)
    return s


def _class_in(school, name='Form 1 X'):
    year = AcademicYear.objects.get(school=school, name='2026')
    grade = Grade.objects.get(school=school, name='Grade 1')
    room, _ = ClassRoom.objects.get_or_create(school=school, name=name, academic_year=year, grade=grade)
    return room


class TestInterUnitAccounts:
    def test_provisioning_adds_interunit_accounts(self, school_b):
        assert _coa(school_b, '1180').name == 'Due from Related Schools'
        assert _coa(school_b, '2180').name == 'Due to Related Schools'
        from apps.accounting.models import AccountMapping

        assert AccountMapping.resolve('interschool_due_from', school=school_b).code == '1180'
        assert AccountMapping.resolve('interschool_due_to', school=school_b).code == '2180'

    def test_backfill_added_them_to_default_school(self, school_a):
        assert _coa(school_a, '1180').code == '1180'
        assert _coa(school_a, '2180').code == '2180'


class TestFundTransfer:
    def test_moves_cash_and_mirrors_interunit(self, school_a, school_b):
        a_bank = _bank(school_a, 'BANK-USD')
        b_bank = _bank(school_b, 'BANK-USD')
        a0 = BankAccount.objects.get(pk=a_bank.pk).book_balance
        b0 = BankAccount.objects.get(pk=b_bank.pk).book_balance

        t = execute_fund_transfer(from_bank=a_bank, to_bank=b_bank, amount=D('500'), date=date(2026, 3, 1))
        assert t.status == 'completed'
        assert t.from_journal and t.to_journal

        assert BankAccount.objects.get(pk=a_bank.pk).book_balance == a0 - D('500')
        assert BankAccount.objects.get(pk=b_bank.pk).book_balance == b0 + D('500')
        assert _coa(school_a, '1180').current_balance == D('500')  # A owed by B
        assert _coa(school_b, '2180').current_balance == D('500')  # B owes A

        assert_gl_balanced(school=school_a)
        assert_gl_balanced(school=school_b)
        assert_gl_balanced()  # group nets to zero

    def test_rejects_currency_mismatch(self, school_a, school_b):
        with pytest.raises(Exception):
            execute_fund_transfer(
                from_bank=_bank(school_a, 'BANK-USD'), to_bank=_bank(school_b, 'BANK-ZWG'),
                amount=D('100'), date=date(2026, 3, 1),
            )

    def test_rejects_same_school(self, school_a):
        with pytest.raises(Exception):
            execute_fund_transfer(
                from_bank=_bank(school_a, 'BANK-USD'), to_bank=_bank(school_a, 'CASH-USD'),
                amount=D('100'), date=date(2026, 3, 1),
            )


class TestStudentTransfer:
    def test_carries_balance_and_opens_new_record(self, school_a, school_b):
        student = _make_student(school_a, 'STU-A1')
        make_invoice(student, {'TUI': '400.00'}, currency='USD', school=school_a)  # owes 400

        to_class = _class_in(school_b)
        t = execute_student_transfer(from_student=student, to_class=to_class, date=date(2026, 3, 10))

        assert t.kind == 'student' and t.status == 'completed'
        student.refresh_from_db()
        assert student.status == 'transferred'
        assert not Enrollment.objects.filter(student=student, status='active').exists()

        new = t.to_student
        assert new is not None and new.school_id == school_b.id
        assert new.status == 'enrolled'
        assert Enrollment.objects.filter(student=new, class_room=to_class).exists()
        assert StudentGuardian.objects.filter(student=new).exists()  # guardian copied

        # Source pockets cleared; destination opens the carried balance.
        a_pocket_total = sum(
            p.current_balance for p in SubAccount.objects.filter(student=student, currency='USD')
        )
        assert a_pocket_total == D('0')
        b_pocket_total = sum(
            p.current_balance for p in SubAccount.objects.filter(student=new, currency='USD')
        )
        assert b_pocket_total == D('400.00')

        assert _coa(school_a, '1180').current_balance == D('400.00')  # A owed by B
        assert _coa(school_b, '2180').current_balance == D('400.00')  # B owes A

        assert_gl_balanced(school=school_a)
        assert_gl_balanced(school=school_b)
        assert_gl_balanced()

    def test_historical_invoice_stays_in_source_school(self, school_a, school_b):
        student = _make_student(school_a, 'STU-A2')
        inv = make_invoice(student, {'TUI': '200.00'}, currency='USD', school=school_a)
        execute_student_transfer(from_student=student, to_class=_class_in(school_b), date=date(2026, 3, 10))
        inv.refresh_from_db()
        assert inv.school_id == school_a.id  # books immutable — invoice stays put

    def test_prepayment_carries_as_credit(self, school_a, school_b, usd_bank):
        from apps.fees.services import create_receipt

        student = _make_student(school_a, 'STU-A3')
        # Pay with no invoices → GENERAL prepayment pocket (credit balance).
        create_receipt(student=student, bank_account=usd_bank, amount=D('150'), date=date(2026, 2, 1))
        t = execute_student_transfer(from_student=student, to_class=_class_in(school_b), date=date(2026, 3, 10))

        new = t.to_student
        b_total = sum(p.current_balance for p in SubAccount.objects.filter(student=new, currency='USD'))
        assert b_total == D('-150.00')  # still a prepayment (credit) in the new school
        # A holds a payable to B (it shipped the prepaid value across).
        assert _coa(school_a, '2180').current_balance == D('150.00')
        assert _coa(school_b, '1180').current_balance == D('150.00')
        assert_gl_balanced()

    def test_rejects_same_school(self, school_a):
        student = _make_student(school_a, 'STU-A4')
        with pytest.raises(Exception):
            execute_student_transfer(
                from_student=student, to_class=_class_in(school_a, 'Other X'), date=date(2026, 3, 10)
            )


class TestStockTransfer:
    def _stocked_item(self, school, store_code='MAIN', code='PEN', qty=D('100'), cost=D('2')):
        from apps.accounting.models import ChartOfAccount
        from apps.inventory.models import ItemCategory, Item, Warehouse, receive_stock

        cat, _ = ItemCategory.objects.get_or_create(
            school=school, name='Stationery',
            defaults={
                'inventory_account': ChartOfAccount.objects.get(school=school, code='1200'),
                'consumption_expense_account': ChartOfAccount.objects.get(school=school, code='5210'),
            },
        )
        store = Warehouse.objects.create(school=school, code=store_code, name='Store')
        item = Item.objects.create(school=school, code=code, name='Pens', category=cat)
        if qty:
            receive_stock(item=item, warehouse=store, quantity=qty, unit_cost_base=cost, date=date(2026, 2, 1))
            item.refresh_from_db()
        return item, store

    def test_stock_moves_between_schools_and_mirrors(self, school_a, school_b):
        from apps.transfers.services import execute_stock_transfer

        src_item, src_store = self._stocked_item(school_a, qty=D('100'), cost=D('2'))
        dst_item, dst_store = self._stocked_item(school_b, code='PEN', qty=D('0'))

        t = execute_stock_transfer(
            from_warehouse=src_store, from_item=src_item, to_warehouse=dst_store,
            to_item=dst_item, quantity=D('30'), date=date(2026, 3, 1),
        )
        assert t.kind == 'stock' and t.status == 'completed'
        assert t.amount == D('60.00')  # 30 x avg cost 2

        src_item.refresh_from_db()
        dst_item.refresh_from_db()
        assert src_item.qty_on_hand == D('70')
        assert dst_item.qty_on_hand == D('30')
        assert dst_item.avg_cost == D('2.0000')  # received at the transferred cost

        assert _coa(school_a, '1180').current_balance == D('60.00')  # A owed by B
        assert _coa(school_b, '2180').current_balance == D('60.00')  # B owes A
        assert_gl_balanced(school=school_a)
        assert_gl_balanced(school=school_b)
        assert_gl_balanced()

    def test_rejects_same_school(self, school_a):
        from apps.transfers.services import execute_stock_transfer

        item, store = self._stocked_item(school_a)
        _item2, store2 = self._stocked_item(school_a, store_code='ANNEX', code='PEN2', qty=D('0'))
        with pytest.raises(Exception):
            execute_stock_transfer(
                from_warehouse=store, from_item=item, to_warehouse=store2, to_item=item,
                quantity=D('5'), date=date(2026, 3, 1),
            )


class TestTransferApi:
    def _hq(self, school_a):
        from rest_framework.test import APIClient

        user = User.objects.create_superuser('hq@golden.test', 'x')
        c = APIClient()
        c.force_authenticate(user)
        return c

    def test_funds_endpoint(self, school_a, school_b):
        client = self._hq(school_a)
        res = client.post('/api/transfers/transfers/funds/', {
            'from_bank': _bank(school_a, 'BANK-USD').id,
            'to_bank': _bank(school_b, 'BANK-USD').id,
            'amount': '250.00', 'date': '2026-03-01',
        }, format='json')
        assert res.status_code == 201, res.data
        assert res.data['kind'] == 'funds'
        assert_gl_balanced()

    def test_student_preview_and_transfer(self, school_a, school_b):
        student = _make_student(school_a, 'STU-A5')
        make_invoice(student, {'TUI': '300.00'}, currency='USD', school=school_a)
        client = self._hq(school_a)

        prev = client.get(f'/api/transfers/transfers/student-preview/?student={student.id}')
        assert prev.status_code == 200
        assert D(str(prev.data['balances'][0]['amount'])) == D('300.00')

        res = client.post('/api/transfers/transfers/student/', {
            'from_student': student.id, 'to_class': _class_in(school_b).id, 'date': '2026-03-10',
        }, format='json')
        assert res.status_code == 201, res.data
        assert res.data['to_student'] is not None

    def test_non_hq_user_is_forbidden(self, school_a):
        from rest_framework.test import APIClient

        clerk = User.objects.create_user('clerk@a.test', 'x', role=Roles.ACCOUNTS_CLERK, home_school=school_a)
        c = APIClient()
        c.force_authenticate(clerk)
        assert c.get('/api/transfers/transfers/').status_code == 403
