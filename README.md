# rent-tracker-bd

Offline bilingual (English / Bangla) house-rent tracker for Bangladeshi landlords,
mess managers, and flat owners. Track tenants, generate monthly bills with
utility charges, record payments, and see who owes what - all in the browser,
with no account, no server, and no network requests.

## Problem

A landlord or mess manager collecting rent from several flats usually tracks it
in a paper khata or a scattered spreadsheet: rent + gas + electricity + water +
service charge per tenant per month, partial payments, advance deposits, and
vacated tenants who should stop being billed. This app keeps that ledger in one
place, works fully offline, and speaks both English and Bangla.

## Features

1. **Tenant / unit CRUD** - name, flat/unit label, monthly rent (BDT), advance
   deposit (BDT), move-in date, status Active / Vacated. Vacating stamps the
   vacate date; a vacated tenant can be reactivated. Inline validation: empty
   name, negative / non-numeric money, bad dates, vacate date before move-in.
2. **Monthly bills** - per tenant, per month: rent + editable utility charges
   (gas, electricity, water, service charge; each optional, default 0) = bill
   total. One bill per tenant per month (no duplicates). Bill status is derived
   from payments: Unpaid / Partial / Paid. Due date is the 10th of the bill
   month; an OVERDUE badge shows when past due and not fully paid.
3. **Payment ledger** - record a payment against a bill (partial allowed),
   method (Cash / bKash / Nagad / Rocket / Bank), date (no future dates), note.
   Overpayment beyond the remaining balance is rejected inline. Payment history
   with tenant + month filters; deleting a payment recomputes the bill status.
4. **Dashboard** - this-month expected / collected / outstanding / collection
   rate %, total arrears across all months, total advance deposits held (active
   tenants), overdue-bill count. Dues view lists tenants with outstanding
   balances, sorted by total owed (descending), with a per-tenant breakdown.
5. **Data** - JSON export (download), import with STRICT validation (malformed /
   wrong-schema / negative-money / unknown-tenant-payment rejected; existing
   data stays intact on rejection), clear-all requiring the typed confirmation
   `DELETE`.
6. **EN / Bangla toggle** - persisted in localStorage, with Bengali digits when
   Bangla is active. All data persists in localStorage across reloads. The UI is
   responsive and has no horizontal overflow at 390px width.
7. **Ships empty** - no demo tenants or bills. You start with your own data.

## Stack

Vanilla HTML / CSS / JavaScript. Zero dependencies, zero build step, zero
network requests (no CDN, no fonts, no analytics).

## Prerequisites

Any modern browser (Chrome, Edge, Firefox, Safari). No Node.js needed to use
the app; Node.js is only needed to run the unit tests.

## Install / run

Option A - open the file directly:

```sh
open index.html
```

Option B - serve it locally (any static server):

```sh
npx serve .
# or
python3 -m http.server 8000
```

Then open http://localhost:8000 in your browser.

## Testing

Unit tests (Node.js, pure logic - bill math, payment rules, import validator,
Bengali digits):

```sh
node --test tests/unit.test.js
```

Headless-Chrome smoke tests (raw CDP, no dependencies) - a full hand-verified
scenario against `?asof=2026-10-13`: two tenants, October bills, partial + full
payments, vacate, Bangla toggle + persistence, export / clear / import,
malformed import, payment delete, 390px no-overflow, 0 console errors:

```sh
node tests/smoke.mjs
```

See `TEST_RESULTS.md` for the exact recorded counts.

## Deployment

Static site - deploy the whole folder to GitHub Pages, Netlify Drop, or any
static host. There is no backend to configure.

## Limitations

- Personal tracker, **not accounting software, not legal advice**.
- Data lives in the browser's localStorage on one device; it is not synced,
  backed up, or shared. Export JSON regularly if the data matters.
- No authentication or multi-user support; anyone with the device can see and
  edit the data.
- No backend, no SMS / bKash integration - payments are recorded manually.
- Due date is fixed to the 10th of the bill month; there is no per-tenant
  due-date or late-fee rule.
- Utility rates are entered per bill; there is no automatic meter-reading or
  rate table.
- Validation error messages are shown in English even in Bangla mode.

## Status

Complete local build. Unit tests 13/13 blocks (111 assert call-sites) passing.
Smoke tests 78/78 passing, 0 console errors, 0 network requests.
