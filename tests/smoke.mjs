/* rent-tracker-bd -- headless-Chrome smoke tests via raw CDP.
   Run: node tests/smoke.mjs
   Scenario (asof=2026-10-13): 2 tenants, Oct bills, partial + full payments,
   vacate, BN toggle + persistence, export/clear/import, malformed import,
   payment delete, 390px no-overflow, 0 console errors, 0 network requests. */
import { launchChrome, waitPort, newPage, CDP, sleep, waitFor } from "./cdp.mjs";

const PORT = 9400 + (process.pid % 100);
const PROFILE = "/tmp/rt-smoke-profile-" + process.pid;
let exitCode = 0;
const APP = "file:///home/hatch/workspace/muse-project-factory/builds/rent-tracker-bd/index.html?asof=2026-10-13";

let pass = 0, fail = 0;
function eq(name, actual, expected) {
  if (actual === expected) { pass++; }
  else { fail++; console.log("FAIL", name, "| actual:", JSON.stringify(actual), "| expected:", JSON.stringify(expected)); }
}
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log("FAIL", name); }
}
function contains(name, hay, needle) {
  ok(name, typeof hay === "string" && hay.includes(needle));
}
const J = (v) => JSON.stringify(v);

const chrome = launchChrome(PORT, PROFILE);
try {
  await waitPort(PORT);
  const target = await newPage(PORT, APP);
  const cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.connect();

  const consoleErrors = [], pageErrors = [], netReqs = [];
  cdp.on("Runtime.consoleAPICalled", (p) => {
    if (p.type === "error") consoleErrors.push(p.args.map(a => a.value || a.description || "").join(" "));
  });
  cdp.on("Runtime.exceptionThrown", (p) => pageErrors.push(JSON.stringify(p.exceptionDetails).slice(0, 300)));
  cdp.on("Log.entryAdded", (p) => { if (p.entry && p.entry.level === "error") consoleErrors.push(p.entry.text); });
  cdp.on("Network.requestWillBeSent", (p) => {
    if (p.request && p.request.url && !p.request.url.startsWith("file:") && !p.request.url.startsWith("data:")) {
      netReqs.push(p.request.url);
    }
  });
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  await cdp.send("Log.enable");
  await cdp.send("Network.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  await waitFor(cdp, "window.__RT_READY === true");
  const ev = (js) => cdp.eval(js);
  async function click(sel) {
    const done = await ev("(function(){var e=document.querySelector(" + J(sel) + "); if(!e) return false; e.click(); return true;})()");
    if (!done) throw new Error("click target missing: " + sel);
    await sleep(250);
  }
  async function setVal(id, val) {
    await ev("document.getElementById(" + J(id) + ").value = " + J(val) + ";");
  }
  async function text(id) { return await ev("document.getElementById(" + J(id) + ").textContent.trim()"); }
  async function tab(name) { await click("button[data-tab=" + JSON.stringify(name) + "]"); }

  // 1. boot + empty states
  eq("asof honored", await ev("window.__RT.asof"), "2026-10-13");
  eq("h1 EN", await text("h-title"), "House Rent Tracker");
  eq("lang button shows Bangla word", await text("langBtn"), "\u09ac\u09be\u0982\u09b2\u09be");
  eq("dash month", await text("dashMonthLabel"), "October 2026");
  contains("empty tenants", await ev("document.getElementById('tenantList').textContent"), "No tenants yet");
  contains("empty dues", await ev("document.getElementById('duesList').textContent"), "No dues");
  contains("empty bills", await ev("document.getElementById('billList').textContent"), "No bills yet");
  contains("empty history", await ev("document.getElementById('histList').textContent"), "No payments recorded yet");
  eq("dash expected=0", await text("vExpected"), "\u09f30.00");
  eq("dash collected=0", await text("vCollected"), "\u09f30.00");
  eq("dash rate=0.00%", await text("vRate"), "0.00%");

  // 2. add tenants
  await tab("tenants");
  await setVal("t-name", "Rahim"); await setVal("t-flat", "2A");
  await setVal("t-rent", "12000"); await setVal("t-deposit", "24000"); await setVal("t-movein", "2026-01-05");
  await click("#btn-add-tenant");
  await setVal("t-name", "Karim"); await setVal("t-flat", "3B");
  await setVal("t-rent", "9000"); await setVal("t-deposit", "18000"); await setVal("t-movein", "2026-02-01");
  await click("#btn-add-tenant");
  eq("2 tenant cards", await ev("document.querySelectorAll('#tenantList .item').length"), 2);
  contains("card shows rent", await ev("document.getElementById('tenantList').textContent"), "12,000.00");
  eq("deposits held 42,000", await text("vDeposits"), "\u09f342,000.00");

  // 3. inline validation: empty name rejected
  await click("#btn-add-tenant");
  eq("tenant error visible", await ev("getComputedStyle(document.getElementById('tenant-err')).display"), "block");
  contains("name required error", await text("tenant-err"), "Name is required");
  eq("still 2 tenants", await ev("document.querySelectorAll('#tenantList .item').length"), 2);
  await setVal("t-name", "Bad Rent"); await setVal("t-flat", "9Z");
  await setVal("t-rent", "-500"); await setVal("t-movein", "2026-01-01");
  await click("#btn-add-tenant");
  contains("negative rent error", await text("tenant-err"), "non-negative");
  eq("still 2 tenants after bad rent", await ev("document.querySelectorAll('#tenantList .item').length"), 2);

  // 4. generate Oct bills with utilities for Rahim
  await tab("bills");
  await setVal("bill-month", "2026-10");
  await ev("document.getElementById('bill-month').dispatchEvent(new Event('change'));");
  await sleep(200);
  const st1 = await ev("window.__RT.state()");
  const rahimId = st1.tenants.find(t => t.name === "Rahim").id;
  await ev("document.querySelector('input[data-tenant=" + JSON.stringify(rahimId) + "][data-field=\"gas\"]').value = '1080';");
  await ev("document.querySelector('input[data-tenant=" + JSON.stringify(rahimId) + "][data-field=\"service\"]').value = '500';");
  await click("#btn-generate-bills");
  eq("2 bills generated", await ev("document.querySelectorAll('#billList .item').length"), 2);
  contains("Rahim bill total 13,580", await ev("document.getElementById('billList').textContent"), "13,580.00");
  contains("Karim bill total 9,000", await ev("document.getElementById('billList').textContent"), "9,000.00");
  contains("due date 10th", await ev("document.getElementById('billList').textContent"), "2026-10-10");
  contains("overdue badge (asof past due)", await ev("document.getElementById('billList').textContent"), "OVERDUE");

  // 5. dashboard Oct
  await tab("dashboard");
  eq("expected 22,580", await text("vExpected"), "\u09f322,580.00");
  eq("collected 0", await text("vCollected"), "\u09f30.00");
  eq("outstanding 22,580", await text("vOutstanding"), "\u09f322,580.00");
  eq("rate 0", await text("vRate"), "0.00%");
  eq("arrears 22,580", await text("vArrears"), "\u09f322,580.00");
  eq("overdue count 2", await text("vOverdue"), "2");

  // 6. partial payment 10,000 on Rahim's bill
  await tab("payments");
  const st2 = await ev("window.__RT.state()");
  const rahimBill = st2.bills.find(b => b.tenantId === rahimId);
  await setVal("p-bill", rahimBill.id);
  await setVal("p-amount", "10000"); await setVal("p-method", "bkash"); await setVal("p-date", "2026-10-12");
  await click("#btn-add-payment");
  eq("1 payment in history", await ev("document.querySelectorAll('#histList .item').length"), 1);
  await tab("dashboard");
  eq("collected 10,000", await text("vCollected"), "\u09f310,000.00");
  eq("outstanding 12,580", await text("vOutstanding"), "\u09f312,580.00");
  eq("rate 44.29%", await text("vRate"), "44.29%");
  await tab("bills");
  contains("Rahim bill Partial", await ev("document.getElementById('billList').textContent"), "Partial");

  // 7. overpayment rejected, then pay remaining 3,580 -> Paid
  await tab("payments");
  await setVal("p-bill", rahimBill.id);
  await setVal("p-amount", "3581"); await setVal("p-date", "2026-10-12");
  await click("#btn-add-payment");
  contains("overpayment error", await text("pay-err"), "exceeds");
  eq("still 1 payment", await ev("document.querySelectorAll('#histList .item').length"), 1);
  await setVal("p-amount", "3580");
  await click("#btn-add-payment");
  eq("2 payments in history", await ev("document.querySelectorAll('#histList .item').length"), 2);
  await tab("dashboard");
  eq("collected 13,580", await text("vCollected"), "\u09f313,580.00");
  eq("outstanding 9,000", await text("vOutstanding"), "\u09f39,000.00");
  eq("rate 60.14%", await text("vRate"), "60.14%");
  eq("overdue count 1 (Karim only)", await text("vOverdue"), "1");
  await tab("bills");
  contains("Rahim bill Paid", await ev("document.getElementById('billList').textContent"), "Paid");

  // 8. future-date payment rejected on Karim's bill
  await tab("payments");
  const st3 = await ev("window.__RT.state()");
  const karimId = st3.tenants.find(t => t.name === "Karim").id;
  const karimBill = st3.bills.find(b => b.tenantId === karimId);
  await setVal("p-bill", karimBill.id);
  await setVal("p-amount", "100"); await setVal("p-date", "2026-10-14");
  await click("#btn-add-payment");
  contains("future date error", await text("pay-err"), "future");
  eq("still 2 payments", await ev("document.querySelectorAll('#histList .item').length"), 2);

  // 9. vacate Karim -> no Nov bill for Karim
  await tab("tenants");
  await ev("(function(){var items=[].slice.call(document.querySelectorAll('#tenantList .item')); var card=items.find(function(n){return n.textContent.includes('Karim');}); var btn=[].slice.call(card.querySelectorAll('button')).find(function(b){return b.textContent.trim()==='Vacate';}); btn.click(); return true;})()");
  await sleep(300);
  contains("Karim vacated", await ev("document.getElementById('tenantList').textContent"), "Vacated");
  await tab("bills");
  await setVal("bill-month", "2026-11");
  await ev("document.getElementById('bill-month').dispatchEvent(new Event('change'));");
  await sleep(200);
  await click("#btn-generate-bills");
  eq("3 bills total (Oct 2 + Nov 1)", await ev("document.querySelectorAll('#billList .item').length"), 3);
  const st4 = await ev("window.__RT.state()");
  eq("no Nov bill for Karim", st4.bills.filter(b => b.month === "2026-11" && b.tenantId === karimId).length, 0);
  eq("Nov bill for Rahim exists", st4.bills.filter(b => b.month === "2026-11" && b.tenantId === rahimId).length, 1);

  // 10. BN toggle: Bengali digits + persists across reload
  await ev("document.getElementById('langBtn').click();");
  await sleep(300);
  const bnVal = await text("vExpected");
  ok("BN digits in dashboard", /[\u09e6-\u09ef]/.test(bnVal));
  eq("lang button shows English in BN mode", await text("langBtn"), "English");
  await cdp.send("Page.reload");
  await waitFor(cdp, "window.__RT_READY === true");
  ok("BN persists after reload", /[\u09e6-\u09ef]/.test(await text("vExpected")));
  // back to EN for the rest
  await ev("document.getElementById('langBtn').click();");
  await sleep(300);
  eq("back to EN", await text("h-title"), "House Rent Tracker");

  // 11. export -> clear -> import round-trip
  const exported = await ev("window.__RT.exportJSON()");
  const parsed = JSON.parse(exported);
  eq("export tenants 2", parsed.tenants.length, 2);
  eq("export bills 3", parsed.bills.length, 3);
  eq("export payments 2", parsed.payments.length, 2);
  await tab("data");
  await setVal("clear-confirm", "DELETE");
  await click("#btn-clear-all");
  eq("cleared: 0 tenants", await ev("window.__RT.state().tenants.length"), 0);
  eq("cleared: 0 bills", await ev("window.__RT.state().bills.length"), 0);
  await setVal("import-json", exported);
  await click("#btn-import");
  contains("import success", await text("import-ok"), "successful");
  eq("imported tenants 2", await ev("window.__RT.state().tenants.length"), 2);
  eq("imported bills 3", await ev("window.__RT.state().bills.length"), 3);
  eq("imported payments 2", await ev("window.__RT.state().payments.length"), 2);
  await tab("dashboard");
  eq("dashboard restored expected 22,580", await text("vExpected"), "\u09f322,580.00");

  // 12. malformed import rejected, data intact
  await tab("data");
  await setVal("import-json", "{\"version\":1,\"tenants\":[{\"name\":\"\"}],\"bills\":[],\"payments\":[]}");
  await click("#btn-import");
  eq("malformed import error visible", await ev("getComputedStyle(document.getElementById('import-err')).display"), "block");
  eq("data intact after bad import", await ev("window.__RT.state().tenants.length"), 2);
  await setVal("import-json", "this is not json");
  await click("#btn-import");
  contains("non-JSON import error", await text("import-err"), "not valid JSON");
  eq("data intact after non-JSON", await ev("window.__RT.state().tenants.length"), 2);

  // 13. delete a payment -> bill status recomputed
  await tab("payments");
  await ev("(function(){var items=[].slice.call(document.querySelectorAll('#histList .item')); var row=items.find(function(n){return n.textContent.includes('10,000.00');}); var btn=row.querySelector('button'); btn.click(); return true;})()");
  await sleep(300);
  eq("1 payment left after delete", await ev("window.__RT.state().payments.length"), 1);
  await tab("dashboard");
  eq("collected drops to 3,580", await text("vCollected"), "\u09f33,580.00");
  await tab("bills");
  contains("Rahim bill back to Partial", await ev("document.getElementById('billList').textContent"), "Partial");

  // 14. 390px no horizontal overflow on all tabs
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(200);
  for (const t of ["dashboard", "tenants", "bills", "payments", "data"]) {
    await tab(t);
    const sw = await ev("document.documentElement.scrollWidth");
    ok("390px no overflow: " + t + " (scrollWidth=" + sw + ")", sw <= 390);
  }

  // 15. zero errors / zero network
  eq("console errors", consoleErrors.length, 0);
  eq("page errors", pageErrors.length, 0);
  eq("network requests (non-file)", netReqs.length, 0);
  if (consoleErrors.length) console.log("consoleErrors:", consoleErrors);
  if (pageErrors.length) console.log("pageErrors:", pageErrors);
  if (netReqs.length) console.log("netReqs:", netReqs);

  console.log("SMOKE PASS " + pass + " / FAIL " + fail);
  cdp.close();
  exitCode = fail ? 1 : 0;
} catch (e) {
  console.error("SMOKE ERROR:", e && e.stack ? e.stack : e);
  exitCode = 2;
} finally {
  try { chrome.kill("SIGKILL"); } catch (e) {}
}
await sleep(800);
process.exit(exitCode);
