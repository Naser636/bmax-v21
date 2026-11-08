#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 20 (Étape 2) — INTEGRATED SELF-IMPROVEMENT CHAIN entry point. PURE given injected inputs. ONE call that runs
 * the DISCOVERY→PROPOSAL half of the loop by COMPOSING the three existing modules (no parallel engine):
 *   DIAGNOSE   — global-improvement-engine.observe (codebase-diagnostic + scorecard),
 *   ANALYZE    — global-improvement-engine.analyzeGaps (honest NO_FINDING/NOT_MEASURED/HEALTHY/DEGRADED/UNKNOWN),
 *   PROPOSE    — self-mission-proposer.proposeFromGaps (PROPOSED verifiable missions; owner-gated → OWNER_DECISION).
 * The chain STOPS at PROPOSED: it NEVER self-authorizes. CANONICAL AUTHORIZATION (action-gate/campaign-controller) and
 * the execution half — SANDBOX → BUILD → ADVERSARIAL EVAL → RETAIN/ROLLBACK (self-improvement.runSelfImprovement) — run
 * AFTER authorization, through the existing canonical mechanisms (referenced, not duplicated). Fail-closed. Dual export.
 */

const ENGINE = require("./global-improvement-engine");
const PROPOSER = require("./self-mission-proposer");
const SI = require("./self-improvement");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

const CHAIN_STAGES = Object.freeze([
  "DIAGNOSE", "ANALYZE", "PROPOSE", "CANONICAL_AUTHORIZATION", "SANDBOX", "BUILD", "ADVERSARIAL_EVAL", "RETAIN_OR_ROLLBACK",
]);

/** runDiscoveryToProposal(facts, opts?) -> { status, snapshot, gapAnalysis, proposals, ownerDecisions, quarantined,
 * nextStage, selfAuthorized }. Composes DIAGNOSE→ANALYZE→PROPOSE; stops at the canonical-authorization boundary. */
function runDiscoveryToProposal(facts: any, opts?: any): any {
  const o = isObj(opts) ? opts : {};
  const snapshot = ENGINE.observe(isObj(facts) ? facts : {}, o);          // DIAGNOSE
  const gapAnalysis = ENGINE.analyzeGaps(snapshot, o);                     // ANALYZE (health taxonomy)
  const proposal = PROPOSER.proposeFromGaps(gapAnalysis, o);              // PROPOSE (PROPOSED verifiable missions)
  const hasActionable = proposal.proposals.length > 0;
  return Object.freeze({
    status: gapAnalysis.status, stages: CHAIN_STAGES,
    snapshot, gapAnalysis: Object.freeze({ status: gapAnalysis.status, targets: gapAnalysis.targets }),
    proposals: proposal.proposals, ownerDecisions: proposal.ownerDecisions, quarantined: proposal.quarantined,
    selfAuthorized: false,                                                  // invariant: the chain never self-authorizes
    nextStage: hasActionable ? "CANONICAL_AUTHORIZATION" : "NONE (no actionable gap — NO_FINDING is not a mission)",
    executionNote: "SANDBOX→BUILD→ADVERSARIAL_EVAL→RETAIN/ROLLBACK run via self-improvement.runSelfImprovement AFTER the canonical gate authorizes a proposal — this entry point runs discovery→proposal only.",
  });
}

/** completenessOfExecutionHalf() -> the self-improvement loop's own completeness (reuses SI.assessCompleteness). */
function completenessOfExecutionHalf(): any { const c = SI.assessCompleteness(); return Object.freeze({ complete: !!(c && c.complete === true), stages: SI.REQUIRED_STAGES }); }

const SELF_IMPROVEMENT_CHAIN_CONTRACT = Object.freeze({
  id: "V124-SELF-IMPROVEMENT-CHAIN",
  source: "SÉRIE 20 Étape 2 — integrated DIAGNOSE→ANALYZE→PROPOSE→[canonical gate]→SANDBOX→BUILD→EVAL→RETAIN/ROLLBACK",
  stages: CHAIN_STAGES,
  reuses: Object.freeze(["global-improvement-engine (diagnose+analyze)", "self-mission-proposer (propose)", "self-improvement (execution half, post-authorization)", "action-gate/campaign-controller (canonical authorization)"]),
  notAuthority: "a composition entry point; it stops at PROPOSED and NEVER self-authorizes — the canonical gate decides",
  invariants: Object.freeze([
    "composes the 3 existing modules — no parallel engine/governance/registry",
    "the chain runs DISCOVERY→PROPOSAL and STOPS at the canonical-authorization boundary; selfAuthorized is always false",
    "no actionable gap ⇒ nextStage NONE (NO_FINDING is not a mission); honest health taxonomy preserved",
    "execution (sandbox/build/eval/retain-rollback) runs via self-improvement AFTER authorization — referenced, not duplicated",
  ]),
});

module.exports = { CHAIN_STAGES, runDiscoveryToProposal, completenessOfExecutionHalf, SELF_IMPROVEMENT_CHAIN_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...SELF_IMPROVEMENT_CHAIN_CONTRACT, demo: runDiscoveryToProposal({ registerAccepted: 268 }) }, null, 2) + "\n"); }

export {};
