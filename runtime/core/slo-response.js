/**
 * slo-response — bounded, PREPARE-not-APPLY reactions to SLO verdicts (CTO continuation mandate §5.3).
 *
 * Takes a verdict from `slo-targets.evaluateConfiguredSLO` / `evaluateForbiddenActionBlock` and returns a
 * STRUCTURED, BOUNDED response plan. It NEVER auto-executes a consequential remediation: `autoApply` is always
 * false — the plan is a signal + ordered recommendation for an authorized, separately-gated step (same
 * PREPARE_NOT_APPLY discipline as auto-heal). This keeps SLO reaction from becoming an ungoverned effect path.
 *
 * Severity ladder (a security INCIDENT is strictly more severe than a reliability BREACH — never conflated):
 *   NONE < LOW < ELEVATED < CRITICAL
 *   WITHIN / PASS / MEASUREMENT_ONLY -> NONE  (continue)
 *   INSUFFICIENT_EVIDENCE            -> LOW   (collect more; do NOT gate on noise)
 *   BREACH (reliability)             -> ELEVATED (diagnose -> limit changes -> recover -> re-verify)
 *   INCIDENT (forbidden executed)    -> CRITICAL (suspend path + preserve evidence + escalate)
 */

const GATE = { CONTINUE: "CONTINUE", COLLECT_MORE: "COLLECT_MORE", LIMIT_CHANGES: "LIMIT_CHANGES", SUSPEND_PATH: "SUSPEND_PATH" };
const SEVERITY = { NONE: "NONE", LOW: "LOW", ELEVATED: "ELEVATED", CRITICAL: "CRITICAL" };

function planSloResponse(verdict) {
  const v = verdict && typeof verdict === "object" ? verdict : {};
  const sloId = v.sloId || v.id || null;
  const status = typeof v.status === "string" ? v.status : "INSUFFICIENT_EVIDENCE";
  const base = { sloId, status, autoApply: false }; // autoApply is ALWAYS false — bounded, never self-executes

  // CRITICAL — an explicitly-forbidden action actually produced an effect. Highest severity; distinct path.
  if (status === "INCIDENT" || v.incident === true) {
    return {
      ...base,
      severity: SEVERITY.CRITICAL,
      react: true,
      gate: GATE.SUSPEND_PATH,
      actions: [
        "PRESERVE_EVIDENCE: snapshot the executed-forbidden-action evidence (immutable, provenance-stamped)",
        "SUSPEND_PATH: halt further consequential execution on the implicated path until re-secured",
        "DIAGNOSE: root-cause how the action bypassed deny-by-default (reproduce before repair)",
        "ESCALATE: raise a human-visible incident — security violations are never auto-cleared",
        "RE-VERIFY: only after a fix + adversarial test proves the effect is now prevented",
      ],
      reason: "forbidden action executed — security incident, not a reliability dip (never averaged)",
    };
  }

  // ELEVATED — reliability target breached with a sufficient, provenanced sample.
  if (status === "BREACH") {
    return {
      ...base,
      severity: SEVERITY.ELEVATED,
      react: true,
      gate: GATE.LIMIT_CHANGES,
      actions: [
        "DIAGNOSE: root-cause the failing eligible missions in the window (attribution + evidence)",
        "LIMIT_CHANGES: reduce change surface — freeze the breaching mission category / shrink batch size",
        "RECOVER: apply targeted, authorized fixes (bounded write-set; no scope expansion)",
        "RE-VERIFY: re-measure after >= minSampleN new eligible missions before clearing the breach",
      ],
      reason: "reliability SLO breached on a sufficient sample — bounded recovery, re-verify before clearing",
    };
  }

  // LOW — not enough data. Collect; do NOT react/gate on noise (anti-illusion: small samples aren't generalizable).
  if (status === "INSUFFICIENT_EVIDENCE") {
    return {
      ...base,
      severity: SEVERITY.LOW,
      react: false,
      gate: GATE.COLLECT_MORE,
      actions: [
        "COLLECT: accumulate a window-scoped eligible-mission population until denominator >= minSampleN",
        "DO_NOT_GATE: no change-limitation on an unprovenanced/thin sample",
      ],
      reason: "insufficient evidence — collect a sufficient window population before any gating",
    };
  }

  // NONE — WITHIN / PASS / MEASUREMENT_ONLY. Continue; latency stays observe-only until a target exists.
  return {
    ...base,
    severity: SEVERITY.NONE,
    react: false,
    gate: GATE.CONTINUE,
    actions: status === "MEASUREMENT_ONLY" ? ["OBSERVE: record median+p95; no target to gate on yet"] : [],
    reason: status === "WITHIN" || status === "PASS" ? "within target — continue" : "measurement-only — observe, do not gate",
  };
}

module.exports = { planSloResponse, GATE, SEVERITY };
