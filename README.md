# Bit Studio School ERP

An Odoo-inspired, single-school ERP with deep double-entry accounting, student billing & fees, inventory & procurement, and a fixed-asset register. Multi-currency (USD base + ZWG).

## Architecture

```
backend/    Django 5.2 + DRF + django-q2 — SQLite in dev, PostgreSQL in prod (DATABASE_URL)
frontend/   React 18 + TypeScript + Vite + Tailwind + TanStack Query v5
```

### Accounting engine

- **Single posting pathway**: every document (fee invoice, receipt, GRN, vendor bill, payment, stock issue, depreciation run, opening balance, manual journal) posts through `accounting.services.build_and_post_journal()`. Account codes are never hardcoded — they resolve through the `AccountMapping` table.
- **Journal lines always hit a GL account**; the student/supplier sub-ledger pocket and bank account are *dimensions* on the line, so control accounts reconcile with their sub-ledgers by construction.
- **Immutable general ledger** with running balances; corrections are reversals (mirror journals), never edits or deletes. Fiscal periods can be locked. Full audit trail.
- **Multi-currency**: journals carry a transaction currency + exchange rate; the GL stores both transaction and base (USD) amounts; realized FX gains/losses post automatically on cross-rate settlements.
- **Reports are period-strict**: trial balance, balance sheet, income statement (P&L or Income & Expenditure layout), aged debtors/creditors, student statements, cashbook, asset register, stock valuation, fee collection — all aggregated from the GL as-of date.

## Getting started

### Backend

```bash
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt      # Windows
.venv/Scripts/python manage.py migrate
.venv/Scripts/python manage.py seed_school --demo  # COA, calendar, sequences + demo data
.venv/Scripts/python manage.py createsuperuser
.venv/Scripts/python manage.py runserver 8001
```

API docs: http://127.0.0.1:8001/api/docs/ (port 8001 — the Vite dev proxy targets it, and 8000 is commonly taken by other local Django projects)

### Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173 (proxies /api to :8000)
```

### Tests

```bash
cd backend
.venv/Scripts/python -m pytest
```

The test suite covers the posting invariants: journals balance in both currencies, atomic rollback, reversal correctness, period locking, GL/audit immutability, FIFO payment allocation with prepayment residue and realized FX, billing-run idempotency, bursary math, moving-average inventory valuation, and the sub-ledger ↔ control account reconciliation invariant.

## Module map

| Module | Backend app | Key documents |
|---|---|---|
| Accounting | `accounting` | Manual journals, opening balances, bank accounts, reconciliation |
| Students | `students` | Students, guardians, classes, academic years/terms, enrollment |
| Fees | `fees` | Fee structures, billing runs, fee invoices, receipts, credit notes, bursaries |
| Inventory | `inventory` | Items, warehouses, stock moves (moving-average valuation) |
| Purchasing | `procurement` | Suppliers, POs, GRNs, vendor bills, supplier payments |
| Assets | `assets` | Asset register, monthly depreciation runs, disposals |
| Reports | `reports` | TB, BS, I&E, aged analysis, statements, cashbook, valuations, dashboard |

Roles: admin, bursar, accounts clerk, head, storekeeper, teacher, auditor (read-only). Writes are permission-gated per module.
