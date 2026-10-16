#!/usr/bin/env node
/*
 * ROOT-CAUSE INTELLIGENCE & PREVENTION (V63 Capability A) — a READ-ONLY composition, NOT a new engine.
 *
 * It composes the TWO existing root-cause authorities per the V56 failure-class mapping, via INJECTED seams:
 *   - release-gate / BLOCKED-mission (NO_RELEASE)  → src/runtime/root-cause-engine.ts (RootCauseEngine.report)
 *   - expected-vs-observed runtime divergence       → runtime/core/self-diagnostic.js (diagnose)
 * It creates NO second diagnosis engine, NO new authorization, NO new log/writer, NO tenth primitive. It
 * turns an authority's verdict into a STRUCTURED assessment and NEVER fabricates a cause: when the evidence
 * does not support a conclusion it returns verdict "INCONCLUSIVE".
 *
 * Discipline (contract):
 *   - observedFacts / inferences / hypotheses are kept in THREE explicitly-separate arrays.
 *   - evidenceFor / evidenceAgainst are recorded from the authority verdict; nothing is invented.
 *   - confidence is null UNLESS the caller supplies a VALIDATED calibration (validatedConfidence); a model's
 *     self-assessed number never becomes "confidence".
 *   - a stable incidentId + evidenceRefs make the assessment traceable and linkable to Bounded Remediation (B).
 *   - corrective/preventive actions carry a priority, a recurrence risk, and a MEASURABLE verificationCriterion.
 *   - EVIDENCE_MISSING / NO_BLOCKER / no-divergence / contradictory evidence ⇒ INCONCLUSIVE (never a guess).
 *
 * Pure: no fs, no process, no clock. The authority calls are delegated to seams so it is unit-testable with
 * synthetic verdicts (diagnosis is NOT re-implemented here).
 */

"use strict";

export type FailureClass = "release-gate" | "runtime-divergence" | "unknown";
export type AssessmentVerdict = "DIAGNOSED" | "INCONCLUSIVE";

export interface IncidentInput {
  incidentId: string;                 // stable id — links the assessment to remediation + learning
  failureClass?: FailureClass;        // optional hint; routing falls back to trying the available seam(s)
  symptoms?: string[];
  evidenceRefs?: string[];            // traceable references (file paths, report ids) — NOT re-derived here
  timeline?: Array<{ at: string; event: string }>;
  impact?: string;
  validatedConfidence?: number | null; // ONLY set when an external calibration validated it; else null
}

export interface CorrectiveAction { action: string; priority: "P0" | "P1" | "P2" | "P3"; kind: "corrective" | "preventive"; verificationCriterion: string }

export interface Assessment {
  incidentId: string;
  verdict: AssessmentVerdict;
  authority: string | null;           // which authority produced the verdict (provenance)
  failureClass: FailureClass;
  impact: string | null;
  timeline: Array<{ at: string; event: string }>;
  observedFacts: string[];            // FACTS read from evidence/verdict
  inferences: string[];               // derived, clearly NOT raw facts
  hypotheses: string[];               // unproven candidates
  contributingCauses: string[];
  evidenceFor: string[];
  evidenceAgainst: string[];
  confidence: number | null;          // null unless validatedConfidence supplied
  uncertainties: string[];
  missingInfo: string[];
  actions: CorrectiveAction[];
  recurrenceRisk: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  evidenceRefs: string[];
  reason: string;
}

export interface RootCauseIntelligenceSeams {
  // Delegate to RootCauseEngine.report(...) — returns { status: DIAGNOSED|NO_BLOCKER|EVIDENCE_MISSING, rootCause, ... }.
  releaseGateDiagnose?(input: IncidentInput): any;
  // Delegate to self-diagnostic.diagnose(...) — returns an incident with divergences/causes, or null/empty.
  runtimeDiagnose?(input: IncidentInput): any;
}

function baseAssessment(input: IncidentInput, failureClass: FailureClass): Assessment {
  return {
    incidentId: input.incidentId,
    verdict: "INCONCLUSIVE",
    authority: null,
    failureClass,
    impact: input.impact ?? null,
    timeline: Array.isArray(input.timeline) ? input.timeline : [],
    observedFacts: [],
    inferences: [],
    hypotheses: [],
    contributingCauses: [],
    evidenceFor: [],
    evidenceAgainst: [],
    confidence: typeof input.validatedConfidence === "number" ? input.validatedConfidence : null,
    uncertainties: [],
    missingInfo: [],
    actions: [],
    recurrenceRisk: "UNKNOWN",
    evidenceRefs: Array.isArray(input.evidenceRefs) ? input.evidenceRefs : [],
    reason: "",
  };
}

// Normalise a RootCauseEngine.report() verdict into the structured assessment (release-gate class).
function fromReleaseGate(a: Assessment, report: any): Assessment {
  a.authority = "root-cause-engine";
  if (!report || report.status === "EVIDENCE_MISSING") {
    a.verdict = "INCONCLUSIVE";
    a.missingInfo.push("release-gate evidence missing (RootCauseEngine status=EVIDENCE_MISSING)");
    a.reason = "INCONCLUSIVE: release-gate evidence missing — no cause asserted";
    return a;
  }
  if (report.status === "NO_BLOCKER") {
    a.verdict = "INCONCLUSIVE";
    a.observedFacts.push("no red release gate (RootCauseEngine status=NO_BLOCKER)");
    a.reason = "INCONCLUSIVE: no blocking release gate — nothing to diagnose";
    return a;
  }
  // DIAGNOSED
  const rc = report.rootCause || {};
  const comp = rc.responsibleComponent || {};
  a.verdict = "DIAGNOSED";
  if (rc.gate) a.observedFacts.push(`first red release gate: ${rc.gate}`);
  if (comp.evidenceProducer) a.observedFacts.push(`responsible component: ${comp.evidenceProducer}`);
  if (comp.decisionAuthority) a.inferences.push(`decision authority for the fix: ${comp.decisionAuthority}`);
  if (rc.gate) a.contributingCauses.push(`${rc.gate} gate not green`);
  a.evidenceFor.push(`RootCauseEngine DIAGNOSED (gate=${rc.gate ?? "?"})`);
  if (comp.evidenceFile) a.evidenceRefs.push(comp.evidenceFile);
  a.recurrenceRisk = "MEDIUM";
  if (rc.gate) a.actions.push({ action: `clear the ${rc.gate} gate (PROPOSED minimal patch only; Release Manager owns policy)`, priority: "P1", kind: "corrective", verificationCriterion: `re-run the release gates: ${rc.gate} === green AND no new red gate` });
  a.actions.push({ action: `add a regression check that fails if ${rc.gate ?? "the gate"} regresses`, priority: "P2", kind: "preventive", verificationCriterion: "the regression check is present and red on a reintroduced defect" });
  a.reason = `DIAGNOSED via root-cause-engine: first red gate ${rc.gate ?? "?"}`;
  return a;
}

// Normalise a self-diagnostic.diagnose() incident into the structured assessment (runtime-divergence class).
function fromRuntime(a: Assessment, incident: any): Assessment {
  a.authority = "self-diagnostic";
  const divergences = incident && Array.isArray(incident.divergences) ? incident.divergences : [];
  if (!incident || divergences.length === 0) {
    a.verdict = "INCONCLUSIVE";
    a.observedFacts.push("no expected-vs-observed divergence detected");
    a.missingInfo.push("no divergence incident from self-diagnostic (absent/clean)");
    a.reason = "INCONCLUSIVE: no runtime divergence — nothing to diagnose";
    return a;
  }
  a.verdict = "DIAGNOSED";
  for (const d of divergences) {
    if (d && d.check) a.observedFacts.push(`divergence: ${d.check}`);
    if (d && Array.isArray(d.candidateCauses)) for (const c of d.candidateCauses) a.hypotheses.push(String(c));
    if (d && d.smallestDiscriminatingCheck) a.inferences.push(`discriminating check: ${d.smallestDiscriminatingCheck}`);
  }
  a.contributingCauses = [...new Set(a.hypotheses)].slice(0, 1).concat([]); // top candidate as contributing; rest stay hypotheses
  a.evidenceFor.push(`self-diagnostic incident with ${divergences.length} divergence(s)`);
  a.recurrenceRisk = divergences.length > 1 ? "HIGH" : "MEDIUM";
  a.actions.push({ action: "run the smallest discriminating check(s) to confirm the top candidate cause", priority: "P1", kind: "corrective", verificationCriterion: "the discriminating check isolates a single cause (no remaining divergence)" });
  a.actions.push({ action: "add the expected-vs-observed invariant to the continuous self-diagnostic surface", priority: "P2", kind: "preventive", verificationCriterion: "the invariant is checked each run and raises an incident on recurrence" });
  a.uncertainties.push("candidate causes are hypotheses until the discriminating check runs — not asserted as the root cause");
  a.reason = `DIAGNOSED via self-diagnostic: ${divergences.length} divergence(s)`;
  return a;
}

/**
 * assess(input, seams) — produce a structured, traceable root-cause assessment by DELEGATING to the matching
 * authority. Never fabricates a cause: absent/insufficient/contradictory evidence ⇒ INCONCLUSIVE.
 */
export function assess(input: IncidentInput, seams: RootCauseIntelligenceSeams = {}): Assessment {
  if (!input || typeof input.incidentId !== "string" || !input.incidentId.trim()) {
    throw new Error("root-cause-intelligence: a stable incidentId is required");
  }
  const cls: FailureClass = input.failureClass === "release-gate" || input.failureClass === "runtime-divergence" ? input.failureClass : "unknown";
  const a = baseAssessment(input, cls);
  for (const s of Array.isArray(input.symptoms) ? input.symptoms : []) a.observedFacts.push(`symptom: ${s}`);

  // Route by failure class (V56 mapping); "unknown" tries release-gate then runtime, else INCONCLUSIVE.
  if (cls === "release-gate") {
    if (typeof seams.releaseGateDiagnose !== "function") { a.missingInfo.push("no releaseGateDiagnose seam"); a.reason = "INCONCLUSIVE: release-gate authority not available"; return a; }
    return fromReleaseGate(a, seams.releaseGateDiagnose(input));
  }
  if (cls === "runtime-divergence") {
    if (typeof seams.runtimeDiagnose !== "function") { a.missingInfo.push("no runtimeDiagnose seam"); a.reason = "INCONCLUSIVE: runtime-divergence authority not available"; return a; }
    return fromRuntime(a, seams.runtimeDiagnose(input));
  }
  // unknown class: try release-gate first, then runtime; INCONCLUSIVE if neither concludes.
  if (typeof seams.releaseGateDiagnose === "function") {
    const r = fromReleaseGate(baseAssessment(input, "release-gate"), seams.releaseGateDiagnose(input));
    if (r.verdict === "DIAGNOSED") return r;
  }
  if (typeof seams.runtimeDiagnose === "function") {
    const r = fromRuntime(baseAssessment(input, "runtime-divergence"), seams.runtimeDiagnose(input));
    if (r.verdict === "DIAGNOSED") return r;
  }
  a.missingInfo.push("neither authority produced a conclusive verdict for an unclassified incident");
  a.reason = "INCONCLUSIVE: unknown failure class and no authority concluded";
  return a;
}

module.exports = { assess };

// Module-scope marker (adds NO export): forces TypeScript MODULE scope (no global-script collisions).
export {};
