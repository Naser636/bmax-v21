// @ts-nocheck — test harness (runtime/core): runs under tsx; migration-debt convention.
// revenue-model — pure rentability calculator: derived CA/charges/net, micro-ceiling flag, days-to-target,
// invalid-input guard, JS/TS parity. Fabricates nothing — outputs are conditional on explicit inputs.
const assert = require("assert");
const TS = require("./revenue-model.ts");
const JS = require("./revenue-model.js");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

// 1. derived figures are exact arithmetic of the inputs (no magic).
t("revenueScenario derives CA/charges/net from inputs", () => {
  const r = TS.revenueScenario({ tjm: 600, billableDays: 150, chargeRatePct: 23, fixedCostsAnnual: 3000 });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.caBilled, 90000);
  assert.strictEqual(r.charges, 20700);          // 90000 * 0.23
  assert.strictEqual(r.netBeforeIncomeTax, 66300); // 90000 - 20700 - 3000
  assert.strictEqual(r.exceedsMicroCeiling, true); // 90000 > 77700
});

// 2. micro ceiling boundary honest.
t("micro-ceiling flag at the 77 700 boundary", () => {
  assert.strictEqual(TS.revenueScenario({ tjm: 500, billableDays: 155, chargeRatePct: 23 }).exceedsMicroCeiling, false); // 77500 <= ceiling
  assert.strictEqual(TS.revenueScenario({ tjm: 500, billableDays: 156, chargeRatePct: 23 }).exceedsMicroCeiling, true);  // 78000 > ceiling
});

// 3. invalid inputs refused (no fabricated zero).
t("invalid inputs ⇒ ok:false with reason", () => {
  assert.strictEqual(TS.revenueScenario({ tjm: "x", billableDays: 10, chargeRatePct: 23 }).ok, false);
  assert.strictEqual(TS.revenueScenario(null).ok, false);
});

// 4. days-to-target rounds UP (burden not understated).
t("daysForTargetCa rounds up", () => {
  assert.strictEqual(TS.daysForTargetCa(100000, 600), 167); // ceil(166.67)
  assert.strictEqual(TS.daysForTargetCa(100000, 750), 134); // ceil(133.33)
  assert.strictEqual(TS.daysForTargetCa(100000, 0), null);
});

// 5. scenariosToTarget attaches days-to-target + meets flag; parity.
t("scenariosToTarget + JS/TS parity", () => {
  const variants = [
    { label: "prudent", tjm: 550, billableDays: 120, chargeRatePct: 23 },
    { label: "central", tjm: 670, billableDays: 150, chargeRatePct: 45, fixedCostsAnnual: 6000 },
    { label: "favorable", tjm: 800, billableDays: 160, chargeRatePct: 45, fixedCostsAnnual: 8000 },
  ];
  const out = TS.scenariosToTarget(100000, variants);
  assert.strictEqual(out.length, 3);
  assert.strictEqual(out[0].daysToTargetCa, 182); // ceil(100000/550)
  assert.strictEqual(out[1].meetsTargetCa, true); // 670*150=100500 >= 100000
  assert.strictEqual(out[0].meetsTargetCa, false); // 550*120=66000 < 100000
  assert.deepStrictEqual(TS.scenariosToTarget(100000, variants), JS.scenariosToTarget(100000, variants));
});

console.log(`\nALL PASS — revenue-model (${n} tests)`);
