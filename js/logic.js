/* rent-tracker-bd -- pure logic (no DOM). Testable in node.
   Money is stored as integer paisa to avoid float error.
   All Bengali text is written as \uXXXX escapes (pure-ASCII sources). */
'use strict';

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.RentTracker = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  var APP_ID = 'rent-tracker-bd';
  var STORAGE_KEY = 'rent-tracker-bd-v1';
  var LANG_KEY = 'rent-tracker-bd-lang';
  var METHODS = ['cash', 'bkash', 'nagad', 'rocket', 'bank'];
  var UTILITY_KEYS = ['gas', 'electricity', 'water', 'service'];
  var MAX_MONEY_BDT = 100000000; // sanity cap: 10 crore BDT
  var MAX_NAME = 100, MAX_FLAT = 50, MAX_NOTE = 200;

  var MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  var MONTHS_BN = ['\u099c\u09be\u09a8\u09c1\u09af\u09bc\u09be\u09b0\u09bf',
    '\u09ab\u09c7\u09ac\u09cd\u09b0\u09c1\u09af\u09bc\u09be\u09b0\u09bf',
    '\u09ae\u09be\u09b0\u09cd\u099a', '\u098f\u09aa\u09cd\u09b0\u09bf\u09b2',
    '\u09ae\u09c7', '\u099c\u09c1\u09a8', '\u099c\u09c1\u09b2\u09be\u0987',
    '\u0986\u0997\u09b8\u09cd\u099f', '\u09b8\u09c7\u09aa\u09cd\u099f\u09c7\u09ae\u09cd\u09ac\u09b0',
    '\u0985\u0995\u09cd\u099f\u09cb\u09ac\u09b0', '\u09a8\u09ad\u09c7\u09ae\u09cd\u09ac\u09b0',
    '\u09a1\u09bf\u09b8\u09c7\u09ae\u09cd\u09ac\u09b0'];

  // method -> {en, bn}
  var METHOD_LABELS = {
    cash: { en: 'Cash', bn: '\u0995\u09cd\u09af\u09be\u09b6' },
    bkash: { en: 'bKash', bn: '\u09ac\u09bf\u0995\u09be\u09b6' },
    nagad: { en: 'Nagad', bn: '\u09a8\u0997\u09a6' },
    rocket: { en: 'Rocket', bn: '\u09b0\u0995\u09c7\u099f' },
    bank: { en: 'Bank', bn: '\u09ac\u09cd\u09af\u09be\u0982\u0995' }
  };

  // UI strings: en / bn
  var I18N = {
    appTitle: { en: 'House Rent Tracker', bn: '\u09ac\u09be\u09a1\u09bc\u09bf \u09ad\u09be\u09a1\u09bc\u09be \u099f\u09cd\u09b0\u09cd\u09af\u09be\u0995\u09be\u09b0' },
    tabDashboard: { en: 'Dashboard', bn: '\u09a1\u09cd\u09af\u09be\u09b6\u09ac\u09cb\u09b0\u09cd\u09a1' },
    tabTenants: { en: 'Tenants', bn: '\u09ad\u09be\u09a1\u09bc\u09be\u099f\u09bf\u09af\u09bc\u09be' },
    tabBills: { en: 'Bills', bn: '\u09ac\u09bf\u09b2' },
    tabPayments: { en: 'Payments', bn: '\u09aa\u09c7\u09ae\u09c7\u09a8\u09cd\u099f' },
    tabData: { en: 'Data', bn: '\u09a1\u09c7\u099f\u09be' },
    dashMonth: { en: 'Month', bn: '\u09ae\u09be\u09b8' },
    expected: { en: 'Expected this month', bn: '\u098f\u0987 \u09ae\u09be\u09b8\u09c7 \u09aa\u09cd\u09b0\u09a4\u09cd\u09af\u09be\u09b6\u09bf\u09a4' },
    collected: { en: 'Collected this month', bn: '\u098f\u0987 \u09ae\u09be\u09b8\u09c7 \u0986\u09a6\u09be\u09af\u09bc\u0995\u09c3\u09a4' },
    outstanding: { en: 'Outstanding this month', bn: '\u098f\u0987 \u09ae\u09be\u09b8\u09c7 \u09ac\u0995\u09c7\u09af\u09bc\u09be' },
    rate: { en: 'Collection rate', bn: '\u0986\u09a6\u09be\u09af\u09bc\u09c7\u09b0 \u09b9\u09be\u09b0' },
    arrears: { en: 'Total arrears (all months)', bn: '\u09ae\u09cb\u099f \u09ac\u0995\u09c7\u09af\u09bc\u09be (\u09b8\u09ac \u09ae\u09be\u09b8)' },
    depositsHeld: { en: 'Advance deposits held (active)', bn: '\u09b9\u09be\u09a4\u09c7 \u0986\u099b\u09c7 \u0985\u0997\u09cd\u09b0\u09bf\u09ae \u099c\u09ae\u09be (\u09b8\u0995\u09cd\u09b0\u09bf\u09af\u09bc)' },
    overdueCount: { en: 'Overdue bills', bn: '\u09ae\u09c7\u09af\u09bc\u09be\u09a6\u0989\u09a4\u09cd\u09a4\u09c0\u09b0\u09cd\u09a3 \u09ac\u09bf\u09b2' },
    duesTitle: { en: 'Dues by tenant', bn: '\u09ad\u09be\u09a1\u09bc\u09be\u099f\u09bf\u09af\u09bc\u09be \u0985\u09a8\u09c1\u09af\u09be\u09af\u09bc\u09c0 \u09ac\u0995\u09c7\u09af\u09bc\u09be' },
    noDues: { en: 'No dues. Everyone is paid up.', bn: '\u0995\u09cb\u09a8\u09cb \u09ac\u0995\u09c7\u09af\u09bc\u09be \u09a8\u09c7\u0987\u0964' },
    addTenant: { en: 'Add tenant', bn: '\u09ad\u09be\u09a1\u09bc\u09be\u099f\u09bf\u09af\u09bc\u09be \u09af\u09cb\u0997 \u0995\u09b0\u09c1\u09a8' },
    name: { en: 'Name', bn: '\u09a8\u09be\u09ae' },
    flat: { en: 'Flat / unit', bn: '\u09ab\u09cd\u09b2\u09cd\u09af\u09be\u099f / \u0987\u0989\u09a8\u09bf\u099f' },
    monthlyRent: { en: 'Monthly rent (BDT)', bn: '\u09ae\u09be\u09b8\u09bf\u0995 \u09ad\u09be\u09a1\u09bc\u09be (\u099f\u09be\u0995\u09be)' },
    deposit: { en: 'Advance deposit (BDT)', bn: '\u0985\u0997\u09cd\u09b0\u09bf\u09ae \u099c\u09ae\u09be (\u099f\u09be\u0995\u09be)' },
    moveIn: { en: 'Move-in date', bn: '\u0993\u09a0\u09be\u09b0 \u09a4\u09be\u09b0\u09bf\u0996' },
    saveTenant: { en: 'Save tenant', bn: '\u09b8\u0982\u09b0\u0995\u09cd\u09b7\u09a3 \u0995\u09b0\u09c1\u09a8' },
    noTenants: { en: 'No tenants yet. Add your first tenant above.', bn: '\u098f\u0996\u09a8\u09cb \u0995\u09cb\u09a8\u09cb \u09ad\u09be\u09a1\u09bc\u09be\u099f\u09bf\u09af\u09bc\u09be \u09a8\u09c7\u0987\u0964 \u0989\u09aa\u09b0\u09c7 \u09aa\u09cd\u09b0\u09a5\u09ae \u09ad\u09be\u09a1\u09bc\u09be\u099f\u09bf\u09af\u09bc\u09be \u09af\u09cb\u0997 \u0995\u09b0\u09c1\u09a8\u0964' },
    active: { en: 'Active', bn: '\u09b8\u0995\u09cd\u09b0\u09bf\u09af\u09bc' },
    vacated: { en: 'Vacated', bn: '\u099b\u09c7\u09a1\u09bc\u09c7 \u09a6\u09bf\u09af\u09bc\u09c7\u099b\u09c7\u09a8' },
    vacate: { en: 'Vacate', bn: '\u099b\u09c7\u09a1\u09bc\u09c7 \u09a6\u09bf\u09a8' },
    reactivate: { en: 'Reactivate', bn: '\u0986\u09ac\u09be\u09b0 \u09b8\u0995\u09cd\u09b0\u09bf\u09af\u09bc \u0995\u09b0\u09c1\u09a8' },
    delete: { en: 'Delete', bn: '\u09ae\u09c1\u099b\u09c1\u09a8' },
    vacateDateLabel: { en: 'Vacated on', bn: '\u099b\u09c7\u09a1\u09bc\u09c7\u099b\u09c7\u09a8' },
    genTitle: { en: 'Generate bills for a month', bn: '\u098f\u0995 \u09ae\u09be\u09b8\u09c7\u09b0 \u09ac\u09bf\u09b2 \u09a4\u09c8\u09b0\u09bf \u0995\u09b0\u09c1\u09a8' },
    billMonth: { en: 'Bill month', bn: '\u09ac\u09bf\u09b2\u09c7\u09b0 \u09ae\u09be\u09b8' },
    gas: { en: 'Gas', bn: '\u0997\u09cd\u09af\u09be\u09b8' },
    electricity: { en: 'Electricity', bn: '\u09ac\u09bf\u09a6\u09cd\u09af\u09c1\u09ce' },
    water: { en: 'Water', bn: '\u09aa\u09be\u09a8\u09bf' },
    service: { en: 'Service charge', bn: '\u09b8\u09be\u09b0\u09cd\u09ad\u09bf\u09b8 \u099a\u09be\u09b0\u09cd\u099c' },
    generateBills: { en: 'Generate bills', bn: '\u09ac\u09bf\u09b2 \u09a4\u09c8\u09b0\u09bf \u0995\u09b0\u09c1\u09a8' },
    noBillable: { en: 'No tenants need a bill for this month (all billed already, or none eligible).', bn: '\u098f\u0987 \u09ae\u09be\u09b8\u09c7 \u0995\u09be\u09b0\u09cb \u09ac\u09bf\u09b2 \u09aa\u09cd\u09b0\u09af\u09bc\u09cb\u099c\u09a8 \u09a8\u09c7\u0987\u0964' },
    allBills: { en: 'All bills', bn: '\u09b8\u09ac \u09ac\u09bf\u09b2' },
    noBills: { en: 'No bills yet. Generate bills for a month above.', bn: '\u098f\u0996\u09a8\u09cb \u0995\u09cb\u09a8\u09cb \u09ac\u09bf\u09b2 \u09a8\u09c7\u0987\u0964 \u0989\u09aa\u09b0\u09c7 \u09a5\u09c7\u0995\u09c7 \u09ac\u09bf\u09b2 \u09a4\u09c8\u09b0\u09bf \u0995\u09b0\u09c1\u09a8\u0964' },
    total: { en: 'Total', bn: '\u09ae\u09cb\u099f' },
    paid: { en: 'Paid', bn: '\u09aa\u09b0\u09bf\u09b6\u09cb\u09a7\u09bf\u09a4' },
    remaining: { en: 'Remaining', bn: '\u09ac\u09be\u0995\u09bf' },
    dueDate: { en: 'Due', bn: '\u09b6\u09c7\u09b7 \u09a4\u09be\u09b0\u09bf\u0996' },
    overdue: { en: 'OVERDUE', bn: '\u09ae\u09c7\u09af\u09bc\u09be\u09a6\u0989\u09a4\u09cd\u09a4\u09c0\u09b0\u09cd\u09a3' },
    statusPaid: { en: 'Paid', bn: '\u09aa\u09b0\u09bf\u09b6\u09cb\u09a7' },
    statusPartial: { en: 'Partial', bn: '\u0986\u0982\u09b6\u09bf\u0995' },
    statusUnpaid: { en: 'Unpaid', bn: '\u0985\u09aa\u09b0\u09bf\u09b6\u09cb\u09a7\u09bf\u09a4' },
    pay: { en: 'Pay', bn: '\u09aa\u09c7 \u0995\u09b0\u09c1\u09a8' },
    recordPayment: { en: 'Record a payment', bn: '\u09aa\u09c7\u09ae\u09c7\u09a8\u09cd\u099f \u09b0\u09c7\u0995\u09b0\u09cd\u09a1 \u0995\u09b0\u09c1\u09a8' },
    bill: { en: 'Bill', bn: '\u09ac\u09bf\u09b2' },
    amount: { en: 'Amount (BDT)', bn: '\u099f\u09be\u0995\u09be\u09b0 \u09aa\u09b0\u09bf\u09ae\u09be\u09a3 (\u099f\u09be\u0995\u09be)' },
    method: { en: 'Method', bn: '\u09aa\u09a6\u09cd\u09a7\u09a4\u09bf' },
    date: { en: 'Date', bn: '\u09a4\u09be\u09b0\u09bf\u0996' },
    note: { en: 'Note (optional)', bn: '\u09a8\u09cb\u099f (\u0990\u099a\u09cd\u099b\u09bf\u0995)' },
    savePayment: { en: 'Save payment', bn: '\u09aa\u09c7\u09ae\u09c7\u09a8\u09cd\u099f \u09b8\u0982\u09b0\u0995\u09cd\u09b7\u09a3 \u0995\u09b0\u09c1\u09a8' },
    history: { en: 'Payment history', bn: '\u09aa\u09c7\u09ae\u09c7\u09a8\u09cd\u099f\u09c7\u09b0 \u0987\u09a4\u09bf\u09b9\u09be\u09b8' },
    noPayments: { en: 'No payments recorded yet.', bn: '\u098f\u0996\u09a8\u09cb \u0995\u09cb\u09a8\u09cb \u09aa\u09c7\u09ae\u09c7\u09a8\u09cd\u099f \u09a8\u09c7\u0987\u0964' },
    allTenants: { en: 'All tenants', bn: '\u09b8\u09ac \u09ad\u09be\u09a1\u09bc\u09be\u099f\u09bf\u09af\u09bc\u09be' },
    allMonths: { en: 'All months', bn: '\u09b8\u09ac \u09ae\u09be\u09b8' },
    exportTitle: { en: 'Export', bn: '\u098f\u0995\u09cd\u09b8\u09aa\u09cb\u09b0\u09cd\u099f' },
    exportBtn: { en: 'Download JSON export', bn: '\u099c\u09c7\u09b8\u0985\u09a8 \u098f\u0995\u09cd\u09b8\u09aa\u09cb\u09b0\u09cd\u099f \u09a1\u09be\u0989\u09a8\u09b2\u09cb\u09a1 \u0995\u09b0\u09c1\u09a8' },
    importTitle: { en: 'Import', bn: '\u0987\u09ae\u09aa\u09cb\u09b0\u09cd\u099f' },
    importHint: { en: 'Paste a JSON export from this app. Invalid data is rejected and your current data stays untouched.', bn: '\u098f\u0987 \u0985\u09cd\u09af\u09be\u09aa\u09c7\u09b0 \u099c\u09c7\u09b8\u0985\u09a8 \u098f\u0995\u09cd\u09b8\u09aa\u09cb\u09b0\u09cd\u099f \u098f\u0996\u09be\u09a8\u09c7 \u09aa\u09c7\u09b8\u09cd\u099f \u0995\u09b0\u09c1\u09a8\u0964 \u0985\u09ac\u09c8\u09a7 \u09a1\u09c7\u099f\u09be \u09ac\u09be\u09a4\u09bf\u09b2 \u09b9\u09ac\u09c7 \u098f\u09ac\u0982 \u0986\u09aa\u09a8\u09be\u09b0 \u09ac\u09b0\u09cd\u09a4\u09ae\u09be\u09a8 \u09a1\u09c7\u099f\u09be \u0985\u099f\u09c1\u099f \u09a5\u09be\u0995\u09ac\u09c7\u0964' },
    importBtn: { en: 'Import JSON', bn: '\u099c\u09c7\u09b8\u0985\u09a8 \u0987\u09ae\u09aa\u09cb\u09b0\u09cd\u099f \u0995\u09b0\u09c1\u09a8' },
    importOk: { en: 'Import successful.', bn: '\u0987\u09ae\u09aa\u09cb\u09b0\u09cd\u099f \u09b8\u09ab\u09b2 \u09b9\u09af\u09bc\u09c7\u099b\u09c7\u0964' },
    clearTitle: { en: 'Danger zone', bn: '\u09b8\u09a4\u09b0\u09cd\u0995\u09a4\u09be \u0985\u099e\u09cd\u099a\u09b2' },
    clearHint: { en: 'Type DELETE in the box to erase all tenants, bills and payments.', bn: '\u09b8\u09ac \u09a1\u09c7\u099f\u09be \u09ae\u09c1\u099b\u09a4\u09c7 \u09ac\u0995\u09cd\u09b8\u09c7 DELETE \u09b2\u09bf\u0996\u09c1\u09a8\u0964' },
    clearBtn: { en: 'Clear all data', bn: '\u09b8\u09ac \u09a1\u09c7\u099f\u09be \u09ae\u09c1\u099b\u09c1\u09a8' },
    footer: { en: 'Personal tracker - not accounting software, not legal advice. All data stays in this browser.', bn: '\u09ac\u09cd\u09af\u0995\u09cd\u09a4\u09bf\u0997\u09a4 \u099f\u09cd\u09b0\u09cd\u09af\u09be\u0995\u09be\u09b0 - \u098f\u099f\u09bf \u09b9\u09bf\u09b8\u09be\u09ac\u09b0\u0995\u09cd\u09b7\u09a3 \u09b8\u09ab\u099f\u099f\u09cb\u09af\u09bc\u09be\u09b0 \u09a8\u09af\u09bc, \u0986\u0987\u09a8\u09bf \u09aa\u09b0\u09be\u09ae\u09b0\u09cd\u09b6\u0993 \u09a8\u09af\u09bc\u0964 \u09b8\u09ac \u09a1\u09c7\u099f\u09be \u098f\u0987 \u09ac\u09cd\u09b0\u09be\u0989\u099c\u09be\u09b0\u09c7\u0987 \u09a5\u09be\u0995\u09c7\u0964' }
  };

  function t(key, lang) {
    var entry = I18N[key];
    if (!entry) return key;
    return entry[lang === 'bn' ? 'bn' : 'en'];
  }

  // ---------- utils ----------
  function uid(prefix) {
    return prefix + Date.now().toString(36) + Math.floor(Math.random() * 1679616).toString(36);
  }
  function trimStr(s) { return (s == null ? '' : String(s)).trim(); }
  function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }
  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }
  function hasOnlyKeys(obj, allowed) {
    return Object.keys(obj).every(function (k) { return allowed.indexOf(k) !== -1; });
  }
  function todayISO(d) {
    d = d || new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }
  function monthKey(iso) { return String(iso).slice(0, 7); }
  function isMonth(s) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(trimStr(s)); }
  function isDate(s) {
    var t = trimStr(s);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
    var p = t.split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2]);
    return d.getFullYear() === p[0] && d.getMonth() === p[1] - 1 && d.getDate() === p[2];
  }
  function daysInMonth(ym) {
    var y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
    return new Date(y, m, 0).getDate();
  }
  function monthEnd(ym) { return ym + '-' + String(daysInMonth(ym)).padStart(2, '0'); }
  function monthStart(ym) { return ym + '-01'; }

  // ---------- money ----------
  // Parse a BDT amount string ("12,580" / "13580.50" / "") -> integer paisa or null.
  // Empty string means "not provided" -> null (caller decides the default).
  function parseMoneyBDT(s) {
    if (typeof s === 'number') {
      if (!isFinite(s) || s < 0 || s > MAX_MONEY_BDT) return null;
      var rounded = Math.round(s * 100);
      if (Math.abs(s * 100 - rounded) > 0.001) return null;
      return rounded;
    }
    var t = trimStr(s).replace(/,/g, '').replace(/^\u09f3/, '');
    if (t === '') return null;
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
    var parts = t.split('.');
    var taka = Number(parts[0]);
    if (taka > MAX_MONEY_BDT) return null;
    var paisa = parts[1] ? Number((parts[1] + '00').slice(0, 2)) : 0;
    return taka * 100 + paisa;
  }
  function toBnDigits(s) {
    var map = ['\u09e6', '\u09e7', '\u09e8', '\u09e9', '\u09ea',
      '\u09eb', '\u09ec', '\u09ed', '\u09ee', '\u09ef'];
    return String(s).replace(/[0-9]/g, function (d) { return map[Number(d)]; });
  }
  function formatGrouped(paisa) {
    var neg = paisa < 0;
    var abs = Math.abs(paisa);
    var taka = Math.floor(abs / 100), p = abs % 100;
    var t = String(taka).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + t + '.' + String(p).padStart(2, '0');
  }
  // "\u09f312,580.00" in EN, Bengali digits in BN.
  function formatMoney(paisa, lang) {
    return '\u09f3' + (lang === 'bn' ? toBnDigits(formatGrouped(paisa)) : formatGrouped(paisa));
  }
  function formatInt(n, lang) {
    var s = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return lang === 'bn' ? toBnDigits(s) : s;
  }
  function formatRate(rate, lang) {
    var s = rate.toFixed(2) + '%';
    return lang === 'bn' ? toBnDigits(s) : s;
  }
  function monthLabel(ym, lang) {
    if (!isMonth(ym)) return ym;
    var y = ym.slice(0, 4), m = Number(ym.slice(5, 7));
    if (lang === 'bn') return MONTHS_BN[m - 1] + ' ' + toBnDigits(y);
    return MONTHS_EN[m - 1] + ' ' + y;
  }

  // ---------- validation ----------
  function validateTenantRecord(tn, asof) {
    var errors = [];
    if (!isPlainObject(tn)) return ['Tenant must be an object.'];
    if (!hasOnlyKeys(tn, ['id', 'name', 'flat', 'rentPaisa', 'depositPaisa', 'moveIn', 'status', 'vacateDate'])) {
      errors.push('Tenant has unknown fields.');
    }
    if (typeof tn.id !== 'string' || trimStr(tn.id) === '') errors.push('Tenant id is required.');
    if (typeof tn.name !== 'string' || trimStr(tn.name) === '') errors.push('Name is required.');
    else if (tn.name.length > MAX_NAME) errors.push('Name is too long (max 100 characters).');
    if (typeof tn.flat !== 'string' || trimStr(tn.flat) === '') errors.push('Flat / unit is required.');
    else if (tn.flat.length > MAX_FLAT) errors.push('Flat / unit is too long (max 50 characters).');
    if (!isInt(tn.rentPaisa) || tn.rentPaisa < 0 || tn.rentPaisa > MAX_MONEY_BDT * 100) {
      errors.push('Monthly rent must be a non-negative number.');
    }
    if (!isInt(tn.depositPaisa) || tn.depositPaisa < 0 || tn.depositPaisa > MAX_MONEY_BDT * 100) {
      errors.push('Advance deposit must be a non-negative number.');
    }
    if (!isDate(tn.moveIn)) errors.push('Move-in date must be a valid date (YYYY-MM-DD).');
    else if (asof && tn.moveIn > asof) errors.push('Move-in date cannot be in the future.');
    if (tn.status !== 'active' && tn.status !== 'vacated') errors.push('Status must be Active or Vacated.');
    if (tn.status === 'vacated') {
      if (!isDate(tn.vacateDate)) errors.push('Vacate date must be a valid date (YYYY-MM-DD).');
      else {
        if (isDate(tn.moveIn) && tn.vacateDate < tn.moveIn) errors.push('Vacate date cannot be before move-in date.');
        if (asof && tn.vacateDate > asof) errors.push('Vacate date cannot be in the future.');
      }
    } else if (tn.vacateDate !== null && tn.vacateDate !== undefined) {
      errors.push('An active tenant must not have a vacate date.');
    }
    return errors;
  }

  function validateBillRecord(b, tenantsById) {
    var errors = [];
    if (!isPlainObject(b)) return ['Bill must be an object.'];
    if (!hasOnlyKeys(b, ['id', 'tenantId', 'month', 'rentPaisa', 'utilities', 'totalPaisa', 'dueDate'])) {
      errors.push('Bill has unknown fields.');
    }
    if (typeof b.id !== 'string' || trimStr(b.id) === '') errors.push('Bill id is required.');
    if (typeof b.tenantId !== 'string' || !tenantsById[b.tenantId]) errors.push('Bill refers to an unknown tenant.');
    if (!isMonth(b.month)) errors.push('Bill month must be YYYY-MM.');
    if (!isInt(b.rentPaisa) || b.rentPaisa < 0) errors.push('Bill rent must be a non-negative integer (paisa).');
    if (!isPlainObject(b.utilities) || !hasOnlyKeys(b.utilities, UTILITY_KEYS)) {
      errors.push('Bill utilities must contain exactly gas, electricity, water, service.');
    } else {
      UTILITY_KEYS.forEach(function (k) {
        if (!isInt(b.utilities[k]) || b.utilities[k] < 0) errors.push('Utility "' + k + '" must be a non-negative integer (paisa).');
      });
    }
    if (isPlainObject(b.utilities) && UTILITY_KEYS.every(function (k) { return isInt(b.utilities[k]); })) {
      var expect = b.rentPaisa + UTILITY_KEYS.reduce(function (s, k) { return s + b.utilities[k]; }, 0);
      if (b.totalPaisa !== expect) errors.push('Bill total does not equal rent + utilities.');
    }
    if (!isInt(b.totalPaisa) || b.totalPaisa < 0) errors.push('Bill total must be a non-negative integer (paisa).');
    if (b.dueDate !== b.month + '-10') errors.push('Bill due date must be the 10th of the bill month.');
    return errors;
  }

  // Validate a payment record against bills + payments already accepted (cumulative cap).
  function validatePaymentRecord(p, billsById, acceptedPayments, asof) {
    var errors = [];
    if (!isPlainObject(p)) return ['Payment must be an object.'];
    if (!hasOnlyKeys(p, ['id', 'billId', 'tenantId', 'amountPaisa', 'method', 'date', 'note'])) {
      errors.push('Payment has unknown fields.');
    }
    if (typeof p.id !== 'string' || trimStr(p.id) === '') errors.push('Payment id is required.');
    var bill = billsById[p.billId];
    if (typeof p.billId !== 'string' || !bill) errors.push('Payment refers to an unknown bill.');
    if (bill && p.tenantId !== bill.tenantId) errors.push('Payment tenant does not match the bill tenant.');
    if (!isInt(p.amountPaisa) || p.amountPaisa <= 0) errors.push('Payment amount must be greater than zero.');
    if (METHODS.indexOf(p.method) === -1) errors.push('Payment method is invalid.');
    if (!isDate(p.date)) errors.push('Payment date must be a valid date (YYYY-MM-DD).');
    else if (asof && p.date > asof) errors.push('Payment date cannot be in the future.');
    if (typeof p.note !== 'string') errors.push('Payment note must be a string.');
    else if (p.note.length > MAX_NOTE) errors.push('Payment note is too long (max 200 characters).');
    if (bill && isInt(p.amountPaisa) && p.amountPaisa > 0) {
      var paid = acceptedPayments.filter(function (q) { return q.billId === p.billId; })
        .reduce(function (s, q) { return s + q.amountPaisa; }, 0);
      if (paid + p.amountPaisa > bill.totalPaisa) {
        errors.push('Payment exceeds the remaining balance of the bill.');
      }
    }
    return errors;
  }

  // Validate a payment input from the form (no id yet) against state.
  function validatePaymentInput(state, input, asof) {
    var bill = (state.bills || []).find(function (b) { return b.id === input.billId; });
    var errors = [];
    if (!bill) errors.push('Choose a bill to pay.');
    if (!isInt(input.amountPaisa) || input.amountPaisa <= 0) errors.push('Payment amount must be greater than zero.');
    if (METHODS.indexOf(input.method) === -1) errors.push('Payment method is invalid.');
    if (!isDate(input.date)) errors.push('Payment date must be a valid date (YYYY-MM-DD).');
    else if (asof && input.date > asof) errors.push('Payment date cannot be in the future.');
    if (typeof input.note !== 'string' || input.note.length > MAX_NOTE) errors.push('Payment note is too long (max 200 characters).');
    if (bill && isInt(input.amountPaisa) && input.amountPaisa > 0) {
      var paid = (state.payments || []).filter(function (q) { return q.billId === bill.id; })
        .reduce(function (s, q) { return s + q.amountPaisa; }, 0);
      if (paid + input.amountPaisa > bill.totalPaisa) {
        errors.push('Payment exceeds the remaining balance of the bill (' + formatMoney(bill.totalPaisa - paid, 'en') + ' left).');
      }
    }
    return errors;
  }

  // Strict whole-file import validation. Returns {ok, errors}.
  function validateImport(data, asof) {
    var errors = [];
    if (!isPlainObject(data)) return { ok: false, errors: ['Import data must be a JSON object.'] };
    if (!hasOnlyKeys(data, ['version', 'tenants', 'bills', 'payments'])) {
      errors.push('Import data has unknown top-level fields.');
    }
    if (data.version !== 1) errors.push('Import version must be 1.');
    if (!Array.isArray(data.tenants)) errors.push('Import "tenants" must be an array.');
    if (!Array.isArray(data.bills)) errors.push('Import "bills" must be an array.');
    if (!Array.isArray(data.payments)) errors.push('Import "payments" must be an array.');
    if (errors.length) return { ok: false, errors: errors };

    var seenT = {}, seenB = {}, seenP = {};
    var tenantsById = {};
    (data.tenants || []).forEach(function (tn, i) {
      if (seenT[tn && tn.id]) errors.push('Duplicate tenant id at tenants[' + i + '].');
      seenT[tn && tn.id] = true;
      validateTenantRecord(tn, asof).forEach(function (e) { errors.push('tenants[' + i + ']: ' + e); });
      if (tn && tn.id) tenantsById[tn.id] = tn;
    });
    var billsById = {};
    (data.bills || []).forEach(function (b, i) {
      if (seenB[b && b.id]) errors.push('Duplicate bill id at bills[' + i + '].');
      seenB[b && b.id] = true;
      validateBillRecord(b, tenantsById).forEach(function (e) { errors.push('bills[' + i + ']: ' + e); });
      if (b && b.id) billsById[b.id] = b;
    });
    var accepted = [];
    (data.payments || []).forEach(function (p, i) {
      if (seenP[p && p.id]) errors.push('Duplicate payment id at payments[' + i + '].');
      seenP[p && p.id] = true;
      var errs = validatePaymentRecord(p, billsById, accepted, asof);
      errs.forEach(function (e) { errors.push('payments[' + i + ']: ' + e); });
      if (!errs.length) accepted.push(p);
    });
    return { ok: errors.length === 0, errors: errors };
  }

  // ---------- derived state ----------
  function billSummary(bill, payments) {
    var paid = (payments || []).filter(function (p) { return p.billId === bill.id; })
      .reduce(function (s, p) { return s + p.amountPaisa; }, 0);
    var remaining = bill.totalPaisa - paid;
    var status = paid >= bill.totalPaisa ? 'Paid' : (paid > 0 ? 'Partial' : 'Unpaid');
    return { paid: paid, remaining: remaining, status: status };
  }
  function isOverdue(bill, payments, asof) {
    return asof > bill.dueDate && billSummary(bill, payments).status !== 'Paid';
  }
  // Eligible for a bill in month M: moved in on/before M ends, and
  // (still active OR vacated on/after the 1st of M).
  function tenantEligibleForMonth(tn, month) {
    if (!isMonth(month)) return false;
    if (tn.moveIn > monthEnd(month)) return false;
    if (tn.status === 'active') return true;
    if (tn.status === 'vacated' && isDate(tn.vacateDate)) return tn.vacateDate >= monthStart(month);
    return false;
  }
  // Build bills for `month` for eligible tenants without an existing bill.
  // utilsByTenant: { tenantId: {gas, electricity, water, service} } in paisa.
  function generateBills(state, month, utilsByTenant) {
    var errors = [];
    var out = [];
    if (!isMonth(month)) return { bills: out, errors: ['Bill month must be YYYY-MM.'] };
    utilsByTenant = utilsByTenant || {};
    (state.tenants || []).forEach(function (tn) {
      if (!tenantEligibleForMonth(tn, month)) return;
      var dup = (state.bills || []).some(function (b) { return b.tenantId === tn.id && b.month === month; });
      if (dup) return;
      var raw = utilsByTenant[tn.id] || {};
      var utils = {};
      var bad = false;
      UTILITY_KEYS.forEach(function (k) {
        var v = raw[k] == null ? 0 : raw[k];
        if (!isInt(v) || v < 0) { errors.push('Utility "' + k + '" for ' + tn.name + ' must be a non-negative amount.'); bad = true; }
        utils[k] = v;
      });
      if (bad) return;
      var total = tn.rentPaisa + UTILITY_KEYS.reduce(function (s, k) { return s + utils[k]; }, 0);
      out.push({
        id: uid('b'), tenantId: tn.id, month: month, rentPaisa: tn.rentPaisa,
        utilities: utils, totalPaisa: total, dueDate: month + '-10'
      });
    });
    return { bills: out, errors: errors };
  }

  function dashboard(state, month, asof) {
    var bills = (state.bills || []).filter(function (b) { return b.month === month; });
    var byId = {};
    bills.forEach(function (b) { byId[b.id] = b; });
    var expected = bills.reduce(function (s, b) { return s + b.totalPaisa; }, 0);
    var collected = (state.payments || []).filter(function (p) { return byId[p.billId]; })
      .reduce(function (s, p) { return s + p.amountPaisa; }, 0);
    var outstanding = expected - collected;
    var rate = expected > 0 ? (collected / expected) * 100 : 0;
    var arrears = (state.bills || []).reduce(function (s, b) {
      var rem = billSummary(b, state.payments).remaining;
      return s + (rem > 0 ? rem : 0);
    }, 0);
    var deposits = (state.tenants || []).filter(function (tn) { return tn.status === 'active'; })
      .reduce(function (s, tn) { return s + tn.depositPaisa; }, 0);
    var overdueCount = (state.bills || []).filter(function (b) { return isOverdue(b, state.payments, asof); }).length;
    return {
      expected: expected, collected: collected, outstanding: outstanding, rate: rate,
      arrears: arrears, deposits: deposits, overdueCount: overdueCount
    };
  }

  function dues(state) {
    var out = [];
    (state.tenants || []).forEach(function (tn) {
      var bills = (state.bills || []).filter(function (b) { return b.tenantId === tn.id; });
      var owed = bills.reduce(function (s, b) {
        var rem = billSummary(b, state.payments).remaining;
        return s + (rem > 0 ? rem : 0);
      }, 0);
      if (owed > 0) out.push({ tenant: tn, owed: owed, bills: bills });
    });
    out.sort(function (a, b) {
      if (b.owed !== a.owed) return b.owed - a.owed;
      return a.tenant.name.localeCompare(b.tenant.name);
    });
    return out;
  }

  function exportData(state) {
    return {
      version: 1,
      tenants: JSON.parse(JSON.stringify(state.tenants || [])),
      bills: JSON.parse(JSON.stringify(state.bills || [])),
      payments: JSON.parse(JSON.stringify(state.payments || []))
    };
  }

  return {
    APP_ID: APP_ID, STORAGE_KEY: STORAGE_KEY, LANG_KEY: LANG_KEY,
    METHODS: METHODS, UTILITY_KEYS: UTILITY_KEYS,
    METHOD_LABELS: METHOD_LABELS, I18N: I18N, t: t,
    uid: uid, trimStr: trimStr, todayISO: todayISO, monthKey: monthKey,
    isMonth: isMonth, isDate: isDate, daysInMonth: daysInMonth,
    monthEnd: monthEnd, monthStart: monthStart,
    parseMoneyBDT: parseMoneyBDT, toBnDigits: toBnDigits,
    formatGrouped: formatGrouped, formatMoney: formatMoney,
    formatInt: formatInt, formatRate: formatRate, monthLabel: monthLabel,
    validateTenantRecord: validateTenantRecord,
    validateBillRecord: validateBillRecord,
    validatePaymentRecord: validatePaymentRecord,
    validatePaymentInput: validatePaymentInput,
    validateImport: validateImport,
    billSummary: billSummary, isOverdue: isOverdue,
    tenantEligibleForMonth: tenantEligibleForMonth,
    generateBills: generateBills, dashboard: dashboard, dues: dues,
    exportData: exportData
  };
});
