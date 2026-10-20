// @ts-nocheck — test harness (runtime/core): runs under tsx; migration-debt convention.
// financial-reconciliation — anti-double-count + honest stage reconciliation over economic-unit money.
// Adversarial: empty/missing, unit mismatch, contradictory stages, duplicates, negative margin, overpayment;
// valid cases not falsely flagged; anti-double-count guard; JS/TS parity.
const assert = require("assert");
const TS = require("./financial-reconciliation.ts");
const JS = require("./financial-reconciliation.js");
const EU = require("./economic-unit.js");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };
const eur = (minor) => EU.quantity("EUR", "ASSET", minor, 2);   // cents
const usd = (minor) => EU.quantity("USD", "ASSET", minor, 2);

// 1. valid partial pipeline (collected ≤ invoiced ≤ signed) ⇒ OK, no false flag.
t("valid partial stages ⇒ OK", () => {
  const r = TS.reconcile({ pipeline: eur(500000), signed: eur(300000), invoiced: eur(200000), collected: eur(150000), costs: eur(50000) });
  assert.strictEqual(r.verdict, "OK", JSON.stringify(r.checks));
  assert.ok(r.checks.find((c) => c.name === "margin").reason.includes("1500.00 EUR")); // 2000 - 500
});

// 2. anti-double-count: no "total of stages"; revenueFor returns ONE basis, refuses a sum basis.
t("anti-double-count: revenueFor one basis; refuses summing", () => {
  const stages = { signed: eur(300000), invoiced: eur(200000), collected: eur(150000) };
  assert.strictEqual(TS.revenueFor(stages, "collected").formatted, "1500.00 EUR");
  assert.strictEqual(TS.revenueFor(stages, "signed").formatted, "3000.00 EUR");
  assert.strictEqual(TS.revenueFor(stages, "total").ok, false);        // cannot sum stages
  assert.ok(/double-count/.test(TS.revenueFor(stages, "sum").reason));
  assert.strictEqual(TS.reconcile(stages).checks.some((c) => c.name === "no-cross-stage-sum"), true);
});

// 3. contradictory: collected > invoiced ⇒ INCONSISTENT; with creditsAllowed ⇒ AMBIGUOUS (not an error).
t("collected>invoiced ⇒ INCONSISTENT; credits ⇒ AMBIGUOUS", () => {
  const bad = { invoiced: eur(100000), collected: eur(150000) };
  assert.strictEqual(TS.reconcile(bad).verdict, "INCONSISTENT");
  assert.strictEqual(TS.reconcile(bad, { creditsAllowed: true }).verdict, "AMBIGUOUS");
});

// 4. invoiced > signed ⇒ INCONSISTENT; scopeChangeAllowed ⇒ AMBIGUOUS.
t("invoiced>signed ⇒ INCONSISTENT; scope-change ⇒ AMBIGUOUS", () => {
  const bad = { signed: eur(100000), invoiced: eur(120000) };
  assert.strictEqual(TS.reconcile(bad).verdict, "INCONSISTENT");
  assert.strictEqual(TS.reconcile(bad, { scopeChangeAllowed: true }).verdict, "AMBIGUOUS");
});

// 5. unit mismatch (EUR vs USD) ⇒ INCONSISTENT (no implicit FX).
t("unit mismatch ⇒ INCONSISTENT (no implicit FX)", () => {
  const r = TS.reconcile({ signed: eur(300000), invoiced: usd(200000) });
  assert.strictEqual(r.verdict, "INCONSISTENT");
  assert.ok(r.checks.some((c) => /unit mismatch|no implicit FX/.test(c.reason)));
});

// 6. missing operand ⇒ INCOMPLETE (unknown ≠ 0); empty input ⇒ INCOMPLETE, never OK.
t("missing/empty ⇒ INCOMPLETE (unknown never 0)", () => {
  assert.strictEqual(TS.reconcile({ collected: eur(100000) }).verdict, "INCOMPLETE"); // no invoiced/signed/costs
  assert.strictEqual(TS.reconcile({}).verdict, "INCOMPLETE");
  assert.strictEqual(TS.reconcile(null).verdict, "INCOMPLETE");
  assert.strictEqual(TS.revenueFor({}, "collected").ok, false); // not coerced to 0
});

// 7. duplicate transactions ⇒ DUPLICATE (highest precedence).
t("duplicate txn ids ⇒ DUPLICATE", () => {
  const r = TS.reconcile({ signed: eur(300000), invoiced: eur(200000), collected: eur(150000), costs: eur(10000) },
    { txns: [{ id: "INV-1" }, { id: "INV-2" }, { id: "INV-1" }] });
  assert.strictEqual(r.verdict, "DUPLICATE");
  assert.deepStrictEqual(r.duplicates, ["INV-1"]);
});

// 8. negative margin reported (loss), not hidden, still VALID structurally.
t("negative margin reported (loss, not hidden)", () => {
  const r = TS.reconcile({ invoiced: eur(100000), costs: eur(150000) });
  const m = r.checks.find((c) => c.name === "margin");
  assert.ok(/NEGATIVE/.test(m.reason) && m.reason.includes("-500.00 EUR"));
});

// 9. malformed money (float/non-Quantity) is refused by the primitive (not silently accepted); parity.
t("malformed money refused; JS/TS parity", () => {
  const bad = { signed: 3000, invoiced: { minor: 1.5 } }; // raw number + float minor (invalid)
  const r = TS.reconcile(bad);
  assert.notStrictEqual(r.verdict, "OK"); // cannot validate non-Quantities
  const stages = { signed: eur(300000), invoiced: eur(200000), collected: eur(150000), costs: eur(50000) };
  assert.deepStrictEqual(TS.reconcile(stages), JS.reconcile(stages));
  assert.deepStrictEqual(TS.reconcile({ invoiced: eur(1), collected: eur(2) }, { creditsAllowed: true }),
                         JS.reconcile({ invoiced: eur(1), collected: eur(2) }, { creditsAllowed: true }));
  assert.deepStrictEqual(TS.revenueFor(stages, "total"), JS.revenueFor(stages, "total"));
});

console.log(`\nALL PASS — financial-reconciliation (${n} tests)`);
