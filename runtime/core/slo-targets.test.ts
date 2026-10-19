// @ts-nocheck — test harness (runtime/core): runs under tsx; suppresses tsc typechecking (migration-debt
// convention, see autonomy-rate.test.ts). The gate is behavioural honesty, not strict typing.
// slo-targets — CONFIGURED≠VALIDATED, provenance required, forbidden-block is a separate binary gate,
// latency is measurement-only, and the real current baseline yields INSUFFICIENT_EVIDENCE (not a fake pass).
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const TS = require("./slo-targets.ts");
const JS = require("./slo-targets.js");

let n = 0;
const t = (name: any, fn: any) => { fn(); n++; console.log("ok  " + name); };

// 1. Every CONFIGURED target carries full provenance (so evaluateSLO never refuses it as undeclared).
t("every target is CONFIGURED with complete provenance", () => {
  for (const g of TS.SLO_TARGETS) {
    assert.strictEqual(g.status, "CONFIGURED", `${g.id} must be CONFIGURED, not pre-VALIDATED`);
    assert.ok(g.provenance && g.provenance.source && g.provenance.authoredBy && g.provenance.rationale, `${g.id} provenance`);
  }
});

// 2. The four CTO §3 SLOs exist with the decided targets; latency target is null (not invented).
t("CTO §3 targets encoded exactly (0.95 / 0.90 / 1.0 / latency=null)", () => {
  assert.strictEqual(TS.getTarget("MISSION_SUCCESS_VERIFIED").target, 0.95);
  assert.strictEqual(TS.getTarget("MISSION_SUCCESS_FIRST_ATTEMPT").target, 0.9);
  assert.strictEqual(TS.getTarget("FORBIDDEN_ACTION_BLOCK").target, 1.0);
  assert.strictEqual(TS.getTarget("MISSION_LATENCY").target, null);
});

// 3. No stored target is ever VALIDATED — promotion must be data-driven only.
t("no stored status is VALIDATED (promotion is data-driven, never asserted)", () => {
  assert.ok(!TS.SLO_TARGETS.some((g: any) => g.status === "VALIDATED"));
});

// 4. Rate SLO against the REAL current baseline (denominator=12 < minSampleN=20) ⇒ INSUFFICIENT_EVIDENCE,
//    never coerced to a pass. (Reads the live autonomy-rate.json if present; else a representative thin sample.)
t("thin baseline ⇒ INSUFFICIENT_EVIDENCE (no fake pass)", () => {
  let den = 12, num = 0;
  try {
    const live = JSON.parse(fs.readFileSync(path.join(process.cwd(), "runtime/generated/autonomy-rate.json"), "utf8"));
    if (live && live.measure && typeof live.measure.denominator === "number") { den = live.measure.denominator; num = live.measure.numerator; }
  } catch { /* use the thin default */ }
  const r = TS.evaluateConfiguredSLO("MISSION_SUCCESS_VERIFIED", { measurable: true, numerator: num, denominator: den });
  assert.strictEqual(r.status, "INSUFFICIENT_EVIDENCE", `expected INSUFFICIENT_EVIDENCE for N=${den}, got ${r.status}`);
  assert.notStrictEqual(r.validated, true);
});

// 5. Sufficient sample at/above target ⇒ WITHIN + validated:true (promotion earned by data).
t("sufficient sample meeting target ⇒ WITHIN + validated", () => {
  const r = TS.evaluateConfiguredSLO("MISSION_SUCCESS_VERIFIED", { measurable: true, numerator: 96, denominator: 100 });
  assert.strictEqual(r.status, "WITHIN");
  assert.strictEqual(r.validated, true);
});

// 6. Sufficient sample below target ⇒ BREACH (not silently tolerated).
t("sufficient sample below target ⇒ BREACH", () => {
  const r = TS.evaluateConfiguredSLO("MISSION_SUCCESS_VERIFIED", { measurable: true, numerator: 80, denominator: 100 });
  assert.strictEqual(r.status, "BREACH");
  assert.notStrictEqual(r.validated, true);
});

// 7. Latency SLO is measurement-only — a null target can never masquerade as WITHIN.
t("latency SLO ⇒ MEASUREMENT_ONLY (never WITHIN)", () => {
  const r = TS.evaluateConfiguredSLO("MISSION_LATENCY", { measurable: true, numerator: 1, denominator: 50 });
  assert.strictEqual(r.status, "MEASUREMENT_ONLY");
  assert.notStrictEqual(r.status, "WITHIN");
});

// 8. Forbidden-action-block is a SEPARATE binary gate — 0 ⇒ PASS, any ⇒ INCIDENT, never averaged.
t("forbidden-action-block binary gate (0⇒PASS, 1⇒INCIDENT)", () => {
  assert.strictEqual(TS.evaluateForbiddenActionBlock(0).status, "PASS");
  const inc = TS.evaluateForbiddenActionBlock(1);
  assert.strictEqual(inc.status, "INCIDENT");
  assert.strictEqual(inc.incident, true);
  assert.strictEqual(TS.evaluateForbiddenActionBlock("x").status, "INSUFFICIENT_EVIDENCE");
});

// 9. Dual-port parity: .ts and .js produce identical verdicts on representative inputs.
t("TS/JS parity on representative inputs", () => {
  const cases = [
    ["MISSION_SUCCESS_VERIFIED", { measurable: true, numerator: 96, denominator: 100 }],
    ["MISSION_SUCCESS_VERIFIED", { measurable: true, numerator: 0, denominator: 12 }],
    ["MISSION_LATENCY", { measurable: true, numerator: 1, denominator: 50 }],
  ];
  for (const [id, sli] of cases) {
    assert.deepStrictEqual(TS.evaluateConfiguredSLO(id, sli), JS.evaluateConfiguredSLO(id, sli), `parity ${id}`);
  }
  assert.deepStrictEqual(TS.evaluateForbiddenActionBlock(1), JS.evaluateForbiddenActionBlock(1));
  assert.deepStrictEqual(TS.SLO_TARGETS, JS.SLO_TARGETS);
});

console.log(`\nALL PASS — slo-targets (${n} tests)`);
