#!/usr/bin/env node
"use strict";

/*
 * WI-FR-06 — FRONTIER PIPELINE (canonical runtime integration). PURE orchestration that wires the five Frontier lots
 * into the REAL ODG canonical chain, creating NO second queue / scheduler / store / authorizer / orchestration:
 *
 *   RADAR → ODG(integrate) → POLICY/AUTHORITY → (canonical selection) → LAB+EVOLUTION(real sandbox) → EVIDENCE → DECISION
 *
 * Reuse map (every stage is an EXISTING canonical mechanism): frontier-radar (signals→proposals); frontier-radar-store
 * (integrate a proposal as a DEFERRED campaign-controller lot); action-gate.evaluateAction (POLICY admission) +
 * objective-authorization.declareAuthorization (ODG-autonomy classification) + an EXTERNAL authorization token (the
 * Radar can NEVER authorize its own discovery); campaign-controller.advance/selectNextLot (the canonical scheduler —
 * no new queue); evolution-loop.runEvolutionCycle (which itself drives frontier-lab + the WI-FR-05 real sandbox runner
 * as the Tester, with the independent verifier); mission-evidence.buildEvidenceRecord + evidence-provenance
 * (canonical EVIDENCE). Promotion stays EXTERNAL/governed. Fail-closed throughout. Pure/deterministic (runner/now
 * injected; the only real I/O is the injected sandbox runner). Dual export.
 */

const RADAR = require("./frontier-radar");
const STORE = require("./frontier-radar-store");
const EVO = require("./evolution-loop");
const AG = require("./action-gate");
const OA = require("./objective-authorization");
const ME = require("./mission-evidence");
const EP = require("./evidence-provenance");
const CC = require("./campaign-controller");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

/**
 * admitProposal(register, proposal, opts) -> admission record + updated register. ODG admission requires BOTH a POLICY
 * ALLOW (action-gate) AND an EXTERNAL authorization (authorizedBy a non-Radar actor, approved). The Radar can never
 * self-authorize. A refused proposal stays as a DEFERRED lot (traceable, not executed).
 */
function admitProposal(register: any, proposal: any, opts: any): any {
  const o = isObj(opts) ? opts : {};
  const now = o.now;
  const integ = STORE.integrateIntoRegister(register, proposal, { now });
  if (!integ.ok) return Object.freeze({ ok: false, reason: integ.reason, register });
  const lot = integ.lot || STORE.toRegisterLot(proposal, { now });
  if (!lot) return Object.freeze({ ok: false, reason: "proposal refused (not PROPOSED)", register });
  const lotId = lot.id;
  // idempotent: the lot already exists in the register (same proposal re-admitted) ⇒ no duplicate, no re-advance.
  if (integ.added === false) return Object.freeze({ ok: true, lotId, proposal, admitted: false, idempotent: true, reason: "lot already present (idempotent)", register: integ.register });

  // POLICY: the sandboxed experiment is an ANALYZE-class (observational, no external mutation) action; a CONSEQUENTIAL
  // promotion would require full admission + authority and is NOT done here (promotion is external). ESCALATE/DENY ⇒ block.
  const action = { principal: "odg", verb: "evaluate", target: "frontier-experiment:" + lotId, actionClass: "ANALYZE", intent: "run a sandboxed frontier experiment for lot " + lotId };
  const policy = AG.evaluateAction(action, isObj(o.policyContext) ? o.policyContext : {});
  // ODG-autonomy classification of the experiment objective (fail-closed: external/human-gated ⇒ excluded).
  const objective = OA.declareAuthorization({ goal: "evaluate frontier candidate " + (proposal && proposal.candidateId) + " in an isolated sandbox" });

  const auth = isObj(o.authorization) ? o.authorization : {};
  const externallyAuthorized = isStr(auth.authorizedBy) && auth.authorizedBy !== "frontier-radar" && auth.authorizedBy !== "evolution-loop" && auth.selfAuthored !== true && auth.approved === true;
  const admitted = policy.decision === AG.DECISION.ALLOW && externallyAuthorized;

  let reg = integ.register;
  if (admitted) { const adv = CC.advance(reg, lotId, { status: "READY" }); reg = adv.register; } // authorization ⇒ DEFERRED→READY

  return Object.freeze({
    ok: true, lotId, proposal,
    policy: Object.freeze({ decision: policy.decision, consequential: policy.consequential === true }),
    objectiveEligible: objective.excluded !== true,
    externallyAuthorized, admitted,
    reason: admitted ? "POLICY ALLOW + external authorization ⇒ admitted (DEFERRED→READY)" : (policy.decision !== AG.DECISION.ALLOW ? "POLICY " + policy.decision : "no external authorization — stays DEFERRED"),
    register: reg,
  });
}

/**
 * runFrontierPipeline(input, deps) -> the full canonical-chain record. input: { radar, register }. deps: { collectors,
 * runner, builder, integritySignals, authorization, policyContext, now }. The runner is the WI-FR-05 real sandbox
 * runner (or an injected Tester for unit tests). Promotion is NOT performed (external/governed).
 */
async function runFrontierPipeline(input: any, deps: any): Promise<any> {
  const i = isObj(input) ? input : {};
  const d = isObj(deps) ? deps : {};
  const now = d.now;

  // 1) RADAR — signals → qualified candidates/proposals.
  const report = RADAR.runRadar(isObj(i.radar) ? i.radar : {});

  // 2) ODG admission (POLICY + AUTHORITY) over each proposal; integrate as canonical DEFERRED lots.
  let register = isObj(i.register) && Array.isArray(i.register.items) ? { items: i.register.items.slice() } : { items: [] };
  const admissions: any[] = [];
  for (const prop of report.proposals) { const a = admitProposal(register, prop, { authorization: d.authorization, policyContext: d.policyContext, now }); admissions.push(a); if (a.register) register = a.register; }

  // 3) CANONICAL SELECTION — the EXISTING campaign-controller selects the next READY lot (no new scheduler).
  const selection = CC.selectNextLot(register);
  if (!selection.lot) return Object.freeze({ ok: true, stage: "selection", report, admissions, register, selection, reason: selection.reason || "no admissible lot (all DEFERRED / POLICY-blocked)", chainTraversed: false });

  // 4) LAB + EVOLUTION — the real self-improvement cycle (uses frontier-lab + the WI-FR-05 sandbox runner internally).
  if (typeof d.runner !== "function" || typeof d.builder !== "function") return Object.freeze({ ok: false, stage: "evolution", reason: "a Builder and a (sandbox) Tester runner are required", report, admissions, register, selection });
  const cycleSpec = {
    id: selection.lot.id, proposalRef: selection.lot.proposalRef,
    budget: isObj(d.budget) ? d.budget : { maxMs: 5000, maxCpuSec: 2 },
    config: isObj(d.config) ? d.config : { sense: { throughput: "higher", latencyMs: "lower" } },
    hypothesis: isObj(d.hypothesis) ? d.hypothesis : { hypothesis: "frontier candidate improves throughput", problem: "bottleneck", expectedOutcome: "throughput up", refutationConditions: [{ metric: "latencyMs", field: "after", op: ">", value: 200 }], successCriteria: [{ metric: "throughput", field: "after", op: ">=", value: 1.5 }] },
  };
  const evo = await EVO.runEvolutionCycle(cycleSpec, { builder: d.builder, runner: d.runner, collectors: d.collectors, integritySignals: d.integritySignals, now });
  const cycle = evo.cycle || null;

  // 5) EVIDENCE — canonical mission-evidence + provenance stamp.
  const verdict = cycle && cycle.verification ? cycle.verification.verdict : null;
  const evidenceRecord = ME.buildEvidenceRecord({
    mission: { id: selection.lot.id, objective: "frontier experiment: " + selection.lot.proposalRef, acceptanceCriteria: "independent PASS + no regression" },
    authorization: { authorized: true, scope: ["frontier-experiment", selection.lot.id] },
    verification: { verified: verdict === "PASS", by: "frontier-lab/independent", method: "preregistered-criteria+integrity" },
    transition: { to: null, from: "DEFERRED", reason: "frontier pipeline cycle " + (cycle && cycle.outcome) },
    limitations: ["promotion is external/governed (not performed by the pipeline)"],
  }, { at: now });
  const stamped = EP.stampProvenance ? safeStamp(evidenceRecord, now) : evidenceRecord;

  // 6) DECISION — the cycle outcome; promotion stays EXTERNAL.
  return Object.freeze({
    ok: true, chainTraversed: true,
    report, admissions, register, selection,
    cycle, evidence: stamped,
    decision: Object.freeze({ outcome: cycle ? cycle.outcome : null, promoted: !!(cycle && cycle.promoted), promotionIsExternal: true }),
    stages: Object.freeze(["RADAR", "ODG_INTEGRATE", "POLICY_AUTHORITY", "CANONICAL_SELECTION", "LAB+EVOLUTION(sandbox)", "EVIDENCE", "DECISION"]),
  });
}

function safeStamp(record: any, now: any): any {
  try { return EP.stampProvenance(record, { at: now, sourceRevision: "frontier-pipeline" }); }
  catch { return record; }
}

const FRONTIER_PIPELINE_CONTRACT = Object.freeze({
  id: "WI-FR-06-FRONTIER-PIPELINE",
  source: "Resumption mandate WI-FR-06 — canonical runtime integration Radar→ODG→POLICY→Lab→Evolution→Evidence→Decision",
  reuses: Object.freeze(["frontier-radar", "frontier-radar-store", "evolution-loop (→frontier-lab→frontier-sandbox)", "action-gate (POLICY)", "objective-authorization", "campaign-controller (register + selectNextLot)", "mission-evidence + evidence-provenance"]),
  notAuthority: "wires existing components into the canonical chain; creates NO second queue/scheduler/store/authorizer; promotion stays external/governed",
  invariants: Object.freeze([
    "NO parallel architecture — every stage is an existing canonical mechanism (campaign-controller is the only scheduler)",
    "ODG admission requires POLICY ALLOW (action-gate) AND an EXTERNAL authorization; the Radar can NEVER self-authorize",
    "a non-admitted proposal remains a DEFERRED lot (traceable, not executed)",
    "the real WI-FR-05 sandbox runner is the Tester; executor≠verifier is preserved via evolution-loop/frontier-lab",
    "promotion is NOT performed by the pipeline (external/governed); evidence is canonical (mission-evidence + provenance)",
    "fail-closed: no admissible lot ⇒ chainTraversed:false; missing Builder/Tester ⇒ refused",
  ]),
});

module.exports = { FRONTIER_PIPELINE_CONTRACT, admitProposal, runFrontierPipeline };

if (require.main === module) { process.stdout.write(JSON.stringify(FRONTIER_PIPELINE_CONTRACT, null, 2) + "\n"); }

export {};
