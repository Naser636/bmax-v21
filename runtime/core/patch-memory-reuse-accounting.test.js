#!/usr/bin/env node
"use strict";

/*
 * C4 (review N4 remediation) — REAL patch-memory reuse accounting. Exam N3 showed a precedent was
 * looked up and replayed but patch-memory.reuseCount stayed 0 (the Capability Router never marked the
 * precedent USED). This drives the REAL Decision stage (runtime/core/decision-engine.js) in a sandbox:
 * a seeded precedent whose signature matches an objective's goal is replayed, and reuseCount MUST now
 * increment to 1 — while a NON-matching objective leaves it at 0 (no false reuse).
 *
 * Run: node runtime/core/patch-memory-reuse-accounting.test.js
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const ENGINE = path.join(REPO, "runtime", "core", "decision-engine.js");
const pm = require("./patch-memory");

let failures = 0;
function check(cond, label) {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

// Signature patch-memory keys on for a {goal} task: "|<norm(goal)>|" (rootCause + target empty).
function sig(goal) {
  return pm.signature({ goal });
}

function sandbox(goal, objectiveGoal) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-reuse-"));
  const gen = path.join(dir, "runtime", "generated");
  fs.mkdirSync(path.join(gen, "autonomy"), { recursive: true });
  // Seed a precedent for `goal` with reusable edits, reuseCount 0.
  const entry = {
    signature: sig(goal),
    mission: "SEED",
    edits: [{ target: "runtime/generated/reused.txt", content: "reused\n" }],
    reuseCount: 0,
    learnedAt: "2026-01-01T00:00:00.000Z",
  };
  fs.writeFileSync(
    path.join(gen, "autonomy", "patch-memory.json"),
    JSON.stringify({ version: 1, entries: { [entry.signature]: entry } }, null, 2),
  );
  // Minimal mission-plan.json with ONE objective (no pre-existing patch ⇒ memory reuse is consulted).
  fs.writeFileSync(
    path.join(gen, "mission-plan.json"),
    JSON.stringify({
      mission: "M",
      mode: "SEQUENTIAL",
      priority: "NORMAL",
      authorizedPaths: ["runtime/generated"],
      objectives: [{ id: "M_1", goal: objectiveGoal, done_when: ["d"] }],
    }),
  );
  return dir;
}

function reuseCountOf(dir, goal) {
  const db = JSON.parse(fs.readFileSync(path.join(dir, "runtime", "generated", "autonomy", "patch-memory.json"), "utf8"));
  const e = db.entries[sig(goal)];
  return e ? e.reuseCount : -1;
}

function runEngine(dir) {
  return spawnSync("node", [ENGINE], { cwd: dir, encoding: "utf8" });
}

console.log("C4 — patch-memory reuse accounting (real Decision stage)");

// 1 — objective goal MATCHES the precedent ⇒ reused ⇒ reuseCount increments 0 → 1.
{
  const goal = "reuse this exact solution";
  const dir = sandbox(goal, goal);
  const before = reuseCountOf(dir, goal);
  const r = runEngine(dir);
  const after = reuseCountOf(dir, goal);
  const decision = JSON.parse(fs.readFileSync(path.join(dir, "runtime", "generated", "decision.json"), "utf8"));
  const attached = Array.isArray(decision.objectives) && decision.objectives[0] && Array.isArray(decision.objectives[0].patch);
  check(r.status === 0, "1. Decision stage exits 0");
  check(before === 0, "1b. precedent starts at reuseCount 0");
  check(after === 1, "1c. matching objective ⇒ reuseCount incremented to 1 (REAL reuse counted)");
  check(attached === true, "1d. the precedent's edits were attached to the objective (replayed)");
  fs.rmSync(dir, { recursive: true, force: true });
}

// 2 — objective goal does NOT match the precedent ⇒ no reuse ⇒ reuseCount stays 0 (no false reuse).
{
  const goal = "the stored precedent goal";
  const dir = sandbox(goal, "a completely different objective goal");
  const r = runEngine(dir);
  const after = reuseCountOf(dir, goal);
  check(r.status === 0, "2. Decision stage exits 0");
  check(after === 0, "2b. non-matching objective ⇒ reuseCount stays 0 (no false reuse)");
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(failures === 0 ? "ALL PASS — C4 PATCH-MEMORY REUSE ACCOUNTING" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
