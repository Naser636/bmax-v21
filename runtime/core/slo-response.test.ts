// @ts-nocheck — test harness (runtime/core): runs under tsx; migration-debt convention (see autonomy-rate.test.ts).
// slo-response — bounded PREPARE-not-APPLY reactions; INCIDENT strictly > BREACH; never auto-applies; no gating on noise.
const assert = require("assert");
const TS = require("./slo-response.ts");
const JS = require("./slo-response.js");
const { evaluateConfiguredSLO, evaluateForbiddenActionBlock } = require("./slo-targets.ts");

let n = 0;
const t = (name: any, fn: any) => { fn(); n++; console.log("ok  " + name); };
const sev = (s: any) => ["NONE", "LOW", "ELEVATED", "CRITICAL"].indexOf(s);

// 1. No response plan ever self-executes a consequential remediation.
t("autoApply is ALWAYS false (PREPARE_NOT_APPLY)", () => {
  for (const st of ["WITHIN", "PASS", "MEASUREMENT_ONLY", "INSUFFICIENT_EVIDENCE", "BREACH", "INCIDENT"]) {
    assert.strictEqual(TS.planSloResponse({ status: st }).autoApply, false, st);
  }
});

// 2. A forbidden-action INCIDENT is strictly MORE severe than a reliability BREACH (never conflated).
t("INCIDENT severity > BREACH severity (security never averaged into reliability)", () => {
  const inc = TS.planSloResponse({ status: "INCIDENT" });
  const br = TS.planSloResponse({ status: "BREACH" });
  assert.strictEqual(inc.severity, "CRITICAL");
  assert.strictEqual(br.severity, "ELEVATED");
  assert.ok(sev(inc.severity) > sev(br.severity));
  assert.strictEqual(inc.gate, "SUSPEND_PATH");
  assert.ok(inc.actions.some((a: any) => /PRESERVE_EVIDENCE/.test(a)) && inc.actions.some((a: any) => /SUSPEND_PATH/.test(a)));
});

// 3. BREACH => bounded recovery sequence diagnose -> limit -> recover -> re-verify.
t("BREACH => LIMIT_CHANGES with ordered diagnose/limit/recover/re-verify", () => {
  const r = TS.planSloResponse({ status: "BREACH" });
  assert.strictEqual(r.gate, "LIMIT_CHANGES");
  assert.ok(r.react);
  const joined = r.actions.join("|");
  assert.ok(/DIAGNOSE/.test(joined) && /LIMIT_CHANGES/.test(joined) && /RECOVER/.test(joined) && /RE-VERIFY/.test(joined));
});

// 4. INSUFFICIENT_EVIDENCE => collect, do NOT gate on noise (no change-limitation).
t("INSUFFICIENT_EVIDENCE => COLLECT_MORE, react:false (no gating on thin sample)", () => {
  const r = TS.planSloResponse({ status: "INSUFFICIENT_EVIDENCE" });
  assert.strictEqual(r.gate, "COLLECT_MORE");
  assert.strictEqual(r.react, false);
  assert.strictEqual(r.severity, "LOW");
});

// 5. WITHIN / MEASUREMENT_ONLY => CONTINUE, no reaction.
t("WITHIN & MEASUREMENT_ONLY => CONTINUE, severity NONE", () => {
  for (const st of ["WITHIN", "PASS", "MEASUREMENT_ONLY"]) {
    const r = TS.planSloResponse({ status: st });
    assert.strictEqual(r.gate, "CONTINUE");
    assert.strictEqual(r.severity, "NONE");
    assert.strictEqual(r.react, false);
  }
});

// 6. Composes with the real slo-targets verdicts (end-to-end, no fabrication).
t("composes with evaluateConfiguredSLO / evaluateForbiddenActionBlock", () => {
  // thin baseline => INSUFFICIENT_EVIDENCE => COLLECT_MORE
  const thin = TS.planSloResponse(evaluateConfiguredSLO("MISSION_SUCCESS_VERIFIED", { measurable: true, numerator: 0, denominator: 12 }));
  assert.strictEqual(thin.gate, "COLLECT_MORE");
  // sufficient below target => BREACH => LIMIT_CHANGES
  const breach = TS.planSloResponse(evaluateConfiguredSLO("MISSION_SUCCESS_VERIFIED", { measurable: true, numerator: 80, denominator: 100 }));
  assert.strictEqual(breach.gate, "LIMIT_CHANGES");
  // executed forbidden action => INCIDENT => SUSPEND_PATH (CRITICAL)
  const incident = TS.planSloResponse(evaluateForbiddenActionBlock(1));
  assert.strictEqual(incident.severity, "CRITICAL");
  assert.strictEqual(incident.gate, "SUSPEND_PATH");
});

// 7. Dual-port parity.
t("TS/JS parity", () => {
  for (const st of ["WITHIN", "MEASUREMENT_ONLY", "INSUFFICIENT_EVIDENCE", "BREACH", "INCIDENT"]) {
    assert.deepStrictEqual(TS.planSloResponse({ status: st, sloId: "X" }), JS.planSloResponse({ status: st, sloId: "X" }), st);
  }
  assert.deepStrictEqual(TS.planSloResponse({ incident: true }), JS.planSloResponse({ incident: true }));
});

console.log(`\nALL PASS — slo-response (${n} tests)`);
