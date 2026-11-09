#!/usr/bin/env node
"use strict";

const F = require("./odg-frontier.js");

let failures = 0;
function check(c: any, label: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + label + "\n"); } }

// parseSignals: "k=v;k=v" ⇒ numeric signals.
const sig = F.parseSignals("throughput=2.0;latencyMs=60");
check(sig.throughput === 2.0 && sig.latencyMs === 60, "parseSignals parses numeric k=v pairs");

// persistFrontierDecision — an in-memory recording seam capturing what gets recorded.
function mkStore() { const recorded: any[] = []; const seen = new Set(); return { recorded, seen, recordProposal: (p: any, opts: any) => { const key = "prop:" + p.candidateId; if (seen.has(key)) return { ok: true, decision: "DUPLICATE", added: false }; seen.add(key); recorded.push(p); return { ok: true, decision: "PROCEED", added: true }; } }; }

// (1) a PROMOTION_REVIEW decision with a selected candidate ⇒ recorded as a PROPOSED, permission-granting-nothing proposal.
{
  const st = mkStore();
  const r = F.persistFrontierDecision({ selected: "frontier-prop:cand:abc", outcome: "PROMOTION_REVIEW", promoted: false, evidencePresent: true, stages: ["RADAR"] }, { recordProposal: st.recordProposal, stamp: (o: any) => ({ ...o, provenance: { contentSha256: "x" } }), now: "2026-11-16T00:00:00Z" });
  check(r.decision === "PROCEED" && r.added === true, "recorded a traceable proposal");
  check(st.recorded[0].status === "PROPOSED" && st.recorded[0].grantsNoPermission === true, "recorded proposal is PROPOSED + grants no permission (proposition ≠ autorisation)");
  check(st.recorded[0].provenance && typeof st.recorded[0].provenance.contentSha256 === "string", "proposal is provenance-stamped (traceable)");
}

// (2) DEDUP: recording the same candidate again ⇒ DUPLICATE, not added twice (survives weekly re-runs).
{
  const st = mkStore();
  const slim = { selected: "frontier-prop:cand:dup", outcome: "PROMOTION_REVIEW", promoted: false };
  F.persistFrontierDecision(slim, { recordProposal: st.recordProposal, stamp: (o: any) => o, now: "t" });
  const second = F.persistFrontierDecision(slim, { recordProposal: st.recordProposal, stamp: (o: any) => o, now: "t" });
  check(second.decision === "DUPLICATE" && st.recorded.length === 1, "re-recording the same candidate ⇒ DUPLICATE (dedup)");
}

// (3) FAIL-CLOSED: a decision marked promoted is REFUSED (the Radar must not self-authorize a promotion).
{
  const st = mkStore();
  const r = F.persistFrontierDecision({ selected: "frontier-prop:cand:x", promoted: true }, { recordProposal: st.recordProposal, stamp: (o: any) => o, now: "t" });
  check(r.decision === "REFUSED" && st.recorded.length === 0, "a promoted decision is REFUSED, never recorded (no auto-promotion)");
}

// (4) no selected candidate ⇒ NO_PROPOSAL (not a failure, nothing to record).
{
  const st = mkStore();
  const r = F.persistFrontierDecision({ selected: null, promoted: false }, { recordProposal: st.recordProposal, stamp: (o: any) => o, now: "t" });
  check(r.decision === "NO_PROPOSAL" && st.recorded.length === 0, "no selected candidate ⇒ NO_PROPOSAL, nothing recorded");
}

if (failures === 0) process.stdout.write("ALL PASS — odg-frontier persistence (V15 traceability)\n");
process.exit(failures === 0 ? 0 : 1);

export {};
