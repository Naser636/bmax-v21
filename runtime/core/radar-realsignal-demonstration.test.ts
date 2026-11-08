#!/usr/bin/env node
"use strict";
const assert = require("assert");
const RD = require("./radar-realsignal-demonstration");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V12.4 Phase-4 — REAL-SIGNAL RADAR DEMONSTRATION");

void (async () => {
  // POSITIVE: benign REAL signal flows the full loop; injection-laced variant is QUARANTINED.
  {
    const r = await RD.runDemonstration({ collectors: { metric: () => 1.0 }, now: "2026-11-08T12:20:00Z" });
    check(r.benign.stage === "DONE" && r.benign.decision === "ACCEPT_FOR_EXPERIMENT", "benign REAL signal flows SIGNAL→QUALIFY→EXPERIMENT→DONE");
    check(r.benign.reproducible === true, "experiment is reproducible (replay consistent)");
    check(r.quarantined.decision === "QUARANTINE" && r.quarantined.hypothesisFormed === false, "injection-laced variant QUARANTINED at SIGNAL (no hypothesis)");
    check(r.loopVerified === true, "loop verified end-to-end on real + injected input");
  }

  // HONESTY: a collector that does not meet the success criterion ⇒ INCONCLUSIVE, knowledge NOT integrated (no fabricated PASS).
  {
    const r = await RD.runDemonstration({ collectors: { metric: () => 1.0 } }); // 1.0 < success threshold 1.5
    check(r.benign.verdict !== "PASS" && r.benign.knowledgeIntegrated === false, "no fabricated PASS: unmet criterion ⇒ not validated (negative result kept)");
  }

  // WATCH proposal: observe + propose only, never self-promoted.
  {
    check(RD.FRONTIER_GAP_PROPOSAL.disposition === "WATCH" && RD.FRONTIER_GAP_PROPOSAL.selfPromoted === false, "frontier-gap recorded as WATCH, not self-promoted");
    check(/pass\^k/.test(RD.FRONTIER_GAP_PROPOSAL.gap), "proposal names the concrete gap (pass^k reliability)");
  }

  // PROVENANCE: the captured signal is labelled real-sourced with sources (not presented as synthetic nor as ODG's own).
  {
    check(RD.CAPTURED_SIGNAL.provenance.capturedAt === "2026-11-08" && Array.isArray(RD.CAPTURED_SIGNAL.provenance.sources) && RD.CAPTURED_SIGNAL.provenance.sources.length >= 1, "captured signal carries real-source provenance");
  }

  check(RD.RADAR_REALSIGNAL_CONTRACT.invariants.some((i: any) => /QUARANTINED at SIGNAL/.test(i)), "contract documents injection quarantine");

  console.log(failures === 0 ? "ALL PASS — V12.4 Phase-4 REAL-SIGNAL RADAR DEMONSTRATION" : `FAILURES: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
})();
export {};
