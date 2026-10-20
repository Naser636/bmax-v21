// @ts-nocheck — test harness (runtime/core): runs under tsx; migration-debt convention.
// Lot D — financial INTEGRATION: the existing tools compose coherently through the money primitive.
// invoicing.computeTotals (float €, billed) -> economic-unit Quantity (exact cents) -> financial-reconciliation
// across pipeline/signed/invoiced/collected/margin, WITHOUT double-counting. Pure (no fs: payments/quote stores
// are NOT touched). No new engine — reuses economic-unit + financial-reconciliation + invoicing.
const assert = require("assert");
const INV = require("./invoicing.js");
const EU = require("./economic-unit.js");
const FR = require("./financial-reconciliation.js");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };
// bridge a float-euro total → exact economic-unit Quantity (cents). Rounding is the documented float↔minor boundary.
const toEUR = (euros) => EU.quantity("EUR", "ASSET", Math.round(euros * 100), 2);

// 1. a quote's billed total (computeTotals) bridges to the money primitive exactly.
t("invoicing.computeTotals → economic-unit bridge is exact", () => {
  const r = INV.computeTotals([{ description: "Audit", quantity: 1, unitPrice: 3500 }, { description: "Pilote", quantity: 1, unitPrice: 7500 }], 0, 0);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.total, 11000);
  assert.strictEqual(EU.format(toEUR(r.total)), "11000.00 EUR");
});

// 2. realistic quote→invoice→payment flow reconciles (collected ≤ invoiced ≤ signed), no double-count.
t("quote→invoice→payment flow reconciles; stages never summed", () => {
  const signed = INV.computeTotals([{ description: "Program", quantity: 1, unitPrice: 11000 }], 0, 0).total; // 11000
  const invoiced = INV.computeTotals([{ description: "Milestone 1", quantity: 1, unitPrice: 4000 }], 0, 0).total; // 4000 partial
  const collected = 4000; // paid in full for milestone 1
  const costs = 1500;
  const rec = FR.reconcile({ signed: toEUR(signed), invoiced: toEUR(invoiced), collected: toEUR(collected), costs: toEUR(costs), pipeline: toEUR(20000) });
  assert.strictEqual(rec.verdict, "OK", JSON.stringify(rec.checks));
  assert.ok(rec.checks.find((c) => c.name === "margin").reason.includes("2500.00 EUR")); // 4000 - 1500
  // anti-double-count: the ONE honest revenue basis, never a sum of stages.
  assert.strictEqual(FR.revenueFor({ signed: toEUR(signed), invoiced: toEUR(invoiced), collected: toEUR(collected) }, "collected").formatted, "4000.00 EUR");
  assert.strictEqual(FR.revenueFor({ collected: toEUR(collected) }, "total").ok, false);
});

// 3. acompte / partial invoicing is VALID (not an error); overpayment ⇒ AMBIGUOUS only with credits allowed.
t("acompte VALID; overpayment AMBIGUOUS with credits", () => {
  const acompte = FR.reconcile({ signed: toEUR(11000), invoiced: toEUR(3300), collected: toEUR(3300), costs: toEUR(1000) }); // 30% acompte
  assert.strictEqual(acompte.verdict, "OK");
  const overpay = FR.reconcile({ invoiced: toEUR(3300), collected: toEUR(3500) }); // client overpaid
  assert.strictEqual(overpay.verdict, "INCONSISTENT");
  assert.strictEqual(FR.reconcile({ invoiced: toEUR(3300), collected: toEUR(3500) }, { creditsAllowed: true }).verdict, "AMBIGUOUS");
});

// 4. contradictory billed>signed caught; currency mismatch between tools caught.
t("billed>signed caught; currency mismatch caught", () => {
  assert.strictEqual(FR.reconcile({ signed: toEUR(1000), invoiced: toEUR(1200) }).verdict, "INCONSISTENT");
  const usd = EU.quantity("USD", "ASSET", 120000, 2);
  assert.strictEqual(FR.reconcile({ signed: toEUR(1000), invoiced: usd }).verdict, "INCONSISTENT");
});

console.log(`\nALL PASS — financial-integration (${n} tests)`);
