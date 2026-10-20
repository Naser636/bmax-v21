// @ts-nocheck — test harness (runtime/core): runs under tsx; migration-debt convention.
// unit-economics — separates ODG active / wait / residual-human / elapsed time; honest per-engagement margin;
// compute NEVER free; revenue ≠ profit; capacity = binding constraint; reuses economic-unit (no parallel money math).
const assert = require("assert");
const JS = require("./unit-economics.js");
const TS = require("./unit-economics.ts");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

const BASE = {
  priceMinor: 850000,
  directCosts: [{ label: "compute/API", minor: 4000, basis: "ESTIMATED" }, { label: "software", minor: 1000, basis: "ESTIMATED" }],
  time: { odgActiveMin: 180, odgWaitMin: 60, residualHumanMin: 90, basis: { odgActive: "ESTIMATED", residualHuman: "ESTIMATED" }, totalElapsedMin: 330 },
  rates: { odgActiveCostPerHourMinor: 500, humanCostPerHourMinor: 8000 },
  capacity: { humanHoursPerDay: 4, odgActiveHoursPerDay: 10, odgParallelism: 3, rateLimitPerDay: 20, workingDaysPerMonth: 21 },
};

// 1 — the four time buckets are kept separate (never summed into human time).
t("four time buckets separated", () => {
  const r = JS.computeUnitEconomics(BASE);
  assert.strictEqual(r.time.odgActiveMin, 180);
  assert.strictEqual(r.time.residualHumanMin, 90);
  assert.strictEqual(r.time.odgWaitMin, 60);
  assert.strictEqual(r.time.totalElapsedMin, 330);
});

// 2 — margins: direct + ODG marginal subtracted; residual human reported SEPARATELY; revenue ≠ profit.
t("contribution margin excludes human cost; marginIncludingHuman subtracts it", () => {
  const r = JS.computeUnitEconomics(BASE);
  assert.strictEqual(r.costs.direct, "50.00 EUR");
  assert.strictEqual(r.costs.odgActiveMarginal, "15.00 EUR");  // 3h * €5
  assert.strictEqual(r.costs.residualHuman, "120.00 EUR");     // 1.5h * €80
  assert.strictEqual(r.contributionMargin, "8435.00 EUR");     // 8500 - 50 - 15
  assert.strictEqual(r.marginIncludingHuman, "8315.00 EUR");   // - 120
  assert.notStrictEqual(r.price, r.contributionMargin);        // revenue ≠ profit
});

// 3 — ODG active time is NOT free: omitting the rate warns and does not silently zero real compute cost.
t("compute NOT free — missing ODG rate ⇒ warning", () => {
  const r = JS.computeUnitEconomics({ ...BASE, rates: { humanCostPerHourMinor: 8000 } });
  assert.ok(r.warnings.some((w) => /must not be assumed free/i.test(w)));
  assert.strictEqual(r.costs.odgActiveNotFree, false);
});

// 4 — capacity is the BINDING constraint: human approval gates throughput below ODG's capability.
t("binding constraint = scarce residual-human time (not ODG)", () => {
  const r = JS.computeUnitEconomics(BASE);
  assert.strictEqual(r.capacity.perDayBounds.odgBound, 10);   // ODG could do 10/day
  assert.strictEqual(r.capacity.perDayBounds.humanBound, 2);  // human gates to 2/day
  assert.strictEqual(r.capacity.bindingConstraint, "humanBound");
  assert.strictEqual(r.capacity.deliveriesPerDay, 2);
  assert.strictEqual(r.capacity.deliveriesPerMonth, 42);
});

// 5 — fully-automatable engagement (zero residual human) ⇒ ODG/rate-limit bound, margin-per-human-hour null.
t("zero residual human ⇒ ODG-bound, human-hour ratio null", () => {
  const r = JS.computeUnitEconomics({ ...BASE, time: { ...BASE.time, residualHumanMin: 0 } });
  assert.strictEqual(r.capacity.bindingConstraint, "odgBound");
  assert.strictEqual(r.capacity.deliveriesPerDay, 10);
  assert.strictEqual(r.perHour.marginPerResidualHumanHour, null); // no human time ⇒ no ratio (not a fabricated number)
});

// 6 — per-hour scarce-resource view computed (derived ratio).
t("margin per residual-human-hour (scarce resource)", () => {
  const r = JS.computeUnitEconomics(BASE);
  assert.strictEqual(r.perHour.marginPerResidualHumanHour, "5543.33 EUR"); // 8315 / 1.5h
  assert.strictEqual(r.perHour.marginPerOdgActiveHour, "2811.67 EUR");     // 8435 / 3h
});

// 7 — JS/TS parity.
t("JS/TS parity", () => {
  assert.deepStrictEqual(JS.computeUnitEconomics(BASE), TS.computeUnitEconomics(BASE));
});

// 8 — LOT A ENFORCEMENT: a per-step breakdown makes the autonomous-execution policy AUTHORITATIVE — ODG work
//     is never charged as human; residual-human = genuinely-human only; automatable-left-to-human is flagged.
t("steps[] ⇒ policy derives time split + flags fictional human time", () => {
  const r = JS.computeUnitEconomics({
    priceMinor: 850000,
    steps: [
      { label: "generate the CRA evidence pack", minutes: 120, imputedTo: "HUMAN" },  // ODG-automatable, mis-imputed
      { label: "run independent verification", minutes: 60 },                          // ODG
      { label: "client signs the engagement letter", minutes: 30, mandatory: "signature" }, // genuinely human
    ],
    rates: { odgActiveCostPerHourMinor: 500, humanCostPerHourMinor: 8000 },
    capacity: { humanHoursPerDay: 4, odgActiveHoursPerDay: 10, odgParallelism: 1, workingDaysPerMonth: 21 },
  });
  assert.strictEqual(r.time.odgActiveMin, 180);       // 120 + 60 (ODG), not charged to human
  assert.strictEqual(r.time.residualHumanMin, 30);    // only the signature
  assert.ok(r.policyAudit && r.policyAudit.misimputedHumanMinutes === 120);
  assert.ok(r.warnings.some((w) => /AUTOMATABLE_LEFT_TO_HUMAN/.test(w)));
});

// 9 — LOT B OMITTED COST: a direct cost with no finite amount is flagged, never silently €0.
t("omitted direct cost ⇒ OMITTED_COST warning (not silent €0)", () => {
  const r = JS.computeUnitEconomics({ priceMinor: 850000, directCosts: [{ label: "API", minor: 4000 }, { label: "subcontractor" /* no minor */ }], time: { odgActiveMin: 60, basis: { odgActive: "MEASURED" } }, rates: { odgActiveCostPerHourMinor: 500 } });
  assert.ok(r.warnings.some((w) => /OMITTED_COST/.test(w) && /subcontractor/.test(w)));
  assert.strictEqual(r.costs.direct, "40.00 EUR"); // only the finite cost counted
});

// 10 — LOT B UNPROVEN CAPACITY: ESTIMATED durations ⇒ capacity.basis ESTIMATED + CAPACITY_UNPROVEN; MEASURED ⇒ clean.
t("capacity basis reflects measurement; unproven durations flagged", () => {
  const est = JS.computeUnitEconomics({ priceMinor: 850000, time: { odgActiveMin: 60, basis: { odgActive: "ESTIMATED" } }, rates: { odgActiveCostPerHourMinor: 500 }, capacity: { odgActiveHoursPerDay: 8 } });
  assert.strictEqual(est.capacity.basis, "ESTIMATED");
  assert.ok(est.warnings.some((w) => /CAPACITY_UNPROVEN/.test(w)));
  const meas = JS.computeUnitEconomics({ priceMinor: 850000, time: { odgActiveMin: 60, residualHumanMin: 0, basis: { odgActive: "MEASURED" } }, rates: { odgActiveCostPerHourMinor: 500 }, capacity: { odgActiveHoursPerDay: 8 } });
  assert.strictEqual(meas.capacity.basis, "MEASURED");
  assert.ok(!meas.warnings.some((w) => /CAPACITY_UNPROVEN/.test(w)));
});

// 11 — LOT B NO DOUBLE-COUNT: residual-human cost is reported separately and NOT also inside contributionMargin;
//      marginIncludingHuman subtracts it exactly once; revenue ≠ margin.
t("no double-count: human cost subtracted exactly once; revenue≠margin", () => {
  const r = JS.computeUnitEconomics({ priceMinor: 100000, directCosts: [{ label: "x", minor: 1000 }], time: { odgActiveMin: 60, residualHumanMin: 60, basis: { odgActive: "MEASURED", residualHuman: "MEASURED" } }, rates: { odgActiveCostPerHourMinor: 600, humanCostPerHourMinor: 6000 } });
  assert.strictEqual(r.costs.direct, "10.00 EUR");
  assert.strictEqual(r.costs.odgActiveMarginal, "6.00 EUR");
  assert.strictEqual(r.costs.residualHuman, "60.00 EUR");
  assert.strictEqual(r.contributionMargin, "984.00 EUR");        // 1000 - 10 - 6 (human NOT here)
  assert.strictEqual(r.marginIncludingHuman, "924.00 EUR");      // - 60 exactly once
  assert.notStrictEqual(r.price, r.contributionMargin);
});

console.log(`\nALL PASS — unit-economics (${n} tests)`);
