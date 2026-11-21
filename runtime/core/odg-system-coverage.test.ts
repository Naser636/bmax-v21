#!/usr/bin/env node
"use strict";
/* Tests for odg-system-coverage (V360 §2 full-system coverage matrix). Injected modules + consumersOf ⇒ zero fs/network.
 * Proves: status DERIVED from the real consumer-graph (CONNECTED / NO_CONSUMER), domain grouping, orphan detection,
 * REGRESSION detection vs a prior snapshot, and the honest scope (FUNCTION/MEASURE/PROOF not graph-derivable). */
const M = require("./odg-system-coverage.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

// a synthetic graph: frontier-radar is consumed; orphan-xyz by nobody; a bin entry consumed by a bin only.
const modules = ["frontier-radar", "odg-radar-learning-bridge", "memory-taxonomy", "orphan-widget", "cognitive-campaign-driver", "frontier-radar.test"];
const consumers: Record<string, string[]> = {
  "frontier-radar": ["frontier-pipeline", "frontier-radar.test"],   // real consumer + a test (test ignored)
  "odg-radar-learning-bridge": ["odg-lesson-decision-loop"],
  "memory-taxonomy": ["odg-radar-learning-bridge"],
  "orphan-widget": [],                                              // no consumer ⇒ candidate orphan
  "cognitive-campaign-driver": ["odg-cognitive-drivers-run"],      // consumed by a bin
};
const consumersOf = (m: string) => consumers[m] || [];

function main(): void {
  const cov = M.buildCoverage({ modules, consumersOf, asOf: "2026-11-21" });

  // status DERIVED, not asserted
  check("frontier-radar CONNECTED (real non-test consumer)", cov.statusByModule["frontier-radar"] === "CONNECTED");
  check("test module excluded from the matrix", cov.statusByModule["frontier-radar.test"] === undefined);
  check("orphan-widget NO_CONSUMER (candidate orphan)", cov.statusByModule["orphan-widget"] === "NO_CONSUMER");
  check("orphan surfaced in orphanCandidates", cov.orphanCandidates.indexOf("orphan-widget") >= 0);

  // domain grouping (name heuristics)
  const radar = cov.domains.find((d: any) => d.domain === "radar-frontier");
  check("radar-frontier domain aggregates frontier-radar + bridge (2 connected)", !!radar && radar.connected === 2);
  const mem = cov.domains.find((d: any) => d.domain === "memory-learning");
  check("memory-learning domain present (memory-taxonomy)", !!mem && mem.total >= 1);

  // counts
  check("counts: 5 non-test modules, 4 connected, 1 no-consumer", cov.counts.modules === 5 && cov.counts.connected === 4 && cov.counts.noConsumer === 1);

  // REGRESSION detection vs a prior snapshot: frontier-radar was CONNECTED, now loses its consumer.
  const prev = cov.statusByModule;
  const consumers2 = { ...consumers, "frontier-radar": ["frontier-radar.test"] }; // only a test consumer now ⇒ NO_CONSUMER
  const cov2 = M.buildCoverage({ modules, consumersOf: (m: string) => (consumers2 as any)[m] || [], previous: prev });
  check("REGRESSION detected: frontier-radar CONNECTED → NO_CONSUMER (LOST_CONSUMER)", cov2.regressions.some((r: any) => r.module === "frontier-radar" && r.kind === "LOST_CONSUMER"));

  // REMOVED detection
  const cov3 = M.buildCoverage({ modules: modules.filter((m) => m !== "orphan-widget"), consumersOf, previous: { "orphan-widget": "CONNECTED" } });
  check("REMOVED detected: a module present in prev but absent now (was CONNECTED)", cov3.regressions.some((r: any) => r.module === "orphan-widget" && r.kind === "REMOVED"));

  // newly-connected
  const cov4 = M.buildCoverage({ modules, consumersOf, previous: { "orphan-widget": "NO_CONSUMER", "frontier-radar": "NO_CONSUMER" } });
  check("newly-connected detected (frontier-radar NO_CONSUMER → CONNECTED)", cov4.newlyConnected.indexOf("frontier-radar") >= 0);

  // HONEST SCOPE — the whole point: connectivity grounded, function/measure/proof NOT claimed
  check("scope: CONNECTION/CALL grounded", JSON.stringify(cov.scope.grounded).indexOf("CONNECTION") >= 0 && JSON.stringify(cov.scope.grounded).indexOf("CALL") >= 0);
  check("scope: FUNCTION/MEASURE/PROOF explicitly NOT graph-derivable (not fabricated)", JSON.stringify(cov.scope.notGraphDerivable).indexOf("MEASURE") >= 0 && JSON.stringify(cov.scope.notGraphDerivable).indexOf("PROOF") >= 0);
  check("note refuses to present a partial audit as full-ODG coverage", /not .*presented as full-ODG coverage/i.test(cov.note));

  // domainOf heuristics
  check("domainOf: heal/repair → self-healing", M.domainOf("odg-self-healing-run") === "self-healing");
  check("domainOf: truth-lock → primitives-governance", M.domainOf("truth-lock") === "primitives-governance");

  // frozen + contract
  check("frozen result", Object.isFrozen(cov) && Object.isFrozen(cov.domains));
  check("contract: derived not asserted; honest scope; regression; reuses change-impact-graph; no 2nd graph",
    /DERIVED from the real consumer-graph/.test(JSON.stringify(M.SYSTEM_COVERAGE_CONTRACT.invariants)) &&
    /not graph-derivable/i.test(JSON.stringify(M.SYSTEM_COVERAGE_CONTRACT.invariants)) &&
    /REGRESSIONS/.test(JSON.stringify(M.SYSTEM_COVERAGE_CONTRACT.invariants)) &&
    /change-impact-graph/.test(JSON.stringify(M.SYSTEM_COVERAGE_CONTRACT.reuses)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-system-coverage (V360 §2: grounded full-repo connectivity coverage over the real require-graph; status DERIVED [CONNECTED/NO_CONSUMER]; domain grouping; orphan + REGRESSION detection; honest scope — FUNCTION/MEASURE/PROOF not graph-derivable, never fabricated; reuses change-impact-graph, no 2nd graph)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
