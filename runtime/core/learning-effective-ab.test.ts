#!/usr/bin/env node
// @ts-nocheck — L5 test bucket: runs under tsx; suppresses tsc typecheck (not strict typing). See ODG_PROJECT_STATE.md.
"use strict";

/*
 * Lot B — EFFECTIVE learning proof (CAPTURED→PERSISTED→DISCOVERABLE→REUSED→EFFECTIVE).
 *
 * The other four stages already have observable signals + tests (patch-memory.record/persist/signature/hit,
 * reuse-accounting). The OPEN question was EFFECTIVE: does reuse DEMONSTRABLY improve/secure an outcome, or
 * is any correlation (repo debt fell while a patch was replayed) mistaken for causation?
 *
 * This is a CONTROLLED A/B over the REAL Decision stage (runtime/core/decision-engine.js), built entirely
 * from existing mechanisms (no new primitive):
 *   - Arm A (CONTROL / memory MISS): patch-memory store present but EMPTY ⇒ the objective resolves with NO
 *     local patch ⇒ a downstream tier would be needed.
 *   - Arm B (TREATMENT / memory HIT): the SAME store seeded with the matching precedent ⇒ the objective is
 *     resolved locally (patch attached) and reuseCount increments 0→1.
 * The ONLY independent variable is the seeded precedent for the SAME objective goal/signature — identical
 * plan, identical cwd layout, identical engine. So a measured improvement is attributable to REUSE, not to
 * correlated drift. The improvement is then measured with improvement-baseline.measureDelta and graded with
 * learning-chain.classifyLearningState, which REFUSES a flat/fabricated effect (baseline==after ⇒ not EFFECTIVE).
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const ENGINE = path.join(REPO, "runtime", "core", "decision-engine.js");
const pm = require("./patch-memory");
const { measureDelta, directionOf } = require("./improvement-baseline");
const { classifyLearningState } = require("./learning-chain");

let failures = 0;
function check(cond, label) {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}
const sig = (goal) => pm.signature({ goal });

// Build a sandbox whose ONLY difference is whether the matching precedent is seeded (seed=true ⇒ HIT arm).
function sandbox(goal, seed) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "learn-ab-"));
  const gen = path.join(dir, "runtime", "generated");
  fs.mkdirSync(path.join(gen, "autonomy"), { recursive: true });
  const entries = seed
    ? { [sig(goal)]: { signature: sig(goal), mission: "SEED", edits: [{ target: "runtime/generated/reused.txt", content: "reused\n" }], reuseCount: 0, learnedAt: "2026-01-01T00:00:00.000Z" } }
    : {}; // CONTROL: store EXISTS but is empty ⇒ genuine miss, not a crash
  fs.writeFileSync(path.join(gen, "autonomy", "patch-memory.json"), JSON.stringify({ version: 1, entries }, null, 2));
  fs.writeFileSync(path.join(gen, "mission-plan.json"), JSON.stringify({
    mission: "M", mode: "SEQUENTIAL", priority: "NORMAL", authorizedPaths: ["runtime/generated"],
    objectives: [{ id: "M_1", goal, done_when: ["d"] }],
  }));
  return dir;
}
function outcomeOf(dir, goal) {
  const r = spawnSync("node", [ENGINE], { cwd: dir, encoding: "utf8" });
  const decision = JSON.parse(fs.readFileSync(path.join(dir, "runtime", "generated", "decision.json"), "utf8"));
  const o0 = Array.isArray(decision.objectives) ? decision.objectives[0] : null;
  const patchAttached = !!(o0 && Array.isArray(o0.patch) && o0.patch.length > 0);
  const db = JSON.parse(fs.readFileSync(path.join(dir, "runtime", "generated", "autonomy", "patch-memory.json"), "utf8"));
  const e = db.entries[sig(goal)];
  return {
    exit: r.status,
    reuseCount: e ? e.reuseCount : null,
    // OBSERVABLE OUTCOME: did reuse SECURE the fix locally? downstreamResolutionNeeded is the signal we improve.
    signals: { localResolution: patchAttached ? 1 : 0, downstreamResolutionNeeded: patchAttached ? 0 : 1 },
  };
}

console.log("Lot B — EFFECTIVE learning A/B (real Decision stage; only variable = seeded precedent)");

const GOAL = "resolve the recurring parser edge-case";

// Arm A (CONTROL / MISS) and Arm B (TREATMENT / HIT) — identical except the seeded precedent.
const dA = sandbox(GOAL, false);
const dB = sandbox(GOAL, true);
const A = outcomeOf(dA, GOAL);
const B = outcomeOf(dB, GOAL);

check(A.exit === 0 && B.exit === 0, "both arms: Decision stage exits 0");
// CONTROL isolates the mechanism: miss ⇒ no local patch, no reuse counted.
check(A.signals.localResolution === 0 && (A.reuseCount === null || A.reuseCount === 0), "CONTROL (miss): no local patch, reuseCount not incremented");
// TREATMENT: the SAME objective now resolves locally and reuse is really counted.
check(B.signals.localResolution === 1 && B.reuseCount === 1, "TREATMENT (hit): patch attached + reuseCount 0→1 (real reuse)");

// MEASURE the improvement (downstream resolution avoided). sense: fewer downstream needs is better.
const sense = { downstreamResolutionNeeded: "lower", localResolution: "higher" };
const delta = measureDelta({ signals: A.signals }, { signals: B.signals }, sense);
check(delta.summary.improved >= 1 && delta.summary.regressed === 0, "measured delta improves (downstream resolution avoided), none regressed");
check(directionOf("downstreamResolutionNeeded", B.signals.downstreamResolutionNeeded - A.signals.downstreamResolutionNeeded, sense) === "improved", "directionOf confirms the downstream-need drop is an IMPROVEMENT");

// GRADE via learning-chain: a record whose effective:{baseline=control, after=treatment} reaches EFFECTIVE
// ONLY because the arms DIFFER (deep-unequal). The chain is deny-by-default and refuses a fabricated effect.
const record = {
  captured: { description: `fix for ${GOAL}` },
  persisted: { file: "runtime/generated/autonomy/patch-memory.json", id: sig(GOAL) },
  discoverable: { anchor: sig(GOAL), index: "patch-memory signature" },
  reused: { count: B.reuseCount },
  effective: { baseline: A.signals, after: B.signals },
};
const cls = classifyLearningState(record);
check(cls.state === "EFFECTIVE" && cls.complete === true, "learning chain reaches EFFECTIVE (full CAPTURED→…→EFFECTIVE, contiguous)");

// ANTI-CORRELATION / NO-FABRICATION guard: if the two arms were IDENTICAL (no reuse effect), EFFECTIVE must
// NOT be granted — proving the grade reflects a real measured difference, not the mere act of replay.
const flatRecord = { ...record, effective: { baseline: A.signals, after: A.signals } };
const flat = classifyLearningState(flatRecord);
check(flat.state !== "EFFECTIVE", "flat effect (baseline==after) is DOWNGRADED — reuse without a measured improvement is NOT EFFECTIVE");
// And reuse count alone (without a measured effect) caps the chain at REUSED, never EFFECTIVE.
check(flat.evidencePresent.REUSED === true && flat.evidencePresent.EFFECTIVE === false, "reuse replay alone ⇒ REUSED but NOT EFFECTIVE (correlation ≠ causation)");

fs.rmSync(dA, { recursive: true, force: true });
fs.rmSync(dB, { recursive: true, force: true });

console.log(failures === 0 ? "\nALL PASS — Lot B EFFECTIVE learning proven causally (A/B on same signature)" : `\nFAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
