#!/usr/bin/env node
/*
 * ODG Campaign Loop — HERMETIC continuity test (CAMPAIGN_LOOP_GOVERNED §7). No real mission, no spawn.
 * Proves the governed loop: (1) finishes a mission → records checkpoint → selects next → continues to
 * completion; (2) stops on a real blocker; (3) resumes from checkpoint (skips completed); (4) anti-reloop
 * (a selector that never advances cannot spin forever); (5) bounded recovery on consecutive failures.
 */

"use strict";

import assert from "node:assert";
import { campaignLoop, MissionId } from "./odg-campaign-loop";

let passed = 0;
function ok(name: string, cond: boolean): void { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }
const firstUndone = (queue: MissionId[], done: ReadonlySet<MissionId>): MissionId | null => queue.find((m) => !done.has(m)) || null;

console.log("1 — chains missions, checkpoints each, stops when none remain");
{
  const queue: MissionId[] = ["M1", "M2", "M3"];
  const checkpoints: MissionId[] = [];
  const out = campaignLoop({
    selectNext: (done) => firstUndone(queue, done),
    runMission: () => ({ ok: true }),
    recordCheckpoint: (m) => { checkpoints.push(m); },
  });
  ok("ran all 3 in order (iterations=3)", out.iterations === 3);
  ok("completed all 3", out.completed.includes("M1") && out.completed.includes("M2") && out.completed.includes("M3"));
  ok("checkpoint recorded per mission, in order", checkpoints.join() === "M1,M2,M3");
  ok("stopped because no admissible mission remained", /no admissible mission remaining/.test(out.stoppedReason));
}

console.log("2 — stops on a real blocker without touching later missions");
{
  const queue: MissionId[] = ["M1", "M2", "M3"];
  const out = campaignLoop({
    selectNext: (done) => firstUndone(queue, done),
    runMission: (m) => (m === "M2" ? { ok: false, blocked: true, detail: "needs human authorization" } : { ok: true }),
    recordCheckpoint: () => {},
  });
  ok("stopped AT the blocker M2", /blocked at 'M2'/.test(out.stoppedReason));
  ok("M1 completed, M3 never reached", out.completed.includes("M1") && !out.completed.includes("M3"));
  ok("blocker recorded as failed", out.failed.join() === "M2");
}

console.log("3 — resumes from checkpoint (seeded completed set is skipped)");
{
  const queue: MissionId[] = ["M1", "M2", "M3"];
  const ran: MissionId[] = [];
  const out = campaignLoop({
    selectNext: (done) => firstUndone(queue, done),
    runMission: (m) => { ran.push(m); return { ok: true }; },
    recordCheckpoint: () => {},
    seedCompleted: ["M1"],
  });
  ok("skipped the already-completed M1", !ran.includes("M1") && ran.join() === "M2,M3");
  ok("final completed set includes the seed + the new ones", out.completed.includes("M1") && out.completed.includes("M3"));
}

console.log("4 — anti-reloop: a selector that never advances cannot spin forever");
{
  let runs = 0;
  const out = campaignLoop({
    selectNext: () => "M1", // buggy/stateless: always returns the same mission
    runMission: () => { runs += 1; return { ok: true }; },
    recordCheckpoint: () => {},
    maxIterations: 1000,
  });
  ok("ran M1 exactly once then stopped (not 1000×)", runs === 1 && out.iterations === 1);
  ok("stop reason names the anti-reloop guard", /anti-reloop/.test(out.stoppedReason));
}

console.log("5 — bounded recovery: stops after N consecutive transient failures");
{
  let runs = 0;
  const out = campaignLoop({
    selectNext: () => "MF", // keeps offering the failing (never-completed) mission
    runMission: () => { runs += 1; return { ok: false, detail: "transient failure" }; },
    recordCheckpoint: () => {},
    maxConsecutiveFailures: 2,
    maxIterations: 1000,
  });
  ok("stopped after exactly 2 consecutive failures (bounded)", runs === 2 && out.iterations === 2);
  ok("stop reason names bounded recovery", /bounded recovery exhausted/.test(out.stoppedReason));
}

console.log(`\nODG CAMPAIGN LOOP — ${passed} assertions passed.`);
