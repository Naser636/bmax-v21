#!/usr/bin/env node
/**
 * reliability-dora-demonstrator — ONE composed reliability-evidence run for profession P7 (SRE, Distributed
 * Systems & Performance). CTO Master Campaign V3, Wave-3 integrated demonstrator.
 *
 * ORCHESTRATES already-MERGED modules (NO new capability, NO new primitive):
 *   1. evaluate a configured SLO against an observed SLI → slo-targets.evaluateConfiguredSLO
 *   2. PREPARE (never auto-apply) a bounded response    → slo-response.planSloResponse (autoApply ALWAYS false)
 *   3. compute a denominator-explicit DORA four-key read-model → dora-metrics.fourKeys
 *   4. summarise incident recurrence (RESOLVED/OBSOLETE excluded from the active verdict) → incident-recurrence.analyzeRecurrence
 *   5. compose one verdict: RELIABILITY_EVIDENCE_PREPARED (+ sloStatus, autoApply:false, fourKeys, recurrence, gaps)
 *
 * HONEST SCOPE: PREPARE-not-APPLY — a response is PLANNED, never self-executed (autoApply always false). DORA keys
 * are denominator-explicit and stay null where unobserved (never inferred from completions). Latency/target-less
 * SLOs are MEASUREMENT_ONLY until a provenanced baseline (owner-gated). PURE (SLI/run/ledger passed in — no
 * fs/net/clock). ADDITIVE. Dual export.
 */
"use strict";

const SLOT = require("./slo-targets.js");
const SLOR = require("./slo-response.js");
const DORA = require("./dora-metrics.js");
const IR = require("./incident-recurrence.js");

const SCHEMA = "odg.reliability-dora-demonstrator.v1";
const BASIS = "RELIABILITY_EVIDENCE_PREPARE_NOT_APPLY";
const VERDICT = Object.freeze({ PREPARED: "RELIABILITY_EVIDENCE_PREPARED", INCOMPLETE: "RELIABILITY_EVIDENCE_INCOMPLETE" });

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/**
 * runReliabilityEvidence(input) — SLO → PREPARE response → DORA → recurrence. input:
 *   { sloId:string, sli?, run?:{transitions:[]}, ledger?:{incidents:{}}, incident?:bool }
 * NEVER throws on bad input (fail-closed).
 */
function runReliabilityEvidence(input: any): any {
  if (!isObj(input)) return { ok: false, schema: SCHEMA, verdict: VERDICT.INCOMPLETE, code: "INVALID_INPUT", reason: "input object required", basis: BASIS };
  const gaps: string[] = [];
  const steps: any = {};

  // STEP 1 — evaluate the configured SLO against the observed SLI.
  const sloVerdict = SLOT.evaluateConfiguredSLO(input.sloId, input.sli);
  steps.slo = sloVerdict;
  const sloStatus = sloVerdict && sloVerdict.status ? sloVerdict.status : "INSUFFICIENT_EVIDENCE";
  if (sloStatus === "INSUFFICIENT_EVIDENCE") gaps.push(`SLO "${input.sloId}" not evaluable: ${sloVerdict && sloVerdict.reason ? sloVerdict.reason : "insufficient evidence"}.`);
  else if (sloStatus === "MEASUREMENT_ONLY") gaps.push("latency/target-less SLO ⇒ MEASUREMENT_ONLY (target set after a provenanced baseline — owner-gated).");

  // STEP 2 — PREPARE a bounded response (never auto-apply).
  const plan = SLOR.planSloResponse({ sloId: input.sloId, status: sloStatus, incident: input.incident === true });
  steps.response = plan;
  if (plan && plan.autoApply !== false) gaps.push("INVARIANT VIOLATION: response autoApply must always be false.");
  if (plan && (plan.severity === "CRITICAL" || plan.react === true)) gaps.push(`response PREPARED at severity ${plan.severity} (gate ${plan.gate}) — PLANNED, not applied.`);

  // STEP 3 — denominator-explicit DORA four-key read-model (null where unobserved).
  const keys = DORA.fourKeys(isObj(input.run) ? input.run : {});
  steps.dora = keys;

  // STEP 4 — incident recurrence (active verdict excludes RESOLVED/OBSOLETE).
  const rec = IR.analyzeRecurrence(isObj(input.ledger) ? input.ledger : { incidents: {} });
  steps.recurrence = rec;

  return {
    ok: true,
    schema: SCHEMA,
    verdict: VERDICT.PREPARED,
    basis: BASIS,
    summary: {
      sloStatus,
      autoApply: plan ? plan.autoApply === true : false, // must be false
      responseSeverity: plan ? plan.severity || null : null,
      responseGate: plan ? plan.gate || null : null,
      fourKeys: keys && keys.keys ? keys.keys : keys,
      recurrenceVerdict: rec ? (rec.verdict || null) : null,
      gapCount: gaps.length,
    },
    gaps,
    steps,
    note: "Composed reliability evidence: SLO evaluation → PREPARED (never auto-applied) bounded response → denominator-explicit DORA four-keys (null where unobserved) → incident-recurrence summary. PREPARE-not-APPLY: autoApply is always false. Evidence/readiness, not an applied remediation and not an SLA guarantee.",
  };
}

export { runReliabilityEvidence, SCHEMA, VERDICT, BASIS };
module.exports = { runReliabilityEvidence, SCHEMA, VERDICT, BASIS };
