# rent-tracker-bd - TEST RESULTS

Run: 2026-10-13, MUSE PROJECT FACTORY run #53 (14:00 slot, builder phase).
Deterministic date in tests: `?asof=2026-10-13`.

## Summary

- Unit tests: **13/13 test blocks passing** (111 assert call-sites; loop-executed
  asserts in the import-validator matrix run additional times).
- Smoke tests (headless Chrome, raw CDP): **78/78 checks passing**,
  on two consecutive runs with identical results.
- Console errors: **0**. Page errors: **0**. Non-file network requests: **0**.

## Unit tests

Command: `node --test tests/unit.test.js`

Covered: money parsing (integers, decimals, commas, negatives, bad decimals,
float rejection), money formatting (EN grouping + 2 decimals, paisa exactness),
Bengali digit conversion + Bangla month labels, tenant validation (16 cases incl.
vacate-before-move-in, future dates, unknown fields), bill math + Unpaid /
Partial / Paid transitions, bill-record validation (total mismatch, unknown
tenant, wrong due date, bad utilities), bill generation (totals, no duplicates,
vacated-tenant month rules, move-in-after-month exclusion, negative utility),
payment validation (partial/full/overpayment/cumulative cap/future date/bad
method/long note/unknown bill), dashboard math, dues sorting, deposits for
active tenants only, import-validator matrix (20 malformed cases, all rejected),
export deep-copy.

## Smoke tests

Command: `node tests/smoke.mjs` (raw CDP against /opt/meta-chromium/chrome,
`file://` + `?asof=2026-10-13`, fresh Chrome profile per run).

Hand-verified scenario numbers (all asserted in the test):

- Tenants: Rahim, Flat 2A, rent 12,000, deposit 24,000, move-in 2026-01-05;
  Karim, Flat 3B, rent 9,000, deposit 18,000, move-in 2026-02-01.
  Deposits held: 42,000.00.
- October bills: Rahim 12,000 + gas 1,080 + service 500 = **13,580.00**;
  Karim 9,000.00. Dashboard expected **22,580.00**, due date 2026-10-10,
  OVERDUE badges shown (asof 2026-10-13 is past due).
- Pay 10,000 (bKash) on Rahim's bill -> collected 10,000.00,
  outstanding 12,580.00, rate **44.29%**, bill status Partial.
- Overpayment of 3,581 rejected inline ("exceeds"); pay remaining 3,580 ->
  bill Paid, collected 13,580.00, outstanding 9,000.00, rate **60.14%**,
  overdue count 1 (Karim only).
- Future-dated payment (2026-10-14) rejected inline.
- Vacate Karim -> November generation creates 1 bill (Rahim only); no Nov bill
  for Karim; October bill for Karim still exists (vacated 2026-10-13, on/after
  Oct 1).
- Bangla toggle: dashboard shows Bengali digits; language persists across a
  full page reload; toggling back restores English.
- Export -> clear (typed DELETE) -> import round-trip: 2 tenants, 3 bills,
  2 payments restored; dashboard expected back to 22,580.00.
- Malformed import (empty tenant name) rejected with data intact (still
  2 tenants); non-JSON import rejected with data intact.
- Delete the 10,000 payment -> collected drops to 3,580.00, Rahim's bill
  returns to Partial.
- 390px viewport: no horizontal overflow (scrollWidth <= 390) on all five tabs.
- Validation: empty-name submit shows inline error, adds no tenant; negative
  rent rejected inline.

## Repairs made

1. App-side (repair cycle 1): the tenant form early-returned on a rent parse
   error, hiding other errors (e.g. "Name is required"). Changed to pass a
   sentinel value into the validator so ALL errors are reported together.
2. Test-side: bill-validator test expected an "exactly" message for missing
   utility keys; the validator rejects them with per-key errors instead.
   Test corrected to match the (correct) validator behavior.
3. Test-side: rate expectation corrected 60.15% -> 60.14% (13580/22580 =
   60.14%; the first hand calculation was wrong, the app was right).
4. Test-harness: smoke runs shared one Chrome profile/port, so a second run
   inherited the first run's localStorage. Port + profile are now unique per
   process, with SIGKILL + settle delay before exit. Two consecutive runs now
   both pass 78/78.

## Hygiene

- ASCII check: `grep -rP '[^\x00-\x7F]'` over `*.js`, `*.html`, `*.css`, `*.md`
  -> zero matches. All Bengali text is `\uXXXX` escapes in source.
- XSS: no `innerHTML` used with user input anywhere (the only match is a code
  comment stating this). All user strings render via `textContent`.
- Money: integer paisa internally everywhere; display the taka sign (U+09F3) with 2 decimals.

## Honest limitations

- Validation error messages are English-only even in Bangla mode.
- Due date is fixed to the 10th of the bill month (no per-tenant due dates,
  no late fees).
- Utility rates are typed per bill; no meter-reading or rate-table support.
- localStorage only: single-device, no sync/backup, no auth. Export JSON
  regularly if the data matters.
