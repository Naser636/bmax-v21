#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 19 (§7 — self-discovery → verifiable missions) — SELF-MISSION PROPOSER. PURE, deterministic. Closes the
 * "verification gap" noted across 2026 self-improving-agent research (AIDE², Gödel Agent, AI-Scientist-v2): autonomous
 * DISCOVERY is easy, but turning a finding into a VERIFIED result under governance is the hard part — and the frontier
 * convention is that the HUMAN keeps problem-selection + authorization while the agent PROPOSES + iterates. This turns
 * the global-improvement-engine's discovered gaps into PROPOSED, VERIFIABLE missions that carry an explicit acceptance
 * criterion, and ROUTES owner-gated gaps to an OWNER_DECISION — the proposer NEVER self-authorizes, promotes, or
 * fabricates a mission. Reuses global-improvement-engine.analyzeGaps + the canonical PROPOSED mission shape (no second
 * mission system). Fail-closed: no actionable gap ⇒ no proposal. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

// classify a discovered target as COMPUTER_SIDE (ODG can propose a self-executable mission) vs OWNER_GATED.
function classifyTarget(t: any): string {
  const kind = isObj(t) ? t.kind : null;
  if (kind === "COVERAGE") return "COMPUTER_SIDE";   // e.g. an uncovered library module ⇒ add a test (computer-side)
  return "OWNER_GATED";                               // SCORECARD forecast items (gates/campaigns) need owner demonstration/info
}

// a verifiable acceptance for a computer-side target (what would PROVE the mission done) — addresses the verification gap.
function verifiableAcceptance(t: any): string {
  if (isObj(t) && t.kind === "COVERAGE") return "each listed module gains a same-named unit test; codebase-diagnostic reports it DIRECT (UNCOVERED count decreases); odg-test-report PASS";
  return "the named dimension is independently DEMONSTRATED (not merely documented) per §103 — requires owner information/authorization";
}

/** proposeFromGaps(gapAnalysis, opts?) -> { proposals, ownerDecisions }. proposals = PROPOSED self-executable missions
 * (grantsNoPermission, selfAuthorized:false); ownerDecisions = gaps routed to the owner. Fail-closed: no gap ⇒ none. */
function proposeFromGaps(gapAnalysis: any, opts?: any): any {
  const g = isObj(gapAnalysis) ? gapAnalysis : {};
  const o = isObj(opts) ? opts : {};
  const targets = arr(g.targets);
  const proposals: any[] = []; const ownerDecisions: any[] = [];
  for (const t of targets) {
    const cls = classifyTarget(t);
    if (cls === "COMPUTER_SIDE") {
      proposals.push(Object.freeze({
        kind: "MISSION_PROPOSAL", status: "PROPOSED",            // PROPOSED ≠ AUTHORIZED ≠ EXECUTING
        grantsNoPermission: true, selfAuthorized: false, linksToCanonicalMissionPath: true,
        objective: "Improve: " + (t.detail || "discovered gap"),
        verifiableAcceptance: verifiableAcceptance(t), priority: t.priority || 1, proposedAt: o.now || null,
      }));
    } else {
      ownerDecisions.push(Object.freeze({ kind: "OWNER_DECISION", detail: t.detail || "owner-gated gap", reason: "requires owner information/authorization or external reality — not self-executable", verifiableAcceptance: verifiableAcceptance(t) }));
    }
  }
  return Object.freeze({
    sourceStatus: g.status || null,
    proposals: Object.freeze(proposals), ownerDecisions: Object.freeze(ownerDecisions),
    selfAuthorizedAny: false,   // invariant: the proposer never self-authorizes
    note: "discovered gaps → PROPOSED verifiable missions (canonical gate decides) + owner-routed decisions; never self-authorized; no gap ⇒ no proposal",
  });
}

const SELF_MISSION_PROPOSER_CONTRACT = Object.freeze({
  id: "V124-SELF-MISSION-PROPOSER",
  source: "SÉRIE 19 §7 — self-discovery → verifiable missions (closes the 2026 self-improving-agent verification gap, under governance)",
  reference: Object.freeze({ theme: "discovery is easy; verified-under-governance is hard; human keeps authorization, agent proposes", sources: Object.freeze(["arXiv 2608.05179 Verification Gap", "arXiv 2609.26457 recursive self-improvement", "Self-Improvements in Agentic Systems survey 2607.13104"]) }),
  reuses: Object.freeze(["global-improvement-engine.analyzeGaps", "canonical PROPOSED mission shape (frontier-radar.toMissionProposal)"]),
  notAuthority: "a proposer; every mission is PROPOSED and grantsNoPermission — the canonical gate authorizes, never this module",
  invariants: Object.freeze([
    "every emitted mission is status PROPOSED + grantsNoPermission + selfAuthorized:false — NEVER AUTHORIZED/EXECUTING",
    "each proposal carries a VERIFIABLE acceptance criterion (closes the verification gap) — not just a vague suggestion",
    "owner-gated gaps are routed to OWNER_DECISION (not a self-executable mission); a computer-side gap ⇒ a self-executable proposal",
    "fail-closed: no discovered gap ⇒ no proposal (no manufactured mission); reuses existing mechanisms; no second mission system",
  ]),
});

module.exports = { classifyTarget, verifiableAcceptance, proposeFromGaps, SELF_MISSION_PROPOSER_CONTRACT };

if (require.main === module) {
  const demo = proposeFromGaps({ status: "DEGRADED", targets: [{ kind: "COVERAGE", detail: "2 uncovered library modules", priority: 1 }, { kind: "SCORECARD", detail: "gates: 0/7 PASS", priority: 2 }] });
  process.stdout.write(JSON.stringify({ ...SELF_MISSION_PROPOSER_CONTRACT, demo }, null, 2) + "\n");
}

export {};
