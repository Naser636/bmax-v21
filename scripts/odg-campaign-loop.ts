#!/usr/bin/env node
/*
 * ODG Governed Campaign Loop — continuous multi-mission driver (CAMPAIGN_LOOP_GOVERNED).
 *
 * NOT a second orchestrator: it COMPOSES the existing governed primitives into a continuous campaign so
 * ODG chains admissible missions without human intervention between them:
 *   selectNext  → migration-selector.recommendNext (risk-first next-mission choice over the real inventory)
 *   runMission  → runtime/bin/odg-local-pipeline.sh <mission> (the existing per-mission governed pipeline
 *                 with its checkpoint trap + gates) OR odg-run; a NON-zero exit is a real stop signal
 *   recordCheck → tsx scripts/compass-update.ts --from-report (the canonical anti-stale checkpoint recorder)
 *
 * The CORE (campaignLoop) is PURE and dependency-injected so continuity is HERMETICALLY testable (no real
 * mission, no spawn): finish → checkpoint → select next → continue; stop ONLY on (a) no admissible mission,
 * (b) a real blocker, (c) bounded consecutive failures, or (d) an iteration cap. An ANTI-RELOOP guard makes
 * it impossible to re-run an already-completed mission (a buggy/stateless selector can never spin forever).
 * Resume is modeled by seeding the completed set from the compass. Deterministic; no clock, no randomness.
 */

"use strict";

export type MissionId = string;
export type RunResult = { ok: boolean; blocked?: boolean; detail?: string };
export type LoopDeps = {
  selectNext: (completed: ReadonlySet<MissionId>) => MissionId | null;
  runMission: (m: MissionId) => RunResult;
  recordCheckpoint: (m: MissionId, r: RunResult) => void;
  maxIterations?: number;
  maxConsecutiveFailures?: number;
  seedCompleted?: readonly MissionId[];
};
export type LoopLogEntry = { mission: MissionId; ok: boolean; blocked: boolean; detail: string };
export type LoopOutcome = {
  iterations: number;
  completed: MissionId[];
  failed: MissionId[];
  stoppedReason: string;
  log: LoopLogEntry[];
};

// Pure governed loop. Stops ONLY on a real condition; never re-runs a completed mission (anti-reloop).
export function campaignLoop(deps: LoopDeps): LoopOutcome {
  const maxIter = Number.isFinite(deps.maxIterations as number) ? (deps.maxIterations as number) : 100;
  const maxFail = Number.isFinite(deps.maxConsecutiveFailures as number) ? (deps.maxConsecutiveFailures as number) : 2;
  const completed = new Set<MissionId>(deps.seedCompleted || []);
  const failed: MissionId[] = [];
  const log: LoopLogEntry[] = [];
  let consecutiveFailures = 0;
  let iterations = 0;
  let stoppedReason = "";

  while (true) {
    if (iterations >= maxIter) { stoppedReason = `iteration cap (${maxIter}) reached`; break; }
    const next = deps.selectNext(completed);
    if (next == null) { stoppedReason = "no admissible mission remaining (campaign complete)"; break; }
    if (completed.has(next)) { stoppedReason = `anti-reloop: selector returned already-completed mission '${next}'`; break; }

    iterations += 1;
    const r = deps.runMission(next);
    deps.recordCheckpoint(next, r);
    log.push({ mission: next, ok: r.ok === true, blocked: r.blocked === true, detail: r.detail || "" });

    if (r.ok === true) { completed.add(next); consecutiveFailures = 0; continue; }

    failed.push(next);
    if (r.blocked === true) { stoppedReason = `blocked at '${next}': ${r.detail || "blocker"}`; break; }
    consecutiveFailures += 1;
    if (consecutiveFailures >= maxFail) { stoppedReason = `bounded recovery exhausted (${consecutiveFailures} consecutive failures), last '${next}'`; break; }
    // transient failure: do not mark completed; the selector must advance or the failure-bound will stop us.
  }

  return { iterations, completed: [...completed], failed, stoppedReason, log };
}

// ── CLI: wire the REAL primitives (guarded so a require never runs the loop) ───────────────────────────
declare const require: any;
declare const module: any;
declare const process: any;
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  const { spawnSync } = require("node:child_process");
  const selector: any = require("./migration-selector");
  const repoRoot: string = process.cwd();

  const outcome = campaignLoop({
    // Stateless selector + the loop's completed set together guarantee forward progress + anti-reloop.
    selectNext: (completed) => {
      const c = selector.recommendNext(repoRoot);
      if (!c || !c.base) return null;
      return completed.has(c.base) ? null : (c.base as string);
    },
    runMission: (m) => {
      const r = spawnSync("bash", ["runtime/bin/odg-local-pipeline.sh", m], { cwd: repoRoot, stdio: "inherit" });
      const status = typeof r.status === "number" ? r.status : null;
      return { ok: status === 0, blocked: status !== 0, detail: `odg-local-pipeline exit ${status}` };
    },
    recordCheckpoint: (m) => {
      // BUGFIX: the recorder source is scripts/compass-update.ts (tsx) — there is no scripts/compass-update.js, so the
      // old `node scripts/compass-update.js` silently failed to record the checkpoint after every mission. Run it via
      // tsx on the real .ts (same as odg-local-pipeline.sh's trap), with an absolute bin path so cwd changes can't break it.
      const tsx = require("node:path").join(repoRoot, "node_modules", ".bin", "tsx");
      spawnSync(tsx, ["scripts/compass-update.ts", "--from-report", m], { cwd: repoRoot, stdio: "inherit" });
    },
    maxIterations: Number(process.env.ODG_CAMPAIGN_MAX_ITER || 50),
    maxConsecutiveFailures: Number(process.env.ODG_CAMPAIGN_MAX_FAIL || 2),
  });

  process.stdout.write(JSON.stringify(outcome, null, 2) + "\n");
  process.exit(outcome.failed.length > 0 ? 1 : 0);
}
