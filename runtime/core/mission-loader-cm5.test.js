#!/usr/bin/env node
"use strict";
/*
 * CM-5 anti-inflation tests for the mission-loader governance-authorization derivation.
 * Spawns the real loader in an isolated temp cwd with fixture contracts and asserts the per-objective
 * `authorization` DECLARATION it projects into mission-plan.json. The derivation must NEVER inflate:
 * reserved/OPERATIONAL/ambiguous missions stay UNDECLARED (fail-closed), explicit declarations are
 * respected, and only read-only-audit / scoped-engineering are declared eligible+authorized.
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

const LOADER = path.resolve(__dirname, "mission-loader.js");
let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed++; }

/** Write a fixture contract into a throwaway cwd, run the loader, return objectives[0].authorization. */
function loadAuth(contract) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cm5-"));
  for (const d of ["runtime/missions", "runtime/generated", "runtime/governance", "runtime/brain"]) {
    fs.mkdirSync(path.join(root, d), { recursive: true });
  }
  fs.writeFileSync(path.join(root, "runtime/governance/ROADMAP.json"), JSON.stringify({ missions: [] }));
  fs.writeFileSync(path.join(root, "runtime/missions", `${contract.mission}.json`), JSON.stringify(contract));
  const r = cp.spawnSync(process.execPath, [LOADER, contract.mission], { cwd: root, encoding: "utf8" });
  let auth;
  try { auth = JSON.parse(fs.readFileSync(path.join(root, "runtime/generated/mission-plan.json"), "utf8")).objectives[0].authorization; }
  catch { auth = "(no plan)"; }
  fs.rmSync(root, { recursive: true, force: true });
  return { exit: r.status, auth };
}

// 1 — read-only AUDIT ⇒ declared eligible+authorized (read is authorized ODG work).
{
  const r = loadAuth({ mission: "FX_AUDIT", mode: "AUDIT", requires_engineering: false, authorized_paths: [], objectives: [{ id: "FX_AUDIT_1", goal: "read", done_when: [] }] });
  ok("AUDIT read-only ⇒ eligible+authorized (read-only-audit basis)", r.auth && r.auth.eligible === true && r.auth.authorized === true && /read-only-audit/.test(r.auth.basis));
}
// 2 — ANTI-INFLATION: reserved OPERATIONAL (no scope) ⇒ UNDECLARED (never auto-eligible).
{
  const r = loadAuth({ mission: "FX_OP", mode: "OPERATIONAL", requires_engineering: false, authorized_paths: [], objectives: [{ id: "FX_OP_1", goal: "deploy", done_when: [] }] });
  ok("OPERATIONAL reserved ⇒ authorization UNDECLARED (no inflation)", r.auth === undefined);
}
// 3 — scoped engineering (authorized_paths grant) ⇒ declared eligible+authorized.
{
  const r = loadAuth({ mission: "FX_SCOPED", mode: "ENGINEERING", requires_engineering: true, authorized_paths: ["sandbox/**"], objectives: [{ id: "FX_SCOPED_1", goal: "edit", done_when: [] }] });
  ok("scoped-engineering ⇒ eligible+authorized (scoped-engineering basis)", r.auth && r.auth.eligible === true && r.auth.authorized === true && /scoped-engineering/.test(r.auth.basis));
}
// 4 — explicit contract declaration is RESPECTED, never overwritten by the derivation.
{
  const explicit = { eligible: false, authorized: false, excluded: true, reason: "human-gated by contract" };
  const r = loadAuth({ mission: "FX_EXPL", mode: "AUDIT", requires_engineering: false, authorized_paths: [], objectives: [{ id: "FX_EXPL_1", goal: "x", done_when: [], authorization: explicit }] });
  ok("explicit contract authorization respected (not overwritten to eligible)", r.auth && r.auth.eligible === false && r.auth.excluded === true && /human-gated by contract/.test(r.auth.reason));
}
// 5 — ANTI-INFLATION: engineering claimed but NO authorized scope ⇒ UNDECLARED (fail-closed).
{
  const r = loadAuth({ mission: "FX_ENG_NOSCOPE", mode: "ENGINEERING", requires_engineering: true, authorized_paths: [], objectives: [{ id: "FX_ENG_NOSCOPE_1", goal: "y", done_when: [] }] });
  ok("engineering WITHOUT authorized_paths ⇒ UNDECLARED (no inflation)", r.auth === undefined);
}
// 6 — a plain SEQUENTIAL/unknown-mode mission with no scope ⇒ UNDECLARED (fail-closed).
{
  const r = loadAuth({ mission: "FX_SEQ", mode: "SEQUENTIAL", requires_engineering: false, authorized_paths: [], objectives: [{ id: "FX_SEQ_1", goal: "z", done_when: [] }] });
  ok("SEQUENTIAL/unknown no-scope ⇒ UNDECLARED (fail-closed, not measurable)", r.auth === undefined);
}

// 7 — ANALYZE read-only ⇒ declared eligible+authorized (same class as AUDIT).
{
  const r = loadAuth({ mission: "FX_ANALYZE", mode: "ANALYZE", requires_engineering: false, authorized_paths: [], objectives: [{ id: "FX_ANALYZE_1", goal: "analyze", done_when: [] }] });
  ok("ANALYZE read-only ⇒ eligible+authorized", r.auth && r.auth.eligible === true && /read-only-audit/.test(r.auth.basis));
}
// 8 — ANTI-INFLATION (governance forbids): DEPRECATED mission WITH authorized_paths ⇒ UNDECLARED.
//     Paths present must NOT override contract governance (the deprecation).
{
  const r = loadAuth({ mission: "FX_DEP", mode: "ENGINEERING", requires_engineering: true, authorized_paths: ["sandbox/**"], governedStatus: "DEPRECATED", objectives: [{ id: "FX_DEP_1", goal: "x", done_when: [] }] });
  ok("DEPRECATED + paths ⇒ UNDECLARED (governance forbids; paths do not override)", r.auth === undefined);
}
// 9 — MIXED objectives: per-objective, not blanket. Obj1 explicit-excluded stays excluded; obj2 derived eligible.
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cm5m-"));
  for (const d of ["runtime/missions", "runtime/generated", "runtime/governance"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, "runtime/governance/ROADMAP.json"), JSON.stringify({ missions: [] }));
  fs.writeFileSync(path.join(root, "runtime/missions/FX_MIX.json"), JSON.stringify({
    mission: "FX_MIX", mode: "AUDIT", requires_engineering: false, authorized_paths: [],
    objectives: [
      { id: "FX_MIX_1", goal: "excluded", done_when: [], authorization: { eligible: false, authorized: false, excluded: true, reason: "reserved" } },
      { id: "FX_MIX_2", goal: "derived", done_when: [] },
    ],
  }));
  cp.spawnSync(process.execPath, [LOADER, "FX_MIX"], { cwd: root, encoding: "utf8" });
  const objs = JSON.parse(fs.readFileSync(path.join(root, "runtime/generated/mission-plan.json"), "utf8")).objectives;
  fs.rmSync(root, { recursive: true, force: true });
  ok("MIXED: obj1 explicit exclusion preserved", objs[0].authorization && objs[0].authorization.eligible === false && objs[0].authorization.excluded === true);
  ok("MIXED: obj2 derived eligible (per-objective, not blanket)", objs[1].authorization && objs[1].authorization.eligible === true && /read-only-audit/.test(objs[1].authorization.basis));
}

console.log(`\nmission-loader CM-5 derivation — ${passed} assertions passed.`);
