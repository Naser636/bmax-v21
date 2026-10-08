#!/usr/bin/env node

/*
 * WAKE-1 — canonical RESOLVER ↔ tiered Capability Router connection.
 *
 * Proves the LIVE decision-engine.js now reaches capability-router.route(): a valid Patch-Memory
 * precedent is replayed into the objective's `patch` and flows through the UNCHANGED
 * decision.json → patch-engine → patch-executor contract (ODG the sole writer, authorizedPaths
 * enforced). No precedent / malformed / out-of-scope / corrupt-memory all preserve prior behaviour
 * or fail closed through governance — never a router-driven bypass.
 *
 * Offline + deterministic: runs the REAL runtime/core scripts as child processes in a throwaway cwd
 * with a seeded, git-ignored Patch Memory store. Never touches the real tree. Run: `node <this>`.
 */

"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const CORE = __dirname; // real runtime/core — scripts resolve their own requires from here
let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

function sandbox() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "wake1-"));
  fs.mkdirSync(path.join(d, "runtime", "generated", "autonomy"), { recursive: true });
  return d;
}
function writeJson(p, o) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 2)); }
function readJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }
// The signature decision-engine computes for lookup: route({goal,objectiveId}) keys on the mission-
// independent GOAL (rootCause/target empty, objectiveId a fallback only). Seeding therefore keys on the
// objective's goal — the stable cross-mission problem identity, which is exactly what enables a precedent
// proven under one mission/objective to be reused by another for the same goal.
function sig(goal) { return ["", String(goal).trim().replace(/\s+/g, " ").toLowerCase(), ""].join("|"); }
function seedMemory(d, goal, edits) {
  writeJson(path.join(d, "runtime", "generated", "autonomy", "patch-memory.json"), {
    version: 1,
    entries: { [sig(goal)]: { signature: sig(goal), mission: "SEED", edits, reuseCount: 0, learnedAt: "2026-01-01T00:00:00.000Z" } },
  });
}
function runDecision(d, plan) {
  writeJson(path.join(d, "runtime", "generated", "mission-plan.json"), plan);
  const r = spawnSync("node", [path.join(CORE, "decision-engine.js")], { cwd: d, encoding: "utf8" });
  return { status: r.status, decision: fs.existsSync(path.join(d, "runtime", "generated", "decision.json")) ? readJson(path.join(d, "runtime", "generated", "decision.json")) : null };
}
function objPatch(decision, id) { const o = (decision.objectives || []).find((x) => x.id === id); return o ? o.patch : undefined; }

// === 1. valid exact precedent ⇒ Memory replayed into objective.patch =========
{
  const d = sandbox();
  const edits = [{ target: "out/app.ts", content: "export const ok = 1;\n" }];
  // Precedent learned under SEED mission for goal "do x"; current mission W1 reuses it for the SAME goal
  // under a DIFFERENT objective id — genuine inter-mission reuse.
  seedMemory(d, "do x", edits);
  const { status, decision } = runDecision(d, { mission: "W1", mode: "IMPLEMENT", priority: "NORMAL", requiresEngineering: true, authorizedPaths: ["out/"], objectives: [{ id: "OBJ_MEM", goal: "do x", done_when: [] }] });
  ok("decision-engine exits 0", status === 0);
  ok("1: valid precedent (same goal, other mission) ⇒ Memory edits replayed into objective.patch", JSON.stringify(objPatch(decision, "OBJ_MEM")) === JSON.stringify(edits));
  ok("9: decision.json contract intact (mission/mode/actions/authorizedPaths)", decision.mission === "W1" && decision.mode === "IMPLEMENT" && JSON.stringify(decision.actions) === JSON.stringify(["OBJ_MEM"]) && JSON.stringify(decision.authorizedPaths) === JSON.stringify(["out/"]));
  fs.rmSync(d, { recursive: true, force: true });
}

// === 2. no precedent ⇒ deterministic fallthrough, prior behaviour (no patch) ==
{
  const d = sandbox(); // no memory seeded
  const { decision } = runDecision(d, { mission: "W1", mode: "IMPLEMENT", priority: "NORMAL", authorizedPaths: ["out/"], objectives: [{ id: "OBJ_NONE", goal: "do y", done_when: [] }] });
  ok("2: no precedent ⇒ objective has NO patch (byte-identical prior behaviour)", objPatch(decision, "OBJ_NONE") === undefined);
}

// === 3/4/5. stale / different-problem / wrong-target ⇒ signature mismatch ⇒ no reuse ==
{
  const d = sandbox();
  seedMemory(d, "a completely different problem", [{ target: "out/app.ts", content: "x" }]); // precedent for a DIFFERENT goal
  const { decision } = runDecision(d, { mission: "W1", mode: "IMPLEMENT", authorizedPaths: ["out/"], objectives: [{ id: "OBJ_WANTED", goal: "z", done_when: [] }] });
  ok("3/4/5: different-goal precedent ⇒ not reused (signature mismatch)", objPatch(decision, "OBJ_WANTED") === undefined);
}

// === 7. malformed precedent edits ⇒ rejected, never attached ==================
{
  const d = sandbox();
  // Seed under the SAME goal "z" as the current objective, so the ONLY reason it is not attached is the
  // malformed edit shape (not a signature miss).
  seedMemory(d, "z", [{ note: "no target, no content/diff" }]);
  const { decision } = runDecision(d, { mission: "W1", mode: "IMPLEMENT", authorizedPaths: ["out/"], objectives: [{ id: "OBJ_BAD", goal: "z", done_when: [] }] });
  ok("7: malformed precedent ⇒ not attached (objective stays symbolic)", objPatch(decision, "OBJ_BAD") === undefined);
}

// === 8. corrupt memory store ⇒ fail closed, decision still produced, no attach =
{
  const d = sandbox();
  fs.writeFileSync(path.join(d, "runtime", "generated", "autonomy", "patch-memory.json"), "{ not json");
  const { status, decision } = runDecision(d, { mission: "W1", mode: "IMPLEMENT", authorizedPaths: ["out/"], objectives: [{ id: "OBJ_X", goal: "z", done_when: [] }] });
  ok("8: corrupt memory ⇒ no crash (exit 0)", status === 0 && !!decision);
  ok("8: corrupt memory ⇒ no reuse (fail closed)", objPatch(decision, "OBJ_X") === undefined);
}

// === 1→10. full chain: decision → patch-engine → patch-executor is the writer; in-scope applies, out-of-scope rejected ===
function runChain(d, plan) {
  runDecision(d, plan);
  const pe = spawnSync("node", [path.join(CORE, "patch-engine.js")], { cwd: d, encoding: "utf8" });
  const px = spawnSync("node", [path.join(CORE, "patch-executor.js")], { cwd: d, encoding: "utf8" });
  const report = fs.existsSync(path.join(d, "runtime", "generated", "patch-execution.json")) ? readJson(path.join(d, "runtime", "generated", "patch-execution.json")) : null;
  return { pe: pe.status, px: px.status, report };
}
{
  // in-scope replay ⇒ patch-executor (ODG) writes the file
  const d = sandbox();
  seedMemory(d, "apply in scope", [{ target: "out/applied.ts", content: "export const A = 1;\n" }]);
  const { report } = runChain(d, { mission: "W1", mode: "IMPLEMENT", requiresEngineering: true, authorizedPaths: ["out/"], objectives: [{ id: "OBJ_APPLY", goal: "apply in scope", done_when: [] }] });
  ok("10: patch-executor is the writer — in-scope replay APPLIED", !!report && report.executed.some((e) => e.status === "APPLIED"));
  ok("10: file written by ODG patch-executor, not the router", fs.existsSync(path.join(d, "out", "applied.ts")));
  fs.rmSync(d, { recursive: true, force: true });
}
{
  // 6. out-of-scope replay target ⇒ patch-executor rejects; nothing written outside scope; no bypass
  const d = sandbox();
  seedMemory(d, "escape the scope", [{ target: "src/evil.ts", content: "nope" }]);
  const { report } = runChain(d, { mission: "W1", mode: "IMPLEMENT", requiresEngineering: true, authorizedPaths: ["out/"], objectives: [{ id: "OBJ_EVIL", goal: "escape the scope", done_when: [] }] });
  ok("6: out-of-scope replay ⇒ patch-executor FAILED (governed rejection)", !!report && report.executed.some((e) => e.status === "FAILED"));
  ok("6: out-of-scope file NOT written (no bypass)", !fs.existsSync(path.join(d, "src", "evil.ts")));
  fs.rmSync(d, { recursive: true, force: true });
}

console.log(`\nWAKE-1 RESOLVER CONNECT — ${passed} assertions passed.`);
