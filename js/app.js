/* rent-tracker-bd -- DOM app. Pure ASCII. No network requests.
   All user-rendered strings go through textContent (no innerHTML with user input). */
'use strict';
(function () {
  var RT = window.RentTracker;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function showErr(box, errors) {
    clear(box);
    if (!errors || !errors.length) { box.classList.remove('show'); return; }
    box.textContent = errors.join('\n');
    box.classList.add('show');
  }
  function showOk(box, msg) {
    clear(box);
    if (!msg) { box.classList.remove('show'); return; }
    box.textContent = msg;
    box.classList.add('show');
  }

  // ---------- state ----------
  var asof = (function () {
    try {
      var q = new URLSearchParams(window.location.search).get('asof');
      if (q && RT.isDate(q)) return q;
    } catch (e) { /* fall through */ }
    return RT.todayISO();
  })();
  var lang = 'en';
  try { lang = window.localStorage.getItem(RT.LANG_KEY) || 'en'; } catch (e) { lang = 'en'; }
  if (lang !== 'bn') lang = 'en';

  function freshState() { return { version: 1, tenants: [], bills: [], payments: [] }; }
  var state = freshState();
  try {
    var raw = window.localStorage.getItem(RT.STORAGE_KEY);
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.tenants) && Array.isArray(parsed.bills) && Array.isArray(parsed.payments)) {
        state = parsed;
      }
    }
  } catch (e) { state = freshState(); }
  function save() {
    try { window.localStorage.setItem(RT.STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* storage full/blocked: keep in-memory */ }
  }
  function tenantById(id) { return state.tenants.find(function (t) { return t.id === id; }); }
  function billById(id) { return state.bills.find(function (b) { return b.id === id; }); }

  // ---------- i18n ----------
  function renderLang() {
    document.documentElement.lang = lang === 'bn' ? 'bn' : 'en';
    document.querySelectorAll('[data-i18n]').forEach(function (n) {
      n.textContent = RT.t(n.getAttribute('data-i18n'), lang);
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (n) {
      n.setAttribute('placeholder', RT.t(n.getAttribute('data-i18n-ph'), lang));
    });
    $('langBtn').textContent = lang === 'en' ? '\u09ac\u09be\u0982\u09b2\u09be' : 'English';
  }

  // ---------- tabs ----------
  function showTab(name) {
    document.querySelectorAll('nav.tabs button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === name);
    });
    document.querySelectorAll('[data-panel]').forEach(function (p) {
      p.classList.toggle('active', p.getAttribute('data-panel') === name);
    });
  }
  document.querySelectorAll('nav.tabs button').forEach(function (b) {
    b.addEventListener('click', function () { showTab(b.getAttribute('data-tab')); });
  });

  // ---------- dashboard ----------
  function renderDashboard() {
    var month = asof.slice(0, 7);
    $('dashMonthLabel').textContent = RT.monthLabel(month, lang);
    var d = RT.dashboard(state, month, asof);
    $('vExpected').textContent = RT.formatMoney(d.expected, lang);
    $('vCollected').textContent = RT.formatMoney(d.collected, lang);
    $('vOutstanding').textContent = RT.formatMoney(d.outstanding, lang);
    $('vRate').textContent = RT.formatRate(d.rate, lang);
    $('vArrears').textContent = RT.formatMoney(d.arrears, lang);
    $('vDeposits').textContent = RT.formatMoney(d.deposits, lang);
    $('vOverdue').textContent = RT.formatInt(d.overdueCount, lang);
    var list = $('duesList');
    clear(list);
    var dues = RT.dues(state);
    if (!dues.length) {
      list.appendChild(el('div', 'empty', RT.t('noDues', lang)));
      return;
    }
    dues.forEach(function (row) {
      var item = el('div', 'item');
      var head = el('div', 'dues-row');
      var left = el('div', 'title', row.tenant.name + ' (' + row.tenant.flat + ')');
      var right = el('div', 'owed', RT.formatMoney(row.owed, lang));
      head.appendChild(left); head.appendChild(right);
      item.appendChild(head);
      var detail = el('div', 'meta', row.bills.map(function (b) {
        var s = RT.billSummary(b, state.payments);
        return RT.monthLabel(b.month, lang) + ': ' + RT.formatMoney(s.remaining, lang) + ' ' + RT.t('remaining', lang);
      }).join(' | '));
      item.appendChild(detail);
      list.appendChild(item);
    });
  }

  // ---------- tenants ----------
  function renderTenants() {
    var list = $('tenantList');
    clear(list);
    if (!state.tenants.length) {
      list.appendChild(el('div', 'empty', RT.t('noTenants', lang)));
      return;
    }
    var sorted = state.tenants.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    sorted.forEach(function (tn) {
      var item = el('div', 'item');
      var head = el('div', 'head');
      var title = el('div', 'title', tn.name + ' - ' + tn.flat);
      var pill = el('span', 'pill ' + tn.status, RT.t(tn.status, lang));
      head.appendChild(title); head.appendChild(pill);
      item.appendChild(head);
      var meta = el('div', 'meta',
        RT.t('monthlyRent', lang) + ': ' + RT.formatMoney(tn.rentPaisa, lang) + ' | ' +
        RT.t('deposit', lang) + ': ' + RT.formatMoney(tn.depositPaisa, lang) + ' | ' +
        RT.t('moveIn', lang) + ': ' + tn.moveIn +
        (tn.status === 'vacated' ? ' | ' + RT.t('vacateDateLabel', lang) + ': ' + tn.vacateDate : ''));
      item.appendChild(meta);
      var actions = el('div', 'actions');
      if (tn.status === 'active') {
        var vac = el('button', 'small secondary', RT.t('vacate', lang));
        vac.addEventListener('click', function () {
          tn.status = 'vacated'; tn.vacateDate = asof;
          save(); renderAll();
        });
        actions.appendChild(vac);
      } else {
        var re = el('button', 'small secondary', RT.t('reactivate', lang));
        re.addEventListener('click', function () {
          tn.status = 'active'; tn.vacateDate = null;
          save(); renderAll();
        });
        actions.appendChild(re);
      }
      var del = el('button', 'small danger', RT.t('delete', lang));
      del.addEventListener('click', function () {
        state.tenants = state.tenants.filter(function (x) { return x.id !== tn.id; });
        state.bills = state.bills.filter(function (b) { return b.tenantId !== tn.id; });
        state.payments = state.payments.filter(function (p) { return p.tenantId !== tn.id; });
        save(); renderAll();
      });
      actions.appendChild(del);
      item.appendChild(actions);
      list.appendChild(item);
    });
  }

  $('btn-add-tenant').addEventListener('click', function () {
    var rent = RT.parseMoneyBDT($('t-rent').value);
    var depRaw = RT.trimStr($('t-deposit').value);
    var dep = depRaw === '' ? 0 : RT.parseMoneyBDT(depRaw);
    // null parse -> sentinel -1 so the validator reports it alongside other errors
    var tn = {
      id: RT.uid('t'),
      name: RT.trimStr($('t-name').value),
      flat: RT.trimStr($('t-flat').value),
      rentPaisa: rent == null ? -1 : rent,
      depositPaisa: dep == null ? -1 : dep,
      moveIn: $('t-movein').value,
      status: 'active', vacateDate: null
    };
    var v = RT.validateTenantRecord(tn, asof);
    if (v.length) { showErr($('tenant-err'), v); return; }
    state.tenants.push(tn);
    save(); renderAll();
    $('t-name').value = ''; $('t-flat').value = ''; $('t-rent').value = '';
    $('t-deposit').value = ''; $('t-movein').value = '';
    showErr($('tenant-err'), []);
  });

  // ---------- bills ----------
  function genMonth() {
    var v = $('bill-month').value;
    return RT.isMonth(v) ? v : asof.slice(0, 7);
  }
  function renderBillGen() {
    var month = genMonth();
    var box = $('bill-gen-rows');
    clear(box);
    var rows = state.tenants.filter(function (tn) {
      if (!RT.tenantEligibleForMonth(tn, month)) return false;
      return !state.bills.some(function (b) { return b.tenantId === tn.id && b.month === month; });
    });
    if (!rows.length) {
      box.appendChild(el('div', 'empty', RT.t('noBillable', lang)));
      return;
    }
    rows.forEach(function (tn) {
      var item = el('div', 'item');
      item.appendChild(el('div', 'title', tn.name + ' (' + tn.flat + ') - ' + RT.t('monthlyRent', lang) + ': ' + RT.formatMoney(tn.rentPaisa, lang)));
      var grid = el('div', 'util-grid');
      RT.UTILITY_KEYS.forEach(function (k) {
        var wrap = el('div');
        wrap.appendChild(el('label', null, RT.t(k, lang)));
        var inp = document.createElement('input');
        inp.type = 'text'; inp.inputMode = 'decimal';
        inp.value = '0';
        inp.setAttribute('data-tenant', tn.id);
        inp.setAttribute('data-field', k);
        wrap.appendChild(inp);
        grid.appendChild(wrap);
      });
      item.appendChild(grid);
      box.appendChild(item);
    });
  }
  $('bill-month').addEventListener('change', renderBillGen);

  $('btn-generate-bills').addEventListener('click', function () {
    var month = genMonth();
    var utils = {};
    var errs = [];
    document.querySelectorAll('#bill-gen-rows input[data-tenant]').forEach(function (inp) {
      var tid = inp.getAttribute('data-tenant');
      var field = inp.getAttribute('data-field');
      var raw = RT.trimStr(inp.value);
      var val = raw === '' ? 0 : RT.parseMoneyBDT(raw);
      if (val == null) errs.push('Utility "' + field + '" must be a valid non-negative number.');
      else { utils[tid] = utils[tid] || {}; utils[tid][field] = val; }
    });
    if (errs.length) { showErr($('bill-err'), errs); showOk($('bill-ok'), null); return; }
    var res = RT.generateBills(state, month, utils);
    if (res.errors.length) { showErr($('bill-err'), res.errors); showOk($('bill-ok'), null); return; }
    if (!res.bills.length) {
      showErr($('bill-err'), []);
      showOk($('bill-ok'), 'No new bills to generate for ' + RT.monthLabel(month, lang) + '.');
      return;
    }
    res.bills.forEach(function (b) { state.bills.push(b); });
    save(); renderAll();
    showErr($('bill-err'), []);
    showOk($('bill-ok'), res.bills.length + ' bill(s) generated for ' + RT.monthLabel(month, lang) + '.');
  });

  function renderBills() {
    var list = $('billList');
    clear(list);
    if (!state.bills.length) {
      list.appendChild(el('div', 'empty', RT.t('noBills', lang)));
      return;
    }
    var sorted = state.bills.slice().sort(function (a, b) {
      if (b.month !== a.month) return b.month < a.month ? -1 : 1;
      return (tenantById(a.tenantId) || { name: '' }).name.localeCompare((tenantById(b.tenantId) || { name: '' }).name);
    });
    sorted.forEach(function (b) {
      var tn = tenantById(b.tenantId) || { name: '?', flat: '' };
      var s = RT.billSummary(b, state.payments);
      var item = el('div', 'item');
      var head = el('div', 'head');
      head.appendChild(el('div', 'title', tn.name + ' (' + tn.flat + ') - ' + RT.monthLabel(b.month, lang)));
      var pills = el('div');
      var statusKey = s.status === 'Paid' ? 'statusPaid' : (s.status === 'Partial' ? 'statusPartial' : 'statusUnpaid');
      pills.appendChild(el('span', 'pill ' + s.status.toLowerCase(), RT.t(statusKey, lang)));
      if (RT.isOverdue(b, state.payments, asof)) pills.appendChild(el('span', 'pill overdue', RT.t('overdue', lang)));
      head.appendChild(pills);
      item.appendChild(head);
      var lines = RT.t('monthlyRent', lang) + ': ' + RT.formatMoney(b.rentPaisa, lang);
      RT.UTILITY_KEYS.forEach(function (k) {
        if (b.utilities[k] > 0) lines += ' | ' + RT.t(k, lang) + ': ' + RT.formatMoney(b.utilities[k], lang);
      });
      item.appendChild(el('div', 'bill-lines', lines));
      var meta = el('div', 'meta',
        RT.t('total', lang) + ': ' + RT.formatMoney(b.totalPaisa, lang) + ' | ' +
        RT.t('paid', lang) + ': ' + RT.formatMoney(s.paid, lang) + ' | ' +
        RT.t('remaining', lang) + ': ' + RT.formatMoney(s.remaining, lang) + ' | ' +
        RT.t('dueDate', lang) + ': ' + b.dueDate);
      item.appendChild(meta);
      var actions = el('div', 'actions');
      var payBtn = el('button', 'small', RT.t('pay', lang));
      payBtn.addEventListener('click', function () {
        showTab('payments');
        $('p-bill').value = b.id;
      });
      actions.appendChild(payBtn);
      var del = el('button', 'small danger', RT.t('delete', lang));
      del.addEventListener('click', function () {
        state.bills = state.bills.filter(function (x) { return x.id !== b.id; });
        state.payments = state.payments.filter(function (p) { return p.billId !== b.id; });
        save(); renderAll();
      });
      actions.appendChild(del);
      item.appendChild(actions);
      list.appendChild(item);
    });
  }

  // ---------- payments ----------
  function renderPaymentForm() {
    var sel = $('p-bill');
    var prev = sel.value;
    clear(sel);
    var sorted = state.bills.slice().sort(function (a, b) {
      if (b.month !== a.month) return b.month < a.month ? -1 : 1;
      return (tenantById(a.tenantId) || { name: '' }).name.localeCompare((tenantById(b.tenantId) || { name: '' }).name);
    });
    if (!sorted.length) {
      var o0 = document.createElement('option');
      o0.value = ''; o0.textContent = RT.t('noBills', lang);
      sel.appendChild(o0);
      sel.value = '';
      return;
    }
    sorted.forEach(function (b) {
      var tn = tenantById(b.tenantId) || { name: '?' };
      var s = RT.billSummary(b, state.payments);
      var o = document.createElement('option');
      o.value = b.id;
      o.textContent = tn.name + ' - ' + RT.monthLabel(b.month, lang) + ' - ' +
        RT.t('remaining', lang) + ': ' + RT.formatMoney(s.remaining, lang);
      sel.appendChild(o);
    });
    if (prev && billById(prev)) sel.value = prev;
    var msel = $('p-method');
    clear(msel);
    RT.METHODS.forEach(function (m) {
      var o = document.createElement('option');
      o.value = m; o.textContent = RT.METHOD_LABELS[m][lang === 'bn' ? 'bn' : 'en'];
      msel.appendChild(o);
    });
    if (!$('p-date').value) $('p-date').value = asof;
  }

  $('btn-add-payment').addEventListener('click', function () {
    var amt = RT.parseMoneyBDT($('p-amount').value);
    var errs = [];
    if (amt == null) errs.push('Payment amount must be a valid number greater than zero.');
    if (errs.length) { showErr($('pay-err'), errs); showOk($('pay-ok'), null); return; }
    var input = {
      billId: $('p-bill').value,
      amountPaisa: amt,
      method: $('p-method').value,
      date: $('p-date').value,
      note: RT.trimStr($('p-note').value)
    };
    var v = RT.validatePaymentInput(state, input, asof);
    if (v.length) { showErr($('pay-err'), v); showOk($('pay-ok'), null); return; }
    var bill = billById(input.billId);
    state.payments.push({
      id: RT.uid('p'), billId: input.billId, tenantId: bill.tenantId,
      amountPaisa: input.amountPaisa, method: input.method,
      date: input.date, note: input.note
    });
    save(); renderAll();
    $('p-amount').value = ''; $('p-note').value = '';
    showErr($('pay-err'), []);
    showOk($('pay-ok'), 'Payment recorded.');
  });

  function renderHistory() {
    var ft = $('f-pay-tenant');
    var fm = $('f-pay-month');
    var prevT = ft.value, prevM = fm.value;
    clear(ft); clear(fm);
    var oAll = document.createElement('option'); oAll.value = ''; oAll.textContent = RT.t('allTenants', lang);
    ft.appendChild(oAll);
    state.tenants.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (tn) {
      var o = document.createElement('option'); o.value = tn.id; o.textContent = tn.name;
      ft.appendChild(o);
    });
    if (prevT) ft.value = prevT;
    var oAllM = document.createElement('option'); oAllM.value = ''; oAllM.textContent = RT.t('allMonths', lang);
    fm.appendChild(oAllM);
    var months = [];
    state.bills.forEach(function (b) { if (months.indexOf(b.month) === -1) months.push(b.month); });
    months.sort().reverse().forEach(function (m) {
      var o = document.createElement('option'); o.value = m; o.textContent = RT.monthLabel(m, lang);
      fm.appendChild(o);
    });
    if (prevM) fm.value = prevM;

    var list = $('histList');
    clear(list);
    var rows = state.payments.filter(function (p) {
      if (ft.value && p.tenantId !== ft.value) return false;
      if (fm.value) {
        var b = billById(p.billId);
        if (!b || b.month !== fm.value) return false;
      }
      return true;
    }).sort(function (a, b) { return b.date < a.date ? -1 : (b.date > a.date ? 1 : 0); });
    if (!rows.length) {
      list.appendChild(el('div', 'empty', RT.t('noPayments', lang)));
      return;
    }
    rows.forEach(function (p) {
      var tn = tenantById(p.tenantId) || { name: '?' };
      var b = billById(p.billId);
      var item = el('div', 'item');
      var head = el('div', 'head');
      head.appendChild(el('div', 'title', tn.name + ' - ' + RT.formatMoney(p.amountPaisa, lang)));
      head.appendChild(el('div', 'meta', p.date + ' | ' + RT.METHOD_LABELS[p.method][lang === 'bn' ? 'bn' : 'en'] +
        (b ? ' | ' + RT.monthLabel(b.month, lang) : '')));
      item.appendChild(head);
      if (p.note) item.appendChild(el('div', 'meta', p.note));
      var actions = el('div', 'actions');
      var del = el('button', 'small danger', RT.t('delete', lang));
      del.addEventListener('click', function () {
        state.payments = state.payments.filter(function (x) { return x.id !== p.id; });
        save(); renderAll();
      });
      actions.appendChild(del);
      item.appendChild(actions);
      list.appendChild(item);
    });
  }
  $('f-pay-tenant').addEventListener('change', renderHistory);
  $('f-pay-month').addEventListener('change', renderHistory);

  // ---------- data ----------
  $('btn-export').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(RT.exportData(state), null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'rent-tracker-bd-export.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });
  $('btn-import').addEventListener('click', function () {
    var parsed;
    try {
      parsed = JSON.parse($('import-json').value);
    } catch (e) {
      showErr($('import-err'), ['Import failed: not valid JSON.']);
      showOk($('import-ok'), null);
      return;
    }
    var res = RT.validateImport(parsed, asof);
    if (!res.ok) { showErr($('import-err'), res.errors); showOk($('import-ok'), null); return; }
    state = { version: 1, tenants: parsed.tenants, bills: parsed.bills, payments: parsed.payments };
    save(); renderAll();
    $('import-json').value = '';
    showErr($('import-err'), []);
    showOk($('import-ok'), RT.t('importOk', lang));
  });
  $('btn-clear-all').addEventListener('click', function () {
    if ($('clear-confirm').value !== 'DELETE') {
      showErr($('clear-err'), ['Type DELETE exactly to confirm clearing all data.']);
      return;
    }
    state = freshState();
    save(); renderAll();
    $('clear-confirm').value = '';
    showErr($('clear-err'), []);
  });

  // ---------- language ----------
  $('langBtn').addEventListener('click', function () {
    lang = lang === 'en' ? 'bn' : 'en';
    try { window.localStorage.setItem(RT.LANG_KEY, lang); } catch (e) { /* ignore */ }
    renderAll();
  });

  // ---------- render all ----------
  function renderAll() {
    renderLang();
    renderDashboard();
    renderTenants();
    renderBillGen();
    renderBills();
    renderPaymentForm();
    renderHistory();
  }

  // defaults
  $('t-movein').value = asof;
  $('bill-month').value = asof.slice(0, 7);
  $('p-date').value = asof;
  renderAll();
  showTab('dashboard');

  window.__RT = {
    state: function () { return state; },
    asof: asof,
    exportJSON: function () { return JSON.stringify(RT.exportData(state)); },
    showTab: showTab,
    ready: true
  };
  window.__RT_READY = true;
})();
