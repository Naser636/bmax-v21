#!/usr/bin/env node
"use strict";
const assert = require("assert");
const SMP = require("./self-mission-proposer");
const G = require("./global-improvement-engine");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 19 §7 — SELF-MISSION PROPOSER");

// a COMPUTER_SIDE gap (COVERAGE) ⇒ a PROPOSED, verifiable, non-self-authorized mission.
{
  const r = SMP.proposeFromGaps({ status: "DEGRADED", targets: [{ kind: "COVERAGE", detail: "2 uncovered library modules", items: ["a", "b"], priority: 1 }] });
  check(r.proposals.length === 1, "a coverage gap ⇒ 1 self-executable proposal");
  const p = r.proposals[0];
  check(p.status === "PROPOSED" && p.grantsNoPermission === true && p.selfAuthorized === false, "proposal is PROPOSED + grantsNoPermission + NOT self-authorized");
  check(typeof p.verifiableAcceptance === "string" && p.verifiableAcceptance.length > 10, "proposal carries a VERIFIABLE acceptance (closes the verification gap)");
  check(p.linksToCanonicalMissionPath === true, "proposal links to the canonical mission path (canonical gate decides)");
}

// an OWNER_GATED gap (SCORECARD) ⇒ routed to OWNER_DECISION, NOT a self-mission.
{
  const r = SMP.proposeFromGaps({ status: "DEGRADED", targets: [{ kind: "SCORECARD", detail: "gates: 0/7 PASS", priority: 2 }] });
  check(r.proposals.length === 0 && r.ownerDecisions.length === 1, "an owner-gated gap ⇒ OWNER_DECISION, not a self-mission");
  check(/owner information\/authorization/.test(r.ownerDecisions[0].reason), "owner-decision reason names the owner dependency");
}

// fail-closed: no gaps ⇒ no proposals (no manufactured mission).
{
  const r = SMP.proposeFromGaps({ status: "NO_FINDING", targets: [] });
  check(r.proposals.length === 0 && r.ownerDecisions.length === 0 && r.selfAuthorizedAny === false, "no gap ⇒ no proposal, never self-authorized");
}

// LIVE: feed the real global-engine gap analysis ⇒ proposer never self-authorizes.
{
  const live = G.analyzeGaps(G.observe({ registerAccepted: 267 }));
  const r = SMP.proposeFromGaps(live);
  check(r.selfAuthorizedAny === false && r.proposals.every((p: any) => p.status === "PROPOSED"), "LIVE: every proposal PROPOSED, none self-authorized");
}

check(SMP.SELF_MISSION_PROPOSER_CONTRACT.invariants.some((i: any) => /NEVER AUTHORIZED/.test(i)), "contract: never AUTHORIZED/EXECUTING");

console.log(failures === 0 ? "ALL PASS — SÉRIE 19 §7 SELF-MISSION PROPOSER" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
