#!/usr/bin/env node
// @ts-nocheck — L5 bulk test migration (runtime/core): runs under tsx unchanged; suppresses tsc
// typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.
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

const LOADER = path.resolve(__dirname, "..", "dist", "core", "mission-loader.js");
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
// 2 — §1: reserved OPERATIONAL/external goal (no scope) ⇒ EXPLICITLY EXCLUDED with its reason (never
//     eligible). The goal-classifier (declareAuthorization) flags "deploy" as external/human-gated, so the
//     loader now stamps a JUSTIFIED exclusion (§1 "restent exclus avec leur raison"). ANTI-INFLATION intent
//     preserved: eligible stays false — it is never counted in the autonomy numerator or denominator.
{
  const r = loadAuth({ mission: "FX_OP", mode: "OPERATIONAL", requires_engineering: false, authorized_paths: [], objectives: [{ id: "FX_OP_1", goal: "deploy", done_when: [] }] });
  ok("OPERATIONAL external 'deploy' ⇒ excluded WITH reason (not eligible, no inflation)", r.auth && r.auth.eligible === false && r.auth.excluded === true && typeof r.auth.reason === "string" && r.auth.reason.length > 0);
}
// 3 — scoped engineering (authorized_paths grant) ⇒ declared eligible+authorized.
{
  const r = loadAuth({ mission: "FX_SCOPED", mode: "ENGINEERING", requires_engineering: true, authorized_paths: ["sandbox/**"], objectives: [{ id: "FX_SCOPED_1", goal: "edit", done_when: ["edited and tested"] }] });
  ok("scoped-engineering ⇒ eligible+authorized (scoped-engineering basis)", r.auth && r.auth.eligible === true && r.auth.authorized === true && /scoped-engineering/.test(r.auth.basis));
}
// 4 — explicit contract declaration is RESPECTED, never overwritten by the derivation.
{
  const explicit = { eligible: false, authorized: false, excluded: true, reason: "human-gated by contract" };
  const r = loadAuth({ mission: "FX_EXPL", mode: "AUDIT", requires_engineering: false, authorized_paths: [], objectives: [{ id: "FX_EXPL_1", goal: "x", done_when: [], authorization: explicit }] });
  ok("explicit contract authorization respected (not overwritten to eligible)", r.auth && r.auth.eligible === false && r.auth.excluded === true && /human-gated by contract/.test(r.auth.reason));
}
// 5 — engineering claimed but NO authorized scope ⇒ REFUSED by the contract-sufficiency gate (see case 10).
//     (Supersedes the pre-gate "undeclared" behaviour: such a mission never loads, so it can never be
//     measured OR execute — the strongest anti-inflation + no out-of-scope-write guarantee.)
{
  const r = loadAuth({ mission: "FX_ENG_NOSCOPE", mode: "ENGINEERING", requires_engineering: true, authorized_paths: [], objectives: [{ id: "FX_ENG_NOSCOPE_1", goal: "y", done_when: [] }] });
  ok("engineering WITHOUT authorized_paths ⇒ REFUSED pre-execution (no plan)", r.exit !== 0 && r.auth === "(no plan)");
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
  const r = loadAuth({ mission: "FX_DEP", mode: "ENGINEERING", requires_engineering: true, authorized_paths: ["sandbox/**"], governedStatus: "DEPRECATED", objectives: [{ id: "FX_DEP_1", goal: "x", done_when: ["x done"] }] });
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

// 10 — CONTRACT-SUFFICIENCY GATE: an ENGINEERING mission with NO explicit write-set is REFUSED pre-execution.
{
  const r = loadAuth({ mission: "FX_ENG_NOWS", mode: "ENGINEERING", requires_engineering: true, authorized_paths: [], objectives: [{ id: "FX_ENG_NOWS_1", goal: "edit", done_when: [] }] });
  ok("engineering + NO write-set ⇒ loader REFUSES (non-zero exit)", r.exit !== 0);
  ok("engineering + NO write-set ⇒ NO mission-plan written (blocked before modification)", r.auth === "(no plan)");
}
// 11 — read-only mission with no write-set is NOT refused (legitimately declares none).
{
  const r = loadAuth({ mission: "FX_RO_NOWS", mode: "AUDIT", requires_engineering: false, authorized_paths: [], objectives: [{ id: "FX_RO_NOWS_1", goal: "read", done_when: [] }] });
  ok("read-only + no write-set ⇒ allowed (exit 0, plan written)", r.exit === 0 && r.auth !== "(no plan)");
}
// 12 — engineering mission WITH an explicit write-set is allowed.
{
  const r = loadAuth({ mission: "FX_ENG_WS", mode: "ENGINEERING", requires_engineering: true, authorized_paths: ["sandbox/**"], objectives: [{ id: "FX_ENG_WS_1", goal: "edit", done_when: ["edited"] }] });
  ok("engineering + explicit write-set ⇒ allowed (exit 0)", r.exit === 0 && r.auth && r.auth.eligible === true);
}

// 13 — CONTRACT-SUFFICIENCY GATE (acceptance): engineering + write-set but NO acceptance criteria ⇒ REFUSED.
{
  const r = loadAuth({ mission: "FX_ENG_NOACC", mode: "ENGINEERING", requires_engineering: true, authorized_paths: ["sandbox/**"], objectives: [{ id: "FX_ENG_NOACC_1", goal: "edit", done_when: [] }] });
  ok("engineering + write-set but NO acceptance ⇒ REFUSED pre-execution (no plan)", r.exit !== 0 && r.auth === "(no plan)");
}
// 14 — acceptance via definition_of_done (empty done_when) ⇒ allowed (DoD satisfies the acceptance gate).
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cm5d-"));
  for (const d of ["runtime/missions", "runtime/generated", "runtime/governance"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, "runtime/governance/ROADMAP.json"), JSON.stringify({ missions: [] }));
  fs.writeFileSync(path.join(root, "runtime/missions/FX_ENG_DOD.json"), JSON.stringify({ mission: "FX_ENG_DOD", mode: "ENGINEERING", requires_engineering: true, authorized_paths: ["sandbox/**"], definition_of_done: ["module compiles and tests pass"], objectives: [{ id: "FX_ENG_DOD_1", goal: "edit", done_when: [] }] }));
  const r = cp.spawnSync(process.execPath, [LOADER, "FX_ENG_DOD"], { cwd: root, encoding: "utf8" });
  const planExists = fs.existsSync(path.join(root, "runtime/generated/mission-plan.json"));
  fs.rmSync(root, { recursive: true, force: true });
  ok("acceptance via definition_of_done ⇒ allowed (exit 0, plan written)", r.status === 0 && planExists);
}

// 15 — §1: a no-scope mission whose goal needs HUMAN/EXTERNAL authority (e.g. a COMMUNICATE action) ⇒
//      excluded WITH reason (distinct from the DEPLOY path in case 2), never eligible.
{
  const r = loadAuth({ mission: "FX_COMM", mode: "SEQUENTIAL", requires_engineering: false, authorized_paths: [], objectives: [{ id: "FX_COMM_1", goal: "send email to client", done_when: [] }] });
  ok("external COMMUNICATE goal (no scope) ⇒ excluded WITH reason (not eligible)", r.auth && r.auth.eligible === false && r.auth.excluded === true && /./.test(r.auth.reason || ""));
}
// 16 — §1 fail-closed preserved: an INTERNAL/ambiguous no-scope goal is NOT declared eligible from goal text
//      (eligibility stays envelope-derived). Re-asserts case 6's intent against the new exclusion pass.
{
  const r = loadAuth({ mission: "FX_INT", mode: "SEQUENTIAL", requires_engineering: false, authorized_paths: [], objectives: [{ id: "FX_INT_1", goal: "refactor the parser internals", done_when: [] }] });
  ok("internal no-scope goal ⇒ still UNDECLARED (no goal-text eligibility; fail-closed)", r.auth === undefined);
}

console.log(`\nmission-loader CM-5 derivation — ${passed} assertions passed.`);
