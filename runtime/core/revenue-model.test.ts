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
  assert.strictEqual(r.exceedsMicroCeiling, true); // 90000 > 83600 (2026)
  assert.strictEqual(r.exceedsVatFranchise, true); // 90000 > 37500 (2026)
});

// 2. micro ceiling + VAT franchise boundaries honest (2026 sourced figures).
t("micro-ceiling (83 600) + VAT-franchise (37 500) boundaries", () => {
  assert.strictEqual(TS.revenueScenario({ tjm: 500, billableDays: 167, chargeRatePct: 23 }).exceedsMicroCeiling, false); // 83500 <= 83600
  assert.strictEqual(TS.revenueScenario({ tjm: 500, billableDays: 168, chargeRatePct: 23 }).exceedsMicroCeiling, true);  // 84000 > 83600
  assert.strictEqual(TS.revenueScenario({ tjm: 500, billableDays: 75, chargeRatePct: 23 }).exceedsVatFranchise, false); // 37500 == threshold (not >)
  assert.strictEqual(TS.revenueScenario({ tjm: 500, billableDays: 76, chargeRatePct: 23 }).exceedsVatFranchise, true);  // 38000 > 37500
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

// 6. targetPlan — reproducible target math + capacity-exceeded honesty (the 100k€/month reality check).
t("targetPlan derives contracts/prospects + flags capacity exceeded (100k/month solo)", () => {
  // 100k€/month, avg contract 7500€, conversion 10% (HYP), 8 delivery days/contract, ~20 capacity days/month (solo).
  const p = TS.targetPlan({ targetRevenue: 100000, avgContractValue: 7500, conversionRate: 0.10, deliveryDaysPerContract: 8, capacityDaysPerPeriod: 20 });
  assert.strictEqual(p.ok, true);
  assert.strictEqual(p.contractsNeeded, 14);     // ceil(100000/7500)
  assert.strictEqual(p.prospectsNeeded, 140);    // ceil(14/0.10)
  assert.strictEqual(p.maxDeliverable, 2);       // floor(20/8) — solo can deliver ~2 contracts/month
  assert.strictEqual(p.capacityExceeded, true);  // 14 >> 2 ⇒ impossible solo (needs a team)
  assert.strictEqual(p.extraCapacityNeededContracts, 12);
});

// 7. targetPlan — a feasible solo monthly target is NOT flagged exceeded.
t("targetPlan — feasible solo target not flagged", () => {
  const p = TS.targetPlan({ targetRevenue: 15000, avgContractValue: 7500, conversionRate: 0.2, deliveryDaysPerContract: 8, capacityDaysPerPeriod: 20 });
  assert.strictEqual(p.contractsNeeded, 2);
  assert.strictEqual(p.maxDeliverable, 2);
  assert.strictEqual(p.capacityExceeded, false);
  assert.deepStrictEqual(TS.targetPlan({ targetRevenue: 15000, avgContractValue: 7500, conversionRate: 0.2, deliveryDaysPerContract: 8, capacityDaysPerPeriod: 20 }),
                         JS.targetPlan({ targetRevenue: 15000, avgContractValue: 7500, conversionRate: 0.2, deliveryDaysPerContract: 8, capacityDaysPerPeriod: 20 }));
});

// 8. adversarial hardening (FINANCIAL_CALC_HARDENING_V1 Lot C): empty/null/negative/non-finite refused
//    (never a fabricated 0); extreme values computed deterministically; conversion>1 not rejected (estimate).
t("adversarial inputs: invalid refused (no fabricated 0); extreme deterministic", () => {
  assert.strictEqual(TS.revenueScenario(null).ok, false);
  assert.strictEqual(TS.revenueScenario({}).ok, false);                                    // empty ⇒ refused, not 0
  assert.strictEqual(TS.revenueScenario({ tjm: -500, billableDays: 100, chargeRatePct: 23 }).ok, false); // negative
  assert.strictEqual(TS.revenueScenario({ tjm: Infinity, billableDays: 1, chargeRatePct: 0 }).ok, false); // non-finite
  assert.strictEqual(TS.revenueScenario({ tjm: NaN, billableDays: 1, chargeRatePct: 0 }).ok, false);
  const extreme = TS.revenueScenario({ tjm: 1e7, billableDays: 1e4, chargeRatePct: 50 });   // huge but finite
  assert.strictEqual(extreme.ok, true);
  assert.strictEqual(extreme.caBilled, 1e11);                                               // deterministic, no overflow error
  assert.strictEqual(extreme.exceedsMicroCeiling, true);
  // targetPlan: invalid refused; conversion>1 is an unusual-but-valid estimate (not fabricated), capacity honest
  assert.strictEqual(TS.targetPlan({ targetRevenue: 1, avgContractValue: 0, conversionRate: 0.2, deliveryDaysPerContract: 1, capacityDaysPerPeriod: 1 }).ok, false); // avg=0
  const p = TS.targetPlan({ targetRevenue: 10000, avgContractValue: 5000, conversionRate: 2, deliveryDaysPerContract: 1, capacityDaysPerPeriod: 20 });
  assert.strictEqual(p.ok, true); assert.strictEqual(p.contractsNeeded, 2); assert.strictEqual(p.prospectsNeeded, 1); // ceil(2/2)
  assert.deepStrictEqual(TS.revenueScenario({ tjm: -1, billableDays: 1, chargeRatePct: 1 }), JS.revenueScenario({ tjm: -1, billableDays: 1, chargeRatePct: 1 })); // parity on refusal
});

console.log(`\nALL PASS — revenue-model (${n} tests)`);
