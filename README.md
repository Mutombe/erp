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

## How the two halves connect

The frontend and backend run as **one application on a single origin**: Django
serves the built React app (`frontend/dist`) and the API together, so there is no
proxy, no CORS, and no second web server in production. Client-side deep links
(`/app/students/3`) are handled by a catch-all route that returns `index.html`;
anything under `/api/`, `/admin/`, `/static/`, `/media/` and `/health/` is
excluded from it.

For day-to-day UI work you can still run the Vite dev server for hot reload — it
proxies `/api` to Django on port 8001. The frontend's axios client always calls
relative `/api/...` URLs, so the same code works in both modes.

## Getting started

### First-time setup

```bash
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt      # Windows
.venv/Scripts/python manage.py migrate
.venv/Scripts/python manage.py seed_school --demo  # COA, calendar, sequences + demo data
.venv/Scripts/python manage.py createsuperuser     # optional; demo login below

cd ../frontend
npm install
```

### Run it

```powershell
.\start.ps1          # one server: http://127.0.0.1:8001 (builds the SPA if needed)
.\start.ps1 -Dev     # API on :8001 + Vite hot reload on :5173
```

Or manually:

```bash
cd frontend && npm run build          # once, for single-origin mode
cd backend  && .venv/Scripts/python manage.py runserver 8001
```

Demo login: **admin@school.local / admin123** · API docs: http://127.0.0.1:8001/api/docs/

> Port 8001 is used because 8000/5173 are often taken by other local projects.
> Override the dev proxy target with `VITE_API_TARGET` if you move the API.

### Tests

```bash
cd backend
.venv/Scripts/python -m pytest
```

The test suite covers the posting invariants: journals balance in both currencies, atomic rollback, reversal correctness, period locking, GL/audit immutability, FIFO payment allocation with prepayment residue and realized FX, billing-run idempotency, bursary math, moving-average inventory valuation, and the sub-ledger ↔ control account reconciliation invariant.

## Deployment

Live: **https://oceanwaves-erp.onrender.com** (Render web service `oceanwaves-erp`,
Docker runtime, Neon PostgreSQL).

The `Dockerfile` is a two-stage build — Node compiles the SPA, then the Python
image serves it together with the API under gunicorn, so one container is the
whole system. `docker-entrypoint.sh` runs migrations, the idempotent
`seed_school`, and provisions the admin user on every deploy. Pushing to `main`
auto-deploys.

Required environment variables:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SECRET_KEY` | Django secret (generate a fresh 50+ char value) |
| `ALLOWED_HOSTS` | e.g. `.onrender.com` |
| `CSRF_TRUSTED_ORIGINS` | e.g. `https://*.onrender.com` |
| `DJANGO_SETTINGS_MODULE` | `config.settings.prod` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Bootstraps the first admin (optional) |
| `TIME_ZONE`, `BASE_CURRENCY`, `SECONDARY_CURRENCY` | Locale/currency defaults |

Production seeds the chart of accounts, calendar and sequences but **no demo
data** — add real students and balances through the UI, or import opening
balances via Accounting → Opening Balances.

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
