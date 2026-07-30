"""Multi-tenant isolation: two schools share the DB but never each other's rows."""
from datetime import date
from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError
from django.db.models import Sum

from apps.accounting.models import ChartOfAccount, GeneralLedger, Journal
from apps.accounting.services import LineSpec, build_and_post_journal
from apps.core.models import DocumentSequence, Organization, School

pytestmark = pytest.mark.django_db

D = Decimal


@pytest.fixture
def two_schools(seeded_db):
    """Oceanwaves (from seed) plus a second provisioned school, Kingsknot."""
    from apps.core.provisioning import provision_school

    ocw = School.get_default()
    org = Organization.get()
    kns = School.objects.create(
        organization=org, code='KNS', slug='kingsknot', name='Kingsknot Academy',
        base_currency='USD', secondary_currency='ZWG',
    )
    provision_school(kns)
    return ocw, kns


def _post(school, debit='5100', credit='1010', amount='100.00', when=date(2026, 3, 10)):
    return build_and_post_journal(
        journal_type='general', date=when, currency='USD', description='t',
        school=school,
        lines=[
            LineSpec(account=ChartOfAccount.objects.get(school=school, code=debit), debit=D(amount)),
            LineSpec(account=ChartOfAccount.objects.get(school=school, code=credit), credit=D(amount)),
        ],
    )


def test_independent_document_sequences(two_schools):
    ocw, kns = two_schools
    # Each school's JRN sequence starts fresh at 1.
    assert DocumentSequence.next_for('JRN', ocw) == 'JRN00001'
    assert DocumentSequence.next_for('JRN', kns) == 'JRN00001'
    assert DocumentSequence.next_for('JRN', ocw) == 'JRN00002'
    assert DocumentSequence.next_for('JRN', kns) == 'JRN00002'


def test_independent_chart_of_accounts_same_codes_coexist(two_schools):
    ocw, kns = two_schools
    a = ChartOfAccount.objects.get(school=ocw, code='4000')
    b = ChartOfAccount.objects.get(school=kns, code='4000')
    assert a.pk != b.pk
    assert a.school_id == ocw.id and b.school_id == kns.id
    assert ChartOfAccount.objects.filter(code='4000').count() == 2


def test_journal_posted_in_a_is_invisible_to_b(two_schools):
    ocw, kns = two_schools
    j = _post(ocw)
    assert Journal.objects.filter(school=ocw, number=j.number).exists()
    assert not Journal.objects.filter(school=kns, number=j.number).exists()
    # Same journal number can exist independently per school.
    j2 = _post(kns)
    assert j.number == j2.number == 'JRN00001'


def test_gl_aggregation_is_isolated_per_school(two_schools):
    ocw, kns = two_schools
    _post(ocw, amount='100.00')
    _post(kns, amount='250.00')

    def gl_debits(school):
        return GeneralLedger.objects.filter(school=school).aggregate(d=Sum('debit_base'))['d'] or D('0')

    assert gl_debits(ocw) == D('100.00')
    assert gl_debits(kns) == D('250.00')
    # No GL row leaks across the tenant boundary.
    assert GeneralLedger.objects.filter(school=kns).exclude(account__school=kns).count() == 0


def test_cross_school_posting_is_impossible(two_schools):
    ocw, kns = two_schools
    # Build a journal stamped for OCW but referencing a KNS account: must refuse.
    with pytest.raises(ValidationError):
        build_and_post_journal(
            journal_type='general', date=date(2026, 3, 10), currency='USD', description='cross',
            school=ocw,
            lines=[
                LineSpec(account=ChartOfAccount.objects.get(school=ocw, code='5100'), debit=D('100')),
                LineSpec(account=ChartOfAccount.objects.get(school=kns, code='1010'), credit=D('100')),
            ],
        )
    # Nothing was committed for the offending journal.
    assert not GeneralLedger.objects.filter(school=kns, debit_base=D('100')).exists()


def test_new_school_trial_balance_is_empty_and_balanced(two_schools):
    ocw, kns = two_schools
    kns_gl = GeneralLedger.objects.filter(school=kns)
    assert kns_gl.count() == 0
    totals = kns_gl.aggregate(d=Sum('debit_base'), c=Sum('credit_base'))
    assert (totals['d'] or D('0')) == (totals['c'] or D('0')) == D('0')
