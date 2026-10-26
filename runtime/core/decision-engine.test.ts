#!/usr/bin/env node
// @ts-nocheck — runtime/core test convention: runs under tsx; migration-debt pragma (not strict typing).
/*
 * Decision Engine STAGE — co-located test (Day-6 gap #5). Drives the REAL run-on-load script in a throwaway
 * cwd with a controlled mission-plan and asserts its critical behaviours: one action per objective (in
 * contract order), mission/mode/priority passthrough, deterministic output (identical plan + empty memory ⇒
 * byte-identical decision.json), research_acquisition carried VERBATIM when present / absent otherwise
 * (transport-only, no authority decision), and the fail-closed STOP on a missing/empty mission-plan. Fails if
 * any critical behaviour breaks. No network, no real repo mutation.
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { spawnSync } = require("child_process");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const REPO = path.resolve(__dirname, "..", "..");
const SCRIPT = path.join(REPO, "runtime", "dist", "core", "decision-engine.js");

function sandbox(plan) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deceng-"));
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  if (plan !== undefined) fs.writeFileSync(path.join(dir, "runtime", "generated", "mission-plan.json"), JSON.stringify(plan));
  return dir;
}
function run(dir) {
  const r = spawnSync("node", [SCRIPT], { cwd: dir, encoding: "utf8" });
  let json = null; try { json = JSON.parse(fs.readFileSync(path.join(dir, "runtime", "generated", "decision.json"), "utf8")); } catch { /* none */ }
  return { exit: r.status, json, hasDecision: fs.existsSync(path.join(dir, "runtime", "generated", "decision.json")) };
}
const PLAN = {
  mission: "M_DEC", mode: "ENGINEERING", priority: "HIGH", requiresEngineering: true,
  authorizedPaths: ["src/app"],
  objectives: [{ id: "OBJ_A", goal: "do A" }, { id: "OBJ_B", goal: "do B" }],
};

console.log("Decision Engine STAGE — co-located");

// 1 — one action per objective (in contract order) + passthrough of mission/mode/priority/authorizedPaths.
{
  const dir = sandbox(PLAN);
  const r = run(dir);
  ok("exits 0 + writes decision.json", r.exit === 0 && r.hasDecision);
  ok("one action per objective, in contract order", JSON.stringify(r.json.actions) === JSON.stringify(["OBJ_A", "OBJ_B"]));
  ok("mission/mode/priority passthrough", r.json.mission === "M_DEC" && r.json.mode === "ENGINEERING" && r.json.priority === "HIGH");
  ok("requiresEngineering + authorizedPaths passthrough", r.json.requiresEngineering === true && JSON.stringify(r.json.authorizedPaths) === JSON.stringify(["src/app"]));
  ok("objectives carried (2)", Array.isArray(r.json.objectives) && r.json.objectives.length === 2);
  fs.rmSync(dir, { recursive: true, force: true });
}
// 2 — DETERMINISM: identical plan + empty patch-memory ⇒ byte-identical decision.json across two runs.
{
  const d1 = sandbox(PLAN); const r1 = run(d1);
  const d2 = sandbox(PLAN); const r2 = run(d2);
  ok("deterministic: identical plan ⇒ identical decision.json", JSON.stringify(r1.json) === JSON.stringify(r2.json));
  fs.rmSync(d1, { recursive: true, force: true }); fs.rmSync(d2, { recursive: true, force: true });
}
// 3 — research_acquisition TRANSPORT: present ⇒ carried verbatim; absent ⇒ no key (no authority decision here).
{
  const withRA = sandbox({ ...PLAN, research_acquisition: { authorized: true, maxSources: 3 } });
  const rWith = run(withRA);
  ok("research_acquisition present ⇒ carried VERBATIM to decision.json", rWith.json.research_acquisition && rWith.json.research_acquisition.authorized === true && rWith.json.research_acquisition.maxSources === 3);
  const without = sandbox(PLAN);
  const rWithout = run(without);
  ok("research_acquisition absent ⇒ NO key added (transport-only)", !("research_acquisition" in rWithout.json));
  fs.rmSync(withRA, { recursive: true, force: true }); fs.rmSync(without, { recursive: true, force: true });
}
// 4 — FAIL-CLOSED STOP: a missing or objective-less mission-plan ⇒ exit non-zero, NO decision.json produced.
{
  const missing = sandbox(undefined); // no mission-plan.json
  const rMiss = run(missing);
  ok("missing mission-plan ⇒ STOP (exit non-zero), no decision.json", rMiss.exit !== 0 && rMiss.hasDecision === false);
  const empty = sandbox({ mission: "X", mode: "ENGINEERING", objectives: [] });
  const rEmpty = run(empty);
  ok("objective-less plan ⇒ STOP (exit non-zero), no decision.json", rEmpty.exit !== 0 && rEmpty.hasDecision === false);
  fs.rmSync(missing, { recursive: true, force: true }); fs.rmSync(empty, { recursive: true, force: true });
}

console.log(`\ndecision-engine stage — ${passed} assertions passed.`);
