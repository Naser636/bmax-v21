#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V31.1 Program A — SAFETY ENGINEERING (FMEA/FMECA + residual-risk register). PURE, deterministic,
 * fail-closed. Adapts the NASA/aerospace FMECA method to ODG: for each component failure mode, compute a Risk Priority
 * Number RPN = Severity × Occurrence × Detection (each 1–10; Detection 10 = undetectable), classify the risk, apply a
 * declared mitigation to obtain the RESIDUAL risk, and flag any CRITICAL residual (a high-severity, poorly-detected,
 * unmitigated failure). FAIL-CLOSED: a missing/invalid factor is assumed WORST-CASE (severity/occurrence/detection = 10),
 * and absence of a declared mitigation is treated as NO mitigation — ODG never under-states a risk. Builds no new engine;
 * it is a pure analyzer composed over component descriptors. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
// WORST-CASE clamp: a non-finite / out-of-range factor ⇒ 10 (never a flattering default).
function factor(v: any): number { const n = Number(v); return Number.isFinite(n) && n >= 1 && n <= 10 ? Math.round(n) : 10; }

const CRITICAL_RPN = 200;     // ≥ this ⇒ CRITICAL (e.g. sev 8 × occ 5 × det 5)
const HIGH_RPN = 100;

/** classifyRpn(rpn, severity) -> "CRITICAL" | "HIGH" | "MEDIUM" | "LOW". A severity-10 failure is at least HIGH regardless. */
function classifyRpn(rpn: number, severity: number): string {
  if (rpn >= CRITICAL_RPN || (severity >= 9 && rpn >= HIGH_RPN)) return "CRITICAL";
  if (rpn >= HIGH_RPN || severity >= 9) return "HIGH";
  if (rpn >= 40) return "MEDIUM";
  return "LOW";
}

/**
 * analyzeFailureMode(fm) -> { mode, rpn, risk, residualRpn, residualRisk, mitigated, detectable, note }. fm:
 * { mode, cause, effect, severity, occurrence, detection, mitigation? , mitigationEffect? (0..1 occurrence reduction) }.
 * FAIL-CLOSED factors; the residual applies the mitigation's declared occurrence reduction ONLY if a mitigation is named.
 */
function analyzeFailureMode(fm: any): any {
  const f = isObj(fm) ? fm : {};
  const severity = factor(f.severity), occurrence = factor(f.occurrence), detection = factor(f.detection);
  const rpn = severity * occurrence * detection;
  const risk = classifyRpn(rpn, severity);
  const mitigated = typeof f.mitigation === "string" && f.mitigation.trim().length > 0;
  // residual occurrence after mitigation (declared effect in [0,1]; default a modest 0.5 reduction if a mitigation named).
  const eff = mitigated ? (Number.isFinite(Number(f.mitigationEffect)) && Number(f.mitigationEffect) >= 0 && Number(f.mitigationEffect) <= 1 ? Number(f.mitigationEffect) : 0.5) : 0;
  const residualOcc = Math.max(1, Math.round(occurrence * (1 - eff)));
  const residualRpn = severity * residualOcc * detection;
  const residualRisk = classifyRpn(residualRpn, severity);
  const detectable = detection <= 6;   // detection 7+ ⇒ hard/undetectable (fail-closed concern)
  return Object.freeze({
    mode: f.mode || "(unspecified)", cause: f.cause || null, effect: f.effect || null,
    severity, occurrence, detection, rpn, risk, mitigated, detectable,
    residualRpn, residualRisk,
    note: (!mitigated && (risk === "CRITICAL" || risk === "HIGH")) ? "HIGH/CRITICAL failure with NO declared mitigation — must be mitigated or accepted as residual risk by the owner"
      : (!detectable && (risk === "CRITICAL" || risk === "HIGH")) ? "HIGH/CRITICAL and poorly detectable — add a detection means (health check / assertion / monitor)"
      : "within analyzed bounds",
  });
}

/** analyzeComponent(component) -> { id, failureModes:[...], worstResidual, criticalCount, unmitigatedHigh }. */
function analyzeComponent(component: any): any {
  const c = isObj(component) ? component : {};
  const fms = arr(c.failureModes).map(analyzeFailureMode);
  const order: any = { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };
  const worstResidual = fms.reduce((w, f) => (order[f.residualRisk] > order[w] ? f.residualRisk : w), "LOW");
  return Object.freeze({
    id: c.id || "(component)", failureModes: Object.freeze(fms),
    worstResidual,
    criticalCount: fms.filter((f) => f.residualRisk === "CRITICAL").length,
    unmitigatedHigh: fms.filter((f) => !f.mitigated && (f.risk === "CRITICAL" || f.risk === "HIGH")).length,
  });
}

/**
 * buildRiskRegister(components) -> { components:[...], residualRegister:[...], summary }. The residual register lists
 * every CRITICAL/HIGH residual (the risks that remain after mitigation) — these REQUIRE an explicit owner acceptance or a
 * further mitigation; they are never silently cleared.
 */
function buildRiskRegister(components: any): any {
  const list = arr(components).map(analyzeComponent);
  const residual: any[] = [];
  for (const comp of list) for (const fm of comp.failureModes) if (fm.residualRisk === "CRITICAL" || fm.residualRisk === "HIGH") residual.push(Object.freeze({ component: comp.id, mode: fm.mode, residualRisk: fm.residualRisk, residualRpn: fm.residualRpn, mitigated: fm.mitigated, detectable: fm.detectable }));
  residual.sort((a, b) => b.residualRpn - a.residualRpn);
  return Object.freeze({
    components: Object.freeze(list),
    residualRegister: Object.freeze(residual),
    summary: Object.freeze({
      components: list.length,
      failureModes: list.reduce((n, c) => n + c.failureModes.length, 0),
      criticalResidual: residual.filter((r) => r.residualRisk === "CRITICAL").length,
      highResidual: residual.filter((r) => r.residualRisk === "HIGH").length,
      unmitigatedHighOrCritical: list.reduce((n, c) => n + c.unmitigatedHigh, 0),
      note: "residual CRITICAL/HIGH risks require explicit owner acceptance or further mitigation — never silently cleared (fail-closed worst-case on missing factors)",
    }),
  });
}

const SAFETY_FMEA_CONTRACT = Object.freeze({
  id: "V124-SAFETY-FMEA",
  source: "CTO V31.1 Program A — adapted NASA/aerospace FMECA risk analysis for ODG (not a certification)",
  reuses: Object.freeze(["component/failure-mode descriptors (composed, no new engine)"]),
  notAuthority: "analyzes risk (RPN) and builds a residual-risk register; it decides no mission and grants no authority; residual CRITICAL/HIGH risks are owner-accepted, never cleared by this module",
  invariants: Object.freeze([
    "RPN = Severity × Occurrence × Detection; a missing/invalid factor is assumed WORST-CASE (10) — risk is never under-stated",
    "a declared mitigation reduces the RESIDUAL occurrence; absence of a mitigation ⇒ no reduction (fail-closed)",
    "a HIGH/CRITICAL residual with no mitigation or poor detectability is flagged for owner acceptance or further mitigation",
    "the residual register lists every CRITICAL/HIGH residual — never silently cleared",
    "pure/deterministic: component descriptors in → risk analysis out; no side effects",
  ]),
});

module.exports = { factor, classifyRpn, analyzeFailureMode, analyzeComponent, buildRiskRegister, SAFETY_FMEA_CONTRACT };

if (require.main === module) {
  const reg = buildRiskRegister([{ id: "repair-loop", failureModes: [{ mode: "accepts a wrong fix", cause: "verifier bypassed", effect: "bad code merged", severity: 9, occurrence: 3, detection: 2, mitigation: "independent verifier is the sole arbiter", mitigationEffect: 0.7 }, { mode: "model unavailable", cause: "ollama down", effect: "no repair", severity: 4, occurrence: 4, detection: 2 }] }]);
  process.stdout.write(JSON.stringify({ ...SAFETY_FMEA_CONTRACT, demo: reg.summary }, null, 2) + "\n");
}

export {};
