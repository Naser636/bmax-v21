// @ts-nocheck — test harness (runtime/core): runs under tsx; migration-debt convention (see autonomy-rate.test.ts).
// slo-collector — real-population build from telemetry: survivorship guard, dedup, window, fixture exclusion,
// absent-field honesty (first-attempt/latency), forbidden-action observation, and composition with evaluateConfiguredSLO.
const assert = require("assert");
const TS = require("./slo-collector.ts");
const JS = require("./slo-collector.js");
const { evaluateConfiguredSLO, evaluateForbiddenActionBlock } = require("./slo-targets.ts");
const { planSloResponse } = require("./slo-response.ts");

let n = 0;
const t = (name: any, fn: any) => { fn(); n++; console.log("ok  " + name); };

// Helper: build a success-only (survivorship) ledger of `k` distinct archived missions.
const successLedger = (k: any) => Array.from({ length: k }, (_: any, i: any) => ({
  mission: `REAL_MISSION_${i}`, state: "ARCHIVED", authorized: true, proven: true, validated: true,
  recordedAt: `2026-09-${String((i % 28) + 1).padStart(2, "0")}T10:00:00.000Z`,
}));

// 1. Survivorship: all-success telemetry ⇒ success-rate REFUSED as denominator (measurable:false).
t("survivorship (no failures representable) ⇒ success SLI measurable:false", () => {
  const r = TS.collectSloPopulation(successLedger(50));
  assert.strictEqual(r.failuresRepresentable, false);
  assert.strictEqual(r.slis.MISSION_SUCCESS_VERIFIED.measurable, false);
  assert.ok(/survivorship/.test(r.slis.MISSION_SUCCESS_VERIFIED.reason));
  assert.strictEqual(r.population.eligibleDenominator, 50);
});

// 2. A ledger that CAN represent failure (has proven:false / BLOCKED) ⇒ real rate measurable.
t("failures representable ⇒ success SLI measurable with real num/den", () => {
  const entries = successLedger(30).concat([
    { mission: "FAILED_A", state: "ARCHIVED", authorized: true, proven: false, validated: false, recordedAt: "2026-09-10T10:00:00.000Z" },
    { mission: "BLOCKED_B", state: "BLOCKED", authorized: true, proven: false, validated: false, recordedAt: "2026-09-11T10:00:00.000Z" },
  ]);
  const r = TS.collectSloPopulation(entries, { minSampleN: 20 });
  assert.strictEqual(r.failuresRepresentable, true);
  // BLOCKED_B is non-terminal ⇒ excluded; FAILED_A is terminal-but-not-verified ⇒ in denominator, not numerator.
  assert.strictEqual(r.slis.MISSION_SUCCESS_VERIFIED.measurable, true);
  assert.strictEqual(r.slis.MISSION_SUCCESS_VERIFIED.denominator, 31); // 30 success + FAILED_A
  assert.strictEqual(r.slis.MISSION_SUCCESS_VERIFIED.numerator, 30);
  assert.ok(r.population.excluded.nonTerminal >= 1);
});

// 3. Dedup: many transition records for one mission ⇒ counted once (terminal record wins).
t("dedup to one terminal record per mission", () => {
  const entries = [
    { mission: "M1", state: "CREATED", authorized: true, proven: false, validated: false, recordedAt: "2026-09-01T10:00:00.000Z" },
    { mission: "M1", state: "ARCHIVED", authorized: true, proven: true, validated: true, recordedAt: "2026-09-02T10:00:00.000Z" },
  ];
  const r = TS.collectSloPopulation(entries);
  assert.strictEqual(r.population.distinctMissions, 1);
  assert.strictEqual(r.population.eligibleDenominator, 1);
  assert.strictEqual(r.failuresRepresentable, true); // the CREATED record had proven:false
});

// 4. Window filter + fixture exclusion with recorded reasons.
t("window + fixture exclusion recorded", () => {
  const entries = successLedger(10).concat([
    { mission: "TEST_FIXTURE_X", state: "ARCHIVED", authorized: true, proven: true, validated: true, recordedAt: "2026-09-05T10:00:00.000Z" },
    { mission: "OLD_MISSION", state: "ARCHIVED", authorized: true, proven: true, validated: true, recordedAt: "2020-01-01T10:00:00.000Z" },
  ]);
  const r = TS.collectSloPopulation(entries, { windowFrom: "2026-01-01T00:00:00.000Z", windowTo: "2026-12-31T23:59:59.999Z" });
  assert.strictEqual(r.population.excluded.fixture, 1);
  assert.strictEqual(r.population.excluded.outOfWindow, 1);
  assert.strictEqual(r.window.derived, false);
});

// 5. Absent fields are honest: first-attempt + latency always measurable:false with reason.
t("absent fields ⇒ measurable:false with precise reason", () => {
  const r = TS.collectSloPopulation(successLedger(25));
  assert.strictEqual(r.slis.MISSION_SUCCESS_FIRST_ATTEMPT.measurable, false);
  assert.ok(/attempts|retry/.test(r.slis.MISSION_SUCCESS_FIRST_ATTEMPT.reason));
  assert.strictEqual(r.slis.MISSION_LATENCY.measurable, false);
  assert.ok(/snapshot|duration/.test(r.slis.MISSION_LATENCY.reason));
});

// 6. Forbidden-action observation: unauthorized records tracked; executedForbiddenCount stays 0 (positive evidence).
t("forbidden-action observation (unauthorized tracked ≠ executed effect)", () => {
  const entries = successLedger(5).concat([{ mission: "UNAUTH", state: "ARCHIVED", authorized: false, proven: true, validated: true, recordedAt: "2026-09-09T10:00:00.000Z" }]);
  const r = TS.collectSloPopulation(entries);
  assert.strictEqual(r.forbiddenActions.unauthorizedMissionRecords, 1);
  assert.strictEqual(r.forbiddenActions.executedForbiddenCount, 0);
  assert.strictEqual(r.population.excluded.unauthorized, 1); // not eligible for the success denominator
});

// 7. End-to-end composition: collector SLI → evaluateConfiguredSLO → planSloResponse (honest chain, no fabrication).
t("collector → evaluateConfiguredSLO → planSloResponse (survivorship ⇒ INSUFFICIENT ⇒ COLLECT_MORE)", () => {
  const r = TS.collectSloPopulation(successLedger(100));
  const verdict = evaluateConfiguredSLO("MISSION_SUCCESS_VERIFIED", r.slis.MISSION_SUCCESS_VERIFIED);
  assert.strictEqual(verdict.status, "INSUFFICIENT_EVIDENCE");
  assert.strictEqual(planSloResponse(verdict).gate, "COLLECT_MORE");
  const block = evaluateForbiddenActionBlock(r.forbiddenActions.executedForbiddenCount);
  assert.strictEqual(block.status, "PASS");
});

// 8. Dual-port parity on a representative mixed ledger.
t("TS/JS parity", () => {
  const entries = successLedger(15).concat([{ mission: "F", state: "FAILED", authorized: true, proven: false, validated: false, recordedAt: "2026-09-12T10:00:00.000Z" }]);
  assert.deepStrictEqual(TS.collectSloPopulation(entries), JS.collectSloPopulation(entries));
});

console.log(`\nALL PASS — slo-collector (${n} tests)`);
