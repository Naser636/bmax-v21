#!/usr/bin/env node
"use strict";

/*
 * INCIDENT TRIAGE — the §V S3 CONSUMER that INTEGRATES the two V63 composition capabilities end-to-end:
 *   A) Root-Cause Intelligence  (root-cause-intelligence.assess)   — structured, traceable assessment.
 *   B) Bounded Remediation      (bounded-remediation.propose)      — PROPOSE-ONLY remediation.
 *
 * Until now A and B existed but had NO consumer. This module is their real consumer: it drives A to
 * assess an incident, and — ONLY when A returns a DIAGNOSED verdict — drives B to produce a PROPOSE-ONLY
 * remediation. It creates NO new engine, authority, or primitive: both capabilities and all authorities
 * are reached through INJECTED seams (the exact pattern A and B themselves use), so this is pure and
 * unit-testable. Production callers get DEFAULT seams wired to the REAL authorities; tests inject fakes.
 *
 * HARD GUARANTEES (preserved verbatim from A/B):
 *   - READ-ONLY + PROPOSE-ONLY: `applied` is ALWAYS false; the patch-executor / applier is NEVER wired or
 *     invoked here. Acceptance + apply are a separate, explicitly-authorized step.
 *   - NEVER fabricate a cause: an inconclusive assessment yields NO proposal (B is not even consulted).
 *   - DENY-BY-DEFAULT: B's only authority is the action gate (default seam = action-gate.evaluateAction);
 *     a generic/unauthorized remediation action is DENIED, so a proposal only reaches PROPOSED when a real
 *     authorized action + in-scope write-set are supplied. Confidence never authorizes.
 *
 * Pure: no fs/process/clock of its own. The default seams lazily require the real authorities and are
 * invoked ONLY when a seam is not injected; any wiring failure degrades safely (INCONCLUSIVE / DENY).
 */

const { assess }: any = require("./root-cause-intelligence");
const { propose }: any = require("./bounded-remediation");

export interface TriageSeams {
  rootCause?: any;       // RootCauseIntelligenceSeams for A (releaseGateDiagnose / runtimeDiagnose)
  remediation?: any;     // RemediationSeams for B (authorize [+ optional checkInitialState / runTests])
}

export interface TriageInput {
  incident: any;         // IncidentInput for A (stable incidentId + failureClass/symptoms/evidenceRefs/…)
  remediation?: any;     // RemediationInput for B (writeSet / authorizedPaths / action / proposedDiff / …)
}

export interface TriageResult {
  incidentId: string;
  assessment: any;                 // A's structured assessment (verdict + facts/inferences/hypotheses/…)
  proposal: any | null;            // B's PROPOSE-ONLY proposal, or null when the assessment is not DIAGNOSED
  applied: false;                  // ALWAYS false — this consumer never applies anything
  mode: "PROPOSE_ONLY";
}

// DEFAULT seams for A — wired to the REAL authorities (release-gate = root-cause-engine; runtime-divergence
// = self-diagnostic). Lazily required + fail-safe: a wiring/throw degrades to no-conclusion ⇒ A INCONCLUSIVE.
function defaultRootCauseSeams(): any {
  return {
    releaseGateDiagnose(input: any) {
      try {
        const rce: any = require("./root-cause-engine");
        if (typeof rce.report === "function") return rce.report(input && input.mission ? input.mission : null);
        if (rce && typeof rce.RootCauseEngine === "function") return new rce.RootCauseEngine().report(input && input.mission ? input.mission : null);
        return null;
      } catch { return null; }
    },
    runtimeDiagnose(_input: any) {
      try {
        const sd: any = require("../../runtime/core/self-diagnostic");
        // Read-only diagnosis (NOT audit — audit persists an incident ledger); returns divergences/causes.
        if (typeof sd.diagnose === "function") return sd.diagnose({});
        return null;
      } catch { return null; }
    },
  };
}

// DEFAULT seams for B — the action gate is the SOLE authority (deny-by-default). NO applier is wired:
// this consumer is propose-only, so the only authorized writer (patch-executor) is never reachable here.
function defaultRemediationSeams(): any {
  return {
    authorize(action: any, context: any) {
      try {
        const ag: any = require("../../runtime/core/action-gate");
        return ag.evaluateAction(action, context || {});
      } catch {
        return { decision: "DENY", reason: "action-gate authority unavailable (fail-closed)" };
      }
    },
    // checkInitialState / runTests: OPTIONAL and intentionally omitted by default (a caller may inject
    // read-only probes). applier: DELIBERATELY ABSENT — propose-only; apply is a separate gated step.
  };
}

/**
 * triage(input, seams?) — INTEGRATE A then (only if DIAGNOSED) B, propose-only. Returns the assessment and
 * the proposal (or null). NEVER applies anything; `applied` is always false. Seams default to the real
 * authorities and are overridable for hermetic tests.
 */
export function triage(input: TriageInput, seams: TriageSeams = {}): TriageResult {
  if (!input || !input.incident || typeof input.incident.incidentId !== "string" || !input.incident.incidentId.trim()) {
    throw new Error("incident-triage: input.incident.incidentId (stable) is required");
  }
  const rcSeams = seams.rootCause || defaultRootCauseSeams();
  const remSeams = seams.remediation || defaultRemediationSeams();

  // A — structured root-cause assessment (never fabricates a cause).
  const assessment = assess(input.incident, rcSeams);

  // B — PROPOSE-ONLY remediation, consulted ONLY on a DIAGNOSED assessment (never remediate an
  // inconclusive cause). An absent remediation input ⇒ B BLOCKs on an empty write-set (honest).
  let proposal: any = null;
  if (assessment && assessment.verdict === "DIAGNOSED") {
    const remInput = input.remediation && typeof input.remediation === "object"
      ? input.remediation
      : { writeSet: [], authorizedPaths: [] };
    proposal = propose(assessment, remInput, remSeams);
  }

  return { incidentId: input.incident.incidentId, assessment, proposal, applied: false, mode: "PROPOSE_ONLY" };
}

module.exports = { triage };

// Module-scope marker (adds NO export): forces TypeScript MODULE scope (no global-script collisions).
export {};
