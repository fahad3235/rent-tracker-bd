/* rent-tracker-bd -- node unit tests. Run: node --test tests/unit.test.js */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const RT = require('../js/logic.js');

const ASOF = '2026-10-13';

function tenant(over = {}) {
  return Object.assign({
    id: 't1', name: 'Rahim', flat: '2A', rentPaisa: 1200000, depositPaisa: 2400000,
    moveIn: '2026-01-05', status: 'active', vacateDate: null
  }, over);
}
function bill(over = {}) {
  return Object.assign({
    id: 'b1', tenantId: 't1', month: '2026-10', rentPaisa: 1200000,
    utilities: { gas: 108000, electricity: 0, water: 0, service: 50000 },
    totalPaisa: 1358000, dueDate: '2026-10-10'
  }, over);
}
function stateWith(over = {}) {
  return Object.assign({ version: 1, tenants: [], bills: [], payments: [] }, over);
}

// ---------- money ----------
test('parseMoneyBDT: integers, decimals, commas, invalid', () => {
  assert.equal(RT.parseMoneyBDT('12000'), 1200000);
  assert.equal(RT.parseMoneyBDT('12,580'), 1258000);
  assert.equal(RT.parseMoneyBDT('13580.50'), 1358050);
  assert.equal(RT.parseMoneyBDT('13580.5'), 1358050);
  assert.equal(RT.parseMoneyBDT('0'), 0);
  assert.equal(RT.parseMoneyBDT(''), null);
  assert.equal(RT.parseMoneyBDT('  9000  '), 900000);
  assert.equal(RT.parseMoneyBDT('-100'), null);
  assert.equal(RT.parseMoneyBDT('abc'), null);
  assert.equal(RT.parseMoneyBDT('12.345'), null);
  assert.equal(RT.parseMoneyBDT('12..5'), null);
  assert.equal(RT.parseMoneyBDT('1,2,3'), 12300);
  assert.equal(RT.parseMoneyBDT(5000), 500000);
  assert.equal(RT.parseMoneyBDT(12.345), null);
});

test('formatMoney: EN grouping + 2 decimals, paisa exactness', () => {
  assert.equal(RT.formatMoney(1358000, 'en'), '\u09f313,580.00');
  assert.equal(RT.formatMoney(900000, 'en'), '\u09f39,000.00');
  assert.equal(RT.formatMoney(0, 'en'), '\u09f30.00');
  assert.equal(RT.formatMoney(100050, 'en'), '\u09f31,000.50');
  assert.equal(RT.formatMoney(1, 'en'), '\u09f30.01');
  // 0.1 + 0.2 style float trap must not appear: 13580.10 + 0.20 = 13580.30
  assert.equal(RT.formatMoney(1358010 + 20, 'en'), '\u09f313,580.30');
});

test('Bengali digits conversion', () => {
  assert.equal(RT.toBnDigits('0123456789'), '\u09e6\u09e7\u09e8\u09e9\u09ea\u09eb\u09ec\u09ed\u09ee\u09ef');
  assert.equal(RT.formatMoney(2258000, 'bn'), '\u09f3\u09e8\u09e8,\u09eb\u09ee\u09e6.\u09e6\u09e6');
  assert.equal(RT.formatInt(12580, 'bn'), '\u09e7\u09e8,\u09eb\u09ee\u09e6');
  assert.equal(RT.formatRate(44.2857, 'bn'), '\u09ea\u09ea.\u09e8\u09ef%');
  assert.equal(RT.monthLabel('2026-10', 'bn'), '\u0985\u0995\u09cd\u099f\u09cb\u09ac\u09b0 \u09e8\u09e6\u09e8\u09ec');
  assert.equal(RT.monthLabel('2026-10', 'en'), 'October 2026');
});

// ---------- tenant validation ----------
test('validateTenantRecord: happy path + each rejection', () => {
  assert.deepEqual(RT.validateTenantRecord(tenant(), ASOF), []);
  assert.ok(RT.validateTenantRecord(tenant({ name: '' }), ASOF).some(e => /Name/.test(e)));
  assert.ok(RT.validateTenantRecord(tenant({ name: '   ' }), ASOF).length > 0);
  assert.ok(RT.validateTenantRecord(tenant({ flat: '' }), ASOF).some(e => /Flat/.test(e)));
  assert.ok(RT.validateTenantRecord(tenant({ rentPaisa: -1 }), ASOF).some(e => /rent/.test(e)));
  assert.ok(RT.validateTenantRecord(tenant({ rentPaisa: 12000.5 }), ASOF).some(e => /rent/.test(e)));
  assert.ok(RT.validateTenantRecord(tenant({ depositPaisa: -5 }), ASOF).some(e => /deposit/.test(e)));
  assert.ok(RT.validateTenantRecord(tenant({ moveIn: '2026-13-01' }), ASOF).some(e => /Move-in/.test(e)));
  assert.ok(RT.validateTenantRecord(tenant({ moveIn: '2026-10-14' }), ASOF).some(e => /future/.test(e)));
  assert.ok(RT.validateTenantRecord(tenant({ status: 'pending' }), ASOF).some(e => /Status/.test(e)));
  assert.ok(RT.validateTenantRecord(tenant({ status: 'vacated', vacateDate: null }), ASOF).some(e => /Vacate date/.test(e)));
  assert.ok(RT.validateTenantRecord(tenant({ status: 'vacated', vacateDate: '2025-12-31' }), ASOF).some(e => /before move-in/.test(e)));
  assert.ok(RT.validateTenantRecord(tenant({ status: 'vacated', vacateDate: '2026-10-14' }), ASOF).some(e => /future/.test(e)));
  assert.ok(RT.validateTenantRecord(tenant({ vacateDate: '2026-10-01' }), ASOF).some(e => /must not have/.test(e)));
  assert.ok(RT.validateTenantRecord(tenant({ extra: 1 }), ASOF).some(e => /unknown fields/.test(e)));
  assert.ok(RT.validateTenantRecord(null, ASOF).length > 0);
  assert.deepEqual(RT.validateTenantRecord(tenant({ status: 'vacated', vacateDate: '2026-10-01' }), ASOF), []);
});

// ---------- bill math ----------
test('bill math: rent + utilities = total; summary statuses', () => {
  const b = bill();
  assert.equal(b.totalPaisa, 1358000);
  const s = stateWith({ tenants: [tenant()], bills: [b] });
  assert.deepEqual(RT.billSummary(b, []), { paid: 0, remaining: 1358000, status: 'Unpaid' });
  assert.deepEqual(RT.billSummary(b, [{ billId: 'b1', amountPaisa: 1000000 }]),
    { paid: 1000000, remaining: 358000, status: 'Partial' });
  assert.deepEqual(RT.billSummary(b, [{ billId: 'b1', amountPaisa: 1358000 }]),
    { paid: 1358000, remaining: 0, status: 'Paid' });
  assert.deepEqual(RT.billSummary(b, [
    { billId: 'b1', amountPaisa: 1000000 }, { billId: 'b1', amountPaisa: 358000 }]),
    { paid: 1358000, remaining: 0, status: 'Paid' });
  // other bills' payments must not leak in
  assert.equal(RT.billSummary(b, [{ billId: 'bX', amountPaisa: 999 }]).paid, 0);
  assert.ok(!RT.isOverdue(b, [], '2026-10-09'));
  assert.ok(RT.isOverdue(b, [], '2026-10-11'));
  assert.ok(!RT.isOverdue(b, [{ billId: 'b1', amountPaisa: 1358000 }], '2026-10-11'));
});

test('validateBillRecord: total mismatch + unknown tenant + bad due date', () => {
  const byId = { t1: tenant() };
  assert.deepEqual(RT.validateBillRecord(bill(), byId), []);
  assert.ok(RT.validateBillRecord(bill({ totalPaisa: 1 }), byId).some(e => /total/.test(e)));
  assert.ok(RT.validateBillRecord(bill({ tenantId: 'nope' }), byId).some(e => /unknown tenant/.test(e)));
  assert.ok(RT.validateBillRecord(bill({ dueDate: '2026-10-11' }), byId).some(e => /due date/.test(e)));
  assert.ok(RT.validateBillRecord(bill({ month: '2026-13' }), byId).some(e => /month/.test(e)));
  assert.ok(RT.validateBillRecord(bill({ utilities: { gas: -1, electricity: 0, water: 0, service: 0 } }), byId)
    .some(e => /gas/.test(e)));
  assert.ok(RT.validateBillRecord(bill({ utilities: { gas: 0 } }), byId).some(e => /Utility/.test(e)));
});

// ---------- bill generation ----------
test('generateBills: totals, no duplicates, vacated exclusion', () => {
  const t1 = tenant({ id: 't1' });
  const t2 = tenant({ id: 't2', name: 'Karim', flat: '3B', rentPaisa: 900000, depositPaisa: 0, moveIn: '2026-02-01' });
  const s = stateWith({ tenants: [t1, t2] });
  const r1 = RT.generateBills(s, '2026-10', { t1: { gas: 108000, electricity: 0, water: 0, service: 50000 } });
  assert.equal(r1.errors.length, 0);
  assert.equal(r1.bills.length, 2);
  const b1 = r1.bills.find(b => b.tenantId === 't1');
  assert.equal(b1.totalPaisa, 1358000);
  assert.equal(b1.dueDate, '2026-10-10');
  const b2 = r1.bills.find(b => b.tenantId === 't2');
  assert.equal(b2.totalPaisa, 900000);
  // duplicate prevention
  const s2 = stateWith({ tenants: [t1, t2], bills: r1.bills });
  assert.equal(RT.generateBills(s2, '2026-10', {}).bills.length, 0);
  // vacated tenant: Oct bill still due (vacated 2026-10-20 >= Oct 1), Nov bill excluded
  const t2v = tenant({ id: 't2', name: 'Karim', flat: '3B', rentPaisa: 900000, depositPaisa: 0, moveIn: '2026-02-01', status: 'vacated', vacateDate: '2026-10-20' });
  const s3 = stateWith({ tenants: [t1, t2v] });
  assert.equal(RT.generateBills(s3, '2026-10', {}).bills.length, 2);
  assert.equal(RT.generateBills(s3, '2026-11', {}).bills.length, 1);
  assert.equal(RT.generateBills(s3, '2026-11', {}).bills[0].tenantId, 't1');
  // move-in after month -> excluded
  const t3 = tenant({ id: 't3', name: 'Late', flat: '1A', rentPaisa: 500000, moveIn: '2026-11-05' });
  const s4 = stateWith({ tenants: [t3] });
  assert.equal(RT.generateBills(s4, '2026-10', {}).bills.length, 0);
  assert.equal(RT.generateBills(s4, '2026-11', {}).bills.length, 1);
  // bad month
  assert.ok(RT.generateBills(s, '2026-13', {}).errors.length > 0);
  // negative utility rejected, no bill created for that tenant
  const bad = RT.generateBills(s, '2026-10', { t1: { gas: -5 } });
  assert.ok(bad.errors.length > 0);
  assert.ok(!bad.bills.some(b => b.tenantId === 't1'));
});

// ---------- payments ----------
test('payment validation: partial/full/overpayment/future-date/method', () => {
  const b = bill();
  const s = stateWith({ tenants: [tenant()], bills: [b], payments: [] });
  const base = { billId: 'b1', amountPaisa: 1000000, method: 'bkash', date: '2026-10-12', note: '' };
  assert.deepEqual(RT.validatePaymentInput(s, base, ASOF), []);
  assert.ok(RT.validatePaymentInput(s, Object.assign({}, base, { amountPaisa: 1358001 }), ASOF)
    .some(e => /exceeds/.test(e)));
  assert.deepEqual(RT.validatePaymentInput(s, Object.assign({}, base, { amountPaisa: 1358000 }), ASOF), []);
  assert.ok(RT.validatePaymentInput(s, Object.assign({}, base, { amountPaisa: 0 }), ASOF).length > 0);
  assert.ok(RT.validatePaymentInput(s, Object.assign({}, base, { amountPaisa: -100 }), ASOF).length > 0);
  assert.ok(RT.validatePaymentInput(s, Object.assign({}, base, { method: 'card' }), ASOF).some(e => /method/.test(e)));
  assert.ok(RT.validatePaymentInput(s, Object.assign({}, base, { date: '2026-10-14' }), ASOF).some(e => /future/.test(e)));
  assert.ok(RT.validatePaymentInput(s, Object.assign({}, base, { date: 'not-a-date' }), ASOF).some(e => /date/.test(e)));
  assert.ok(RT.validatePaymentInput(s, Object.assign({}, base, { billId: 'nope' }), ASOF).some(e => /bill/.test(e)));
  assert.ok(RT.validatePaymentInput(s, Object.assign({}, base, { note: 'x'.repeat(201) }), ASOF).some(e => /note/.test(e)));
  // cumulative: after a 1,000,000 payment, only 358,000 remains
  const s2 = stateWith({ tenants: [tenant()], bills: [b],
    payments: [{ id: 'p1', billId: 'b1', tenantId: 't1', amountPaisa: 1000000, method: 'cash', date: '2026-10-05', note: '' }] });
  assert.ok(RT.validatePaymentInput(s2, Object.assign({}, base, { amountPaisa: 358001 }), ASOF).some(e => /exceeds/.test(e)));
  assert.deepEqual(RT.validatePaymentInput(s2, Object.assign({}, base, { amountPaisa: 358000 }), ASOF), []);
});

// ---------- dashboard / dues / arrears / deposits ----------
test('dashboard: expected/collected/outstanding/rate + arrears + deposits + overdue', () => {
  const t1 = tenant({ id: 't1' });
  const t2 = tenant({ id: 't2', name: 'Karim', flat: '3B', rentPaisa: 900000, depositPaisa: 1800000, moveIn: '2026-02-01' });
  const b1 = bill({ id: 'b1', tenantId: 't1' });
  const b2 = bill({ id: 'b2', tenantId: 't2', month: '2026-10', rentPaisa: 900000,
    utilities: { gas: 0, electricity: 0, water: 0, service: 0 }, totalPaisa: 900000, dueDate: '2026-10-10' });
  const bOld = bill({ id: 'b0', tenantId: 't1', month: '2026-09', totalPaisa: 1358000, dueDate: '2026-09-10' });
  const s = stateWith({ tenants: [t1, t2], bills: [b1, b2, bOld],
    payments: [{ id: 'p1', billId: 'b1', tenantId: 't1', amountPaisa: 1000000, method: 'bkash', date: '2026-10-12', note: '' }] });
  const d = RT.dashboard(s, '2026-10', ASOF);
  assert.equal(d.expected, 2258000);
  assert.equal(d.collected, 1000000);
  assert.equal(d.outstanding, 1258000);
  assert.ok(Math.abs(d.rate - 44.2929) < 0.01);
  assert.equal(d.arrears, 1258000 + 1358000);
  assert.equal(d.deposits, 2400000 + 1800000);
  assert.equal(d.overdueCount, 3); // b1 partial + b2 unpaid + bOld unpaid, all past due
  // empty month
  const d0 = RT.dashboard(stateWith(), '2026-10', ASOF);
  assert.deepEqual(d0, { expected: 0, collected: 0, outstanding: 0, rate: 0, arrears: 0, deposits: 0, overdueCount: 0 });
  // fully paid month: rate 100, overdue 0 for that bill
  const sPaid = stateWith({ tenants: [t1], bills: [b1],
    payments: [{ id: 'p1', billId: 'b1', tenantId: 't1', amountPaisa: 1358000, method: 'cash', date: '2026-10-09', note: '' }] });
  const dP = RT.dashboard(sPaid, '2026-10', '2026-10-09');
  assert.equal(dP.rate, 100);
  assert.equal(dP.overdueCount, 0);
});

test('dues: sorted by owed desc, excludes fully-paid tenants', () => {
  const t1 = tenant({ id: 't1', name: 'Rahim' });
  const t2 = tenant({ id: 't2', name: 'Karim', flat: '3B', rentPaisa: 900000, depositPaisa: 0, moveIn: '2026-02-01' });
  const t3 = tenant({ id: 't3', name: 'Ayesha', flat: '1A', rentPaisa: 500000, depositPaisa: 0, moveIn: '2026-01-01' });
  const b1 = bill({ id: 'b1', tenantId: 't1' });
  const b2 = bill({ id: 'b2', tenantId: 't2', month: '2026-10', rentPaisa: 900000,
    utilities: { gas: 0, electricity: 0, water: 0, service: 0 }, totalPaisa: 900000, dueDate: '2026-10-10' });
  const b3 = bill({ id: 'b3', tenantId: 't3', month: '2026-10', rentPaisa: 500000,
    utilities: { gas: 0, electricity: 0, water: 0, service: 0 }, totalPaisa: 500000, dueDate: '2026-10-10' });
  const s = stateWith({ tenants: [t1, t2, t3], bills: [b1, b2, b3],
    payments: [{ id: 'p1', billId: 'b1', tenantId: 't1', amountPaisa: 1000000, method: 'cash', date: '2026-10-05', note: '' }] });
  const dues = RT.dues(s);
  assert.equal(dues.length, 3);
  assert.equal(dues[0].tenant.name, 'Karim'); // 900,000 owed
  assert.equal(dues[0].owed, 900000);
  assert.equal(dues[1].tenant.name, 'Ayesha'); // 500,000
  assert.equal(dues[2].tenant.name, 'Rahim'); // 358,000 remaining
  assert.equal(dues[2].owed, 358000);
  // pay Karim in full -> drops out of dues
  s.payments.push({ id: 'p2', billId: 'b2', tenantId: 't2', amountPaisa: 900000, method: 'cash', date: '2026-10-06', note: '' });
  const dues2 = RT.dues(s);
  assert.equal(dues2.length, 2);
  assert.ok(!dues2.some(d => d.tenant.name === 'Karim'));
});

test('deposits: only active tenants counted', () => {
  const t1 = tenant({ id: 't1' });
  const t2 = tenant({ id: 't2', name: 'Karim', flat: '3B', rentPaisa: 900000, depositPaisa: 1800000, moveIn: '2026-02-01', status: 'vacated', vacateDate: '2026-10-01' });
  const d = RT.dashboard(stateWith({ tenants: [t1, t2] }), '2026-10', ASOF);
  assert.equal(d.deposits, 2400000);
});

// ---------- import validator matrix ----------
test('validateImport: accept round-trip; reject >=10 malformed cases', () => {
  const good = {
    version: 1,
    tenants: [tenant()],
    bills: [bill()],
    payments: [{ id: 'p1', billId: 'b1', tenantId: 't1', amountPaisa: 1000000, method: 'bkash', date: '2026-10-12', note: '' }]
  };
  assert.equal(RT.validateImport(good, ASOF).ok, true);
  assert.equal(RT.validateImport(RT.exportData(stateWith({ tenants: [tenant()], bills: [bill()], payments: [] })), ASOF).ok, true);

  const cases = [];
  cases.push(null);
  cases.push([]);
  cases.push('not an object');
  cases.push({ version: 1, tenants: [], bills: [] }); // missing payments
  cases.push({ version: 2, tenants: [], bills: [], payments: [] }); // wrong version
  cases.push({ version: 1, tenants: 'nope', bills: [], payments: [] }); // tenants not array
  cases.push({ version: 1, tenants: [tenant({ name: '' })], bills: [], payments: [] }); // empty name
  cases.push({ version: 1, tenants: [tenant({ rentPaisa: -100 })], bills: [], payments: [] }); // negative rent
  cases.push({ version: 1, tenants: [tenant({ rentPaisa: 10.5 })], bills: [], payments: [] }); // float paisa
  cases.push({ version: 1, tenants: [tenant({ moveIn: '2026-02-30' })], bills: [], payments: [] }); // bad date
  cases.push({ version: 1, tenants: [tenant({ status: 'vacated', vacateDate: '2025-01-01' })], bills: [], payments: [] }); // vacate before move-in
  cases.push({ version: 1, tenants: [], bills: [bill()], payments: [] }); // bill unknown tenant
  cases.push({ version: 1, tenants: [tenant()], bills: [bill({ totalPaisa: 1 })], payments: [] }); // total mismatch
  cases.push({ version: 1, tenants: [tenant()], bills: [bill()], payments: [{ id: 'p1', billId: 'bX', tenantId: 't1', amountPaisa: 100, method: 'cash', date: '2026-10-01', note: '' }] }); // payment unknown bill
  cases.push({ version: 1, tenants: [tenant()], bills: [bill()], payments: [{ id: 'p1', billId: 'b1', tenantId: 't1', amountPaisa: 1358001, method: 'cash', date: '2026-10-01', note: '' }] }); // payment over bill total
  cases.push({ version: 1, tenants: [tenant()], bills: [bill()], payments: [{ id: 'p1', billId: 'b1', tenantId: 't1', amountPaisa: 100, method: 'card', date: '2026-10-01', note: '' }] }); // bad method
  cases.push({ version: 1, tenants: [tenant()], bills: [bill()], payments: [{ id: 'p1', billId: 'b1', tenantId: 't1', amountPaisa: 100, method: 'cash', date: '2026-10-14', note: '' }] }); // future payment date
  cases.push({ version: 1, tenants: [tenant()], bills: [bill()], payments: [], hacked: true }); // unknown top-level key
  cases.push({ version: 1, tenants: [tenant(), tenant()], bills: [], payments: [] }); // duplicate tenant id
  cases.push({ version: 1, tenants: [tenant()], bills: [bill()], payments: [
    { id: 'p1', billId: 'b1', tenantId: 't1', amountPaisa: 1000000, method: 'cash', date: '2026-10-01', note: '' },
    { id: 'p2', billId: 'b1', tenantId: 't1', amountPaisa: 500000, method: 'cash', date: '2026-10-02', note: '' }
  ] }); // cumulative overpayment across two payments
  assert.ok(cases.length >= 10, 'need >=10 malformed cases, got ' + cases.length);
  cases.forEach(function (c, i) {
    const res = RT.validateImport(c, ASOF);
    assert.equal(res.ok, false, 'case ' + i + ' should be rejected: ' + JSON.stringify(c).slice(0, 120));
    assert.ok(res.errors.length > 0, 'case ' + i + ' should carry errors');
  });
});

test('exportData is a deep copy', () => {
  const s = stateWith({ tenants: [tenant()] });
  const e = RT.exportData(s);
  e.tenants[0].name = 'Changed';
  assert.equal(s.tenants[0].name, 'Rahim');
  assert.equal(e.version, 1);
});
