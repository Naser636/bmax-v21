/**
 * slo-targets — the CONFIGURED SLO target spec adopted by the CTO (permanent continuation mandate §3,
 * 2026-10-19). This is the FIRST stored, provenanced target source in the repo; before it, `evaluateSLO`
 * refused every target as undeclared. Encoding a target here is NOT a claim that it is met: each target is
 * CONFIGURED (declared with provenance), and only becomes VALIDATED when a provenanced baseline with a
 * sufficient denominator over a documented window yields WITHIN. Until then live status is
 * INSUFFICIENT_EVIDENCE — never coerced to a pass.
 *
 * Invariants honoured (CTO §3):
 *  - The 25% deterministic benchmark is NOT touched here (that is a separate, frozen gate).
 *  - Forbidden-action blocking is a SEPARATE BINARY gate (`FORBIDDEN_ACTION_BLOCK`) — security violations are
 *    NEVER aggregated into a reliability average. One executed forbidden action = incident, not a rate dip.
 *  - Latency targets are left null (measurement-only) until a real baseline (median + p95 per category) is
 *    observed; no delay is invented.
 */
const { evaluateSLO } = require("./autonomy-rate");

const CTO_PROVENANCE = {
  source: "CTO Directive — permanent continuation mandate §3 (2026-10-19)",
  authoredBy: "ODG CTO",
  rationale:
    "Operational reliability decision: verified mission success, first-attempt success, absolute forbidden-action " +
    "blocking, and per-category latency observation. Targets CONFIGURED now; VALIDATED only on sufficient provenanced data.",
  declaredAt: "2026-10-19",
};

// status is always "CONFIGURED" at authorship — promotion to "VALIDATED" is a data-driven runtime verdict,
// never a stored constant (that would be the illusion the mandate forbids).
const SLO_TARGETS = [
  {
    id: "MISSION_SUCCESS_VERIFIED",
    kind: "rate",
    direction: "atLeast",
    target: 0.95,
    minSampleN: 20,
    status: "CONFIGURED",
    definition:
      "Fraction of ELIGIBLE missions whose outcome is verified-success (ODG_EXECUTED_VERIFIED with valid evidence), " +
      "over a documented window. Denominator = eligible+authorized missions in window; excludes NON_MEASURABLE.",
    provenance: CTO_PROVENANCE,
  },
  {
    id: "MISSION_SUCCESS_FIRST_ATTEMPT",
    kind: "rate",
    direction: "atLeast",
    target: 0.9,
    minSampleN: 20,
    status: "CONFIGURED",
    definition:
      "Fraction of eligible missions that reached verified-success on the FIRST attempt (no retry/recovery). " +
      "Measured SEPARATELY from MISSION_SUCCESS_VERIFIED (not a subset average).",
    provenance: CTO_PROVENANCE,
  },
  {
    id: "FORBIDDEN_ACTION_BLOCK",
    kind: "binary",
    direction: "atLeast",
    target: 1.0,
    minSampleN: 1,
    status: "CONFIGURED",
    definition:
      "100% of explicitly-forbidden actions blocked BEFORE effect. Binary/absolute: any single executed forbidden " +
      "action is an INCIDENT (preserve evidence + suspend the path), NEVER averaged into a reliability number.",
    provenance: CTO_PROVENANCE,
  },
  {
    id: "MISSION_LATENCY",
    kind: "latency",
    direction: "atMost",
    target: null, // measurement-only until baseline observed — no invented delay (CTO §3)
    minSampleN: 20,
    status: "CONFIGURED",
    definition:
      "Per-mission-category latency: report median + p95. Target(s) determined AFTER observing the real baseline " +
      "and operational requirements; until then target is null (measure, do not gate).",
    provenance: CTO_PROVENANCE,
  },
];

function getTarget(id: any): any {
  return SLO_TARGETS.find((t) => t.id === id) || null;
}

/**
 * Evaluate a CONFIGURED rate/binary target against a measure view (sli = {measurable,numerator,denominator,reason?}).
 * Delegates to the audited evaluateSLO (WITHIN|BREACH|INSUFFICIENT_EVIDENCE; recomputes actual; refuses unprovenanced
 * targets + small samples). A latency target (target:null) is never "evaluated" to a pass/fail — it returns
 * MEASUREMENT_ONLY so a null target can never masquerade as WITHIN.
 */
function evaluateConfiguredSLO(id: any, sli: any): any {
  const t = getTarget(id);
  if (!t) return { status: "INSUFFICIENT_EVIDENCE", reason: `unknown SLO id "${id}"`, target: null };
  if (t.kind === "latency" || typeof t.target !== "number") {
    return {
      status: "MEASUREMENT_ONLY",
      reason: "latency/target-less SLO: observe median+p95; target determined after baseline (CTO §3)",
      target: null,
      configured: t.status,
    };
  }
  const verdict = evaluateSLO(sli, {
    target: t.target,
    direction: t.direction,
    minSampleN: t.minSampleN,
    provenance: t.provenance,
  });
  // A CONFIGURED target is only ever reported as VALIDATED when the DATA says WITHIN — the stored status
  // stays CONFIGURED; the promotion is this computed field, derived from live evidence, never asserted.
  return { ...verdict, configured: t.status, validated: verdict.status === "WITHIN" };
}

/**
 * The forbidden-action-block gate — BINARY and absolute, kept out of every rate average (CTO §3).
 * `executedForbiddenCount` = number of explicitly-forbidden actions that actually produced an effect.
 * Zero ⇒ PASS. Any ⇒ INCIDENT (fail-closed signal for evidence preservation + path suspension).
 */
function evaluateForbiddenActionBlock(executedForbiddenCount: any): any {
  const n = typeof executedForbiddenCount === "number" && executedForbiddenCount >= 0 ? executedForbiddenCount : null;
  if (n === null) return { status: "INSUFFICIENT_EVIDENCE", reason: "executedForbiddenCount not a non-negative number", incident: false };
  if (n === 0) return { status: "PASS", reason: "no forbidden action executed", incident: false };
  return { status: "INCIDENT", reason: `${n} forbidden action(s) executed — preserve evidence + suspend path`, incident: true };
}

module.exports = { SLO_TARGETS, CTO_PROVENANCE, getTarget, evaluateConfiguredSLO, evaluateForbiddenActionBlock };
export {};
