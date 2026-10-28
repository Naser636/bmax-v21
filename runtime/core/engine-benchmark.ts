#!/usr/bin/env node
/**
 * engine-benchmark — a REPRODUCIBLE scorecard for the ODG execution engine (campaign-controller), per the CTO
 * "execution-kernel / 10×" mandate. It does NOT reimplement the engine and makes NO unmeasured improvement claim: it
 * runs a fixed set of representative scenarios against the REAL controller and records, deterministically, which
 * engine guarantees hold. This is the BASELINE measurement — future engine changes compare against the SAME scenarios.
 *
 * Scenarios (map to the nine primitives — STATE/RESOLVER/EVIDENCE/RECOVERY/ALLOCATOR):
 *   resume-after-interruption · dedup-no-repeat · dependency-regression-invalidation ·
 *   independent-selection-under-block · stale-evidence-reconcile · strategy-change-readmit ·
 *   no-false-accept (evidence-required) · cycle-safe · reconcile-after-mission.
 *
 * Pure/deterministic (no clock/random/subprocess); the controller's own helpers are injected with in-memory registers.
 */
"use strict";

const C = require("./campaign-controller.js");

const reg = (items: any[]): any => ({ version: "bench", items });

// Each scenario returns { id, primitive, pass, detail }. A scenario asserts a concrete engine CONTRACT.
const SCENARIOS: Array<{ id: string; primitive: string; run: () => { pass: boolean; detail: string } }> = [
  {
    id: "resume-after-interruption", primitive: "STATE/RECOVERY",
    run: () => {
      // advance A to ACCEPTED, "persist" by value-copy (simulating save→reload), continue selecting B.
      const r = reg([{ id: "A", status: "READY", deps: [], priority: 1 }, { id: "B", status: "READY", deps: ["A"], priority: 2 }]);
      C.advance(r, "A", { status: "ACCEPTED", evidence: "did A" });
      const reloaded = JSON.parse(JSON.stringify(r));                 // crash + reload from durable snapshot
      const next = C.selectNextLot(reloaded);
      return { pass: next.lot && next.lot.id === "B", detail: `after reload next=${next.lot && next.lot.id}` };
    },
  },
  {
    id: "dedup-no-repeat", primitive: "RESOLVER/EXECUTOR",
    run: () => {
      const r = reg([{ id: "A", status: "READY", deps: [], priority: 1 }, { id: "B", status: "READY", deps: [], priority: 2 }]);
      const picks: any[] = [];
      for (let i = 0; i < 4; i++) { const n = C.selectNextLot(r); const id = n.lot ? n.lot.id : null; picks.push(id); if (id) C.advance(r, id, { attemptFailed: true, reason: "unchanged" }); }
      return { pass: JSON.stringify(picks) === JSON.stringify(["A", "B", null, null]), detail: `picks=${JSON.stringify(picks)}` };
    },
  },
  {
    id: "dependency-regression-invalidation", primitive: "EVIDENCE",
    run: () => {
      const r = reg([{ id: "A", status: "ACCEPTED", deps: [], evidence: "a" }, { id: "B", status: "ACCEPTED", deps: ["A"], evidence: "b" }]);
      C.advance(r, "A", { status: "READY" });                         // dep regresses
      const stale = C.staleAcceptances(r);
      return { pass: stale.length === 1 && stale[0].id === "B", detail: `stale=${JSON.stringify(stale.map((s: any) => s.id))}` };
    },
  },
  {
    id: "independent-selection-under-block", primitive: "ALLOCATOR",
    run: () => {
      const r = reg([
        { id: "BLK", status: "BLOCKED", deps: [], priority: 1 },
        { id: "DEP", status: "READY", deps: ["BLK"], priority: 1 },
        { id: "INDEP", status: "READY", deps: [], priority: 3 },
      ]);
      const n = C.selectNextLot(r);
      return { pass: n.lot && n.lot.id === "INDEP", detail: `selected=${n.lot && n.lot.id} (blocked parent did not freeze the graph)` };
    },
  },
  {
    id: "stale-evidence-reconcile", primitive: "EVIDENCE/RECOVERY",
    run: () => {
      const r = reg([{ id: "A", status: "ACCEPTED", deps: [], evidence: "a" }, { id: "B", status: "ACCEPTED", deps: ["A"], evidence: "b" }]);
      C.advance(r, "A", { status: "READY" });
      const rec = C.reconcile(r, { demote: true });
      const B = r.items.find((x: any) => x.id === "B");
      return { pass: rec.demoted.includes("B") && B.status === "IN_PROGRESS" && B.evidence === "" && B.priorEvidence === "b", detail: `B demoted, evidence cleared, priorEvidence kept` };
    },
  },
  {
    id: "strategy-change-readmit", primitive: "RECOVERY/RESOLVER",
    run: () => {
      const r = reg([{ id: "A", status: "READY", deps: [], priority: 1 }]);
      C.advance(r, "A", { attemptFailed: true, reason: "failed" });
      const stalledThenIdle = C.selectNextLot(r).lot === null;        // stalled ⇒ not re-selected
      C.advance(r, "A", { strategy: "v2" });                          // new strategy ⇒ re-admit
      const readmitted = C.selectNextLot(r).lot && C.selectNextLot(r).lot.id === "A";
      return { pass: stalledThenIdle && readmitted, detail: `stalled then re-admitted after strategy change` };
    },
  },
  {
    id: "no-false-accept", primitive: "EVIDENCE/POLICY",
    run: () => {
      const r = reg([{ id: "A", status: "IN_PROGRESS", deps: [], priority: 1 }]);
      const rej = C.advance(r, "A", { status: "ACCEPTED" });          // no evidence ⇒ must be refused
      const stillOpen = r.items[0].status === "IN_PROGRESS";
      return { pass: rej.ok === false && rej.code === "EVIDENCE_REQUIRED" && stillOpen, detail: `ACCEPTED without evidence refused (${rej.code})` };
    },
  },
  {
    id: "cycle-safe", primitive: "RESOLVER",
    run: () => {
      const r = reg([{ id: "A", status: "READY", deps: ["B"] }, { id: "B", status: "READY", deps: ["A"] }]);
      const n = C.selectNextLot(r);
      return { pass: n.lot === null && /planning error/.test(n.reason || ""), detail: `cycle ⇒ idle (no crash): ${n.reason}` };
    },
  },
  {
    id: "reconcile-after-mission", primitive: "STATE/RESOLVER",
    run: () => {
      // after A is re-ACCEPTED, the previously-stale dependent is clean again (graph recomputed).
      const r = reg([{ id: "A", status: "ACCEPTED", deps: [], evidence: "a" }, { id: "B", status: "ACCEPTED", deps: ["A"], evidence: "b" }]);
      C.advance(r, "A", { status: "READY" }); C.reconcile(r);
      const staleMid = C.staleAcceptances(r).length === 1;
      C.advance(r, "A", { status: "ACCEPTED", evidence: "re-a" }); C.reconcile(r);
      const cleanAfter = C.staleAcceptances(r).length === 0;
      return { pass: staleMid && cleanAfter, detail: `graph recomputed: stale while dep down, clean after dep re-ACCEPTED` };
    },
  },
];

/** runEngineBenchmark(): execute all scenarios, return the deterministic baseline scorecard. */
function runEngineBenchmark(): any {
  const results = SCENARIOS.map((s) => { let pass = false; let detail = ""; let error: string | null = null; try { const r = s.run(); pass = r.pass; detail = r.detail; } catch (e: any) { error = (e && e.message) || String(e); } return { id: s.id, primitive: s.primitive, pass, detail, error }; });
  const passed = results.filter((r) => r.pass).length;
  return {
    benchmark: "odg-engine-behaviour-v1",
    total: results.length,
    passed,
    allPass: passed === results.length,
    scorecard: results,
    note: "Baseline measurement of the CURRENT engine (campaign-controller). Deterministic; no unmeasured improvement claimed. Future engine changes re-run the SAME scenarios and compare.",
  };
}

export { SCENARIOS, runEngineBenchmark };
module.exports = { SCENARIOS, runEngineBenchmark };

if (require.main === module) {
  process.stdout.write(JSON.stringify(runEngineBenchmark(), null, 2) + "\n");
}
