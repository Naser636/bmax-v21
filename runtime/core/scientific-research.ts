#!/usr/bin/env node
"use strict";

/*
 * V12.4 §26 — SCIENTIFIC RESEARCH runtime loop. PURE composition over the EXISTING chain (NO new engine): it turns a
 * research SIGNAL into VALIDATED KNOWLEDGE end-to-end —
 *   SIGNAL(frontier-radar normalize/sanitize/qualify/decide) → HYPOTHESIS(frontier-lab) → EXPERIMENT + REPLAY
 *   (reproducibility) → INDEPENDENT EVALUATION(frontier-lab) → KNOWLEDGE INTEGRATION(compounding-loop).
 * Discipline: external content is UNTRUSTED (injection ⇒ QUARANTINE, no experiment); a hypothesis runs only if the
 * signal is qualified; a result becomes validated knowledge ONLY if the experiment is reproducible AND independently
 * verified; NEGATIVE results are KEPT (not discarded); provenance is preserved. Pure/deterministic (runner injected).
 * Dual export.
 */

const RADAR = require("./frontier-radar");
const LAB = require("./frontier-lab");
const COMP = require("./compounding-loop");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

/**
 * runResearchCycle(signalSpec, deps) -> research record. signalSpec: raw signal {title,categories,claims,body}. deps:
 * { source, collectors, runner, integritySignals, transferTarget, now }. Fail-closed at each stage.
 */
async function runResearchCycle(signalSpec: any, deps: any): Promise<any> {
  const d = isObj(deps) ? deps : {};
  const now = d.now;
  const sourceId = isObj(d.source) && isStr(d.source.id) ? d.source.id : "research-source";

  // SIGNAL: normalize + sanitize (external content is untrusted data).
  const sig = RADAR.normalizeSignal(isObj(signalSpec) ? signalSpec : {}, { sourceId, now });
  const meta = RADAR.sanitizeExternal(sig);
  if (meta.untrusted === true) return Object.freeze({ ok: true, stage: "SIGNAL", decision: "QUARANTINE", hypothesisFormed: false, reason: "untrusted/injection content — quarantined, no experiment", provenance: sig.provenance });

  // QUALIFY + DECIDE: a hypothesis runs only if the signal is qualified for experiment.
  const srcRel = isObj(d.source) && typeof d.source.reliability === "number" ? d.source.reliability : 0.9;
  const q = RADAR.qualify(sig, { sourceReliability: srcRel, impactHint: 0.8, baseline: { focusAreas: sig.categories, crossChecked: true } });
  const decision = RADAR.decide(q, meta);
  if (decision !== "ACCEPT_FOR_EXPERIMENT") return Object.freeze({ ok: true, stage: "QUALIFY", decision, hypothesisFormed: false, reason: "signal not qualified for experiment (" + decision + ")", provenance: sig.provenance });

  // HYPOTHESIS + EXPERIMENT (frontier-lab) + REPLAY (reproducibility).
  const labSpec = {
    id: "research:" + sig.fingerprint, proposalRef: sig.fingerprint, touchesProduction: false,
    budget: isObj(d.budget) ? d.budget : { maxMs: 5000, maxCalls: 10, maxCostEur: 0 },
    config: { sense: { metric: "higher" } },
    hypothesis: { hypothesis: "the signal's claim holds under test", problem: sig.title, expectedOutcome: "metric improves", refutationConditions: [{ metric: "metric", field: "after", op: "<", value: 1 }], successCriteria: [{ metric: "metric", field: "after", op: ">=", value: 1.5 }] },
  };
  const exp1 = await LAB.runLabExperiment(labSpec, { collectors: isObj(d.collectors) ? d.collectors : { metric: () => 1.0 }, runner: d.runner, integritySignals: d.integritySignals, now });
  const exp2 = await LAB.runLabExperiment(labSpec, { collectors: isObj(d.collectors) ? d.collectors : { metric: () => 1.0 }, runner: d.runner, integritySignals: d.integritySignals, now });
  const reproducible = JSON.stringify(exp1.experiment && exp1.experiment.measurement) === JSON.stringify(exp2.experiment && exp2.experiment.measurement);
  const verdict = exp1.experiment && exp1.experiment.verification ? exp1.experiment.verification.verdict : (exp1.aborted ? "ABORTED" : "INCONCLUSIVE");

  // INDEPENDENT EVAL already in the Lab verification. KNOWLEDGE INTEGRATION only on reproducible PASS.
  let knowledgeIntegrated = false; let compounding: any = null;
  if (verdict === "PASS" && reproducible) {
    const assetSpec = { id: "knowledge:" + sig.fingerprint, kind: "knowledge", signature: sig.fingerprint, evidenceRefs: ["experiment:" + sig.fingerprint], provenance: "scientific-research", domain: { domainKey: (sig.categories && sig.categories[0]) || "research", goal: "validated knowledge", scope: "local" }, benefit: 10, storageCost: 1, retrievalCost: 1, maintenanceCost: 1, uses: 1, reliability: 1, freshness: 1 };
    compounding = COMP.runCompoundingCycle(assetSpec, { target: isObj(d.transferTarget) ? d.transferTarget : {}, rewardHacking: { builder: "experiment", validator: "frontier-lab" }, now });
    knowledgeIntegrated = compounding && compounding.capability === "VALIDATED_CAPABILITY";
  }
  const negativeResultKept = !knowledgeIntegrated; // a non-validated result is retained as a negative result, not discarded.
  return Object.freeze({
    ok: true, stage: "DONE", decision, hypothesisFormed: true,
    reproducible, verdict, knowledgeIntegrated, negativeResultKept, compounding,
    provenance: sig.provenance,
    note: "validated knowledge only on reproducible + independently-verified PASS; negative results are KEPT; injection quarantined; provenance preserved",
  });
}

const SCIENTIFIC_RESEARCH_CONTRACT = Object.freeze({
  id: "V124-SCIENTIFIC-RESEARCH",
  source: "V12.4 §26 — scientific research runtime (signal→hypothesis→reproducible experiment→independent eval→validated knowledge)",
  reuses: Object.freeze(["frontier-radar (signal/sanitize/qualify)", "frontier-lab (hypothesis/experiment/independent verify)", "compounding-loop (validated knowledge integration)"]),
  notAuthority: "turns a signal into validated knowledge end-to-end; it promotes nothing by self-report, trains no model, and discards no negative result",
  invariants: Object.freeze([
    "NO new engine — composes frontier-radar + frontier-lab + compounding-loop",
    "external content is UNTRUSTED: injection ⇒ QUARANTINE (no experiment)",
    "a hypothesis runs only on a qualified signal; knowledge is validated ONLY on reproducible + independently-verified PASS",
    "NEGATIVE results are KEPT (not discarded); provenance preserved throughout",
    "pure/deterministic; the only real I/O is the injected experiment runner",
  ]),
});

module.exports = { SCIENTIFIC_RESEARCH_CONTRACT, runResearchCycle };

if (require.main === module) { process.stdout.write(JSON.stringify(SCIENTIFIC_RESEARCH_CONTRACT, null, 2) + "\n"); }

export {};
