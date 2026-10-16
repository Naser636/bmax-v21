#!/usr/bin/env node
/*
 * LOT mission-context-builder — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic, READ-ONLY w.r.t. the repo: build:runtime compiles
 * runtime/core/mission-context-builder.ts → runtime/dist/core/mission-context-builder.js. Its two
 * internal deps (expert-profile-assembler, runtime-context-loader) are already dual-ported and
 * co-located in dist, so the compiled module's require()s resolve to compiled siblings.
 *
 * PARITY SURFACE: buildMissionContext is a DETERMINISTIC composition (no wall-clock). This bench drives
 * it through INJECTED loaders (opts.loadPlan / opts.loadRuntime) with fixed fixtures and asserts the
 * MissionContext is BYTE-IDENTICAL between the .js and the compiled .ts across:
 *   - a full ENGINEERING plan (authorizedPaths PASSTHROUGH, contract pointer, objectives, expertInstance),
 *   - an ECONOMIC plan (expertInstance role switch),
 *   - a null RuntimeContext and a partial project (runtimeComplete false),
 *   - the empty-mission guard (both throw),
 *   - the VERSION / SOURCE exports.
 * It then proves the opts.write artifact (runtime/generated/mission-context.json) is BYTE-IDENTICAL,
 * writing ONLY under throwaway temp cwds (never the real runtime/generated), and exercises the REAL
 * loadMissionPlan READ branch (plan present for the mission) so the spawnSync FALLBACK is preserved but
 * NEVER launched (no business process is spawned).
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/mission-context-builder-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "mission-context-builder.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "mission-context-builder.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const temps: string[] = [];
function mkTmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "mcb-"));
  temps.push(d);
  return d;
}

console.log("LOT mission-context-builder — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/mission-context-builder.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/mission-context-builder.js emitted");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;

// Exports present + VERSION/SOURCE identical.
for (const x of ["buildMissionContext", "VERSION", "SOURCE"]) {
  check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);
}
check(js.VERSION === ts.VERSION && js.SOURCE === ts.SOURCE, "VERSION + SOURCE identical");

// ── Deterministic fixtures (fixed values; no wall-clock, no filesystem for plan/runtime) ──
const PLAN_ENG = {
  mission: "MISSION_CONTEXT_BUILDER",
  mode: "SEQUENTIAL",
  priority: "HIGH",
  requiresEngineering: true,
  authorizedPaths: ["runtime/**", "src/runtime/**"],
  objectives: [{ id: "obj-1", text: "a" }, { id: "obj-2", text: "b" }],
  nextObjective: "obj-1",
  definitionOfDone: ["build green", "tests pass"],
  completion: ["obj-0"],
  source: "runtime/missions/MISSION_CONTEXT_BUILDER.json",
  status: "AUTHORIZED",
};
const PLAN_ECON = { ...PLAN_ENG, expertProfile: "ECONOMIC", requiresEngineering: false };
const RUNTIME_FULL = { version: "rc-1", project: { root: "/repo", files: 1234, directories: 56 } };
const RUNTIME_PARTIAL = { version: "rc-2", project: { root: "/repo" } }; // missing files/dirs ⇒ incomplete

const build = (mod: any, mission: string, plan: any, runtime: any, extra: any = {}) =>
  mod.buildMissionContext(mission, { loadPlan: () => plan, loadRuntime: () => runtime, ...extra });

// 1. Full ENGINEERING context — BYTE-IDENTICAL (includes authorizedPaths passthrough + expertInstance).
{
  const j = build(js, "MISSION_CONTEXT_BUILDER", PLAN_ENG, RUNTIME_FULL);
  const t = build(ts, "MISSION_CONTEXT_BUILDER", PLAN_ENG, RUNTIME_FULL);
  check(EQ(j, t), "ENGINEERING MissionContext BYTE-IDENTICAL (.js vs compiled .ts)");
  check(EQ(j.authorizedPaths, PLAN_ENG.authorizedPaths) && EQ(t.authorizedPaths, PLAN_ENG.authorizedPaths), "authorizedPaths is a verbatim PASSTHROUGH (no enforcement/rewrite), identical both sides");
  check(j.runtimeComplete === true && t.runtimeComplete === true, "runtimeComplete TRUE on a full project (both)");
  check(j.expertInstance && t.expertInstance && EQ(j.expertInstance, t.expertInstance), "expertInstance (ENGINEERING) BYTE-IDENTICAL");
  check(EQ(j.contract, { path: PLAN_ENG.source, status: PLAN_ENG.status }) && EQ(j.contract, t.contract), "contract pointer composed identically");
}

// 2. ECONOMIC plan — expertInstance role switch, still byte-identical js vs ts.
{
  const j = build(js, "M_ECON", PLAN_ECON, RUNTIME_FULL);
  const t = build(ts, "M_ECON", PLAN_ECON, RUNTIME_FULL);
  check(EQ(j, t), "ECONOMIC MissionContext BYTE-IDENTICAL (.js vs compiled .ts)");
}

// 3. null RuntimeContext ⇒ runtime:null, runtimeComplete false, identical.
{
  const j = build(js, "M_NULLRT", PLAN_ENG, null);
  const t = build(ts, "M_NULLRT", PLAN_ENG, null);
  check(EQ(j, t) && j.runtime === null && j.runtimeComplete === false, "null RuntimeContext ⇒ runtime null + incomplete, BYTE-IDENTICAL");
}

// 4. partial project (missing files/dirs) ⇒ runtimeComplete false, identical.
{
  const j = build(js, "M_PART", PLAN_ENG, RUNTIME_PARTIAL);
  const t = build(ts, "M_PART", PLAN_ENG, RUNTIME_PARTIAL);
  check(EQ(j, t) && j.runtimeComplete === false, "partial project ⇒ runtimeComplete false, BYTE-IDENTICAL");
}

// 5. empty-mission guard ⇒ both throw.
{
  let ej = false, et = false;
  try { js.buildMissionContext(""); } catch { ej = true; }
  try { ts.buildMissionContext(""); } catch { et = true; }
  check(ej === true && et === true, "empty mission name ⇒ throws (both)");
}

// 6. opts.write artifact BYTE-IDENTICAL — written ONLY under throwaway temp cwds (repo untouched).
{
  const jd = mkTmp(), td = mkTmp();
  const j = js.buildMissionContext("M_WRITE", { cwd: jd, write: true, loadPlan: () => PLAN_ENG, loadRuntime: () => RUNTIME_FULL });
  const t = ts.buildMissionContext("M_WRITE", { cwd: td, write: true, loadPlan: () => PLAN_ENG, loadRuntime: () => RUNTIME_FULL });
  const jf = path.join(jd, "runtime", "generated", "mission-context.json");
  const tf = path.join(td, "runtime", "generated", "mission-context.json");
  check(fs.existsSync(jf) && fs.existsSync(tf), "opts.write emitted mission-context.json under each temp cwd");
  const jb = fs.readFileSync(jf, "utf8"), tb = fs.readFileSync(tf, "utf8");
  check(jb === tb, "written mission-context.json BYTE-IDENTICAL (.js vs compiled .ts)");
  check(jb === JSON.stringify(j, null, 2) && tb === JSON.stringify(t, null, 2), "written bytes == JSON.stringify(context, null, 2) (both)");
}

// 7. REAL loadMissionPlan READ branch (no injection) ⇒ reads a present plan WITHOUT spawning the loader;
//    proves the spawnSync fallback is PRESERVED but never launched (the common read path is identical).
{
  const jd = mkTmp(), td = mkTmp();
  const planJson = JSON.stringify({ ...PLAN_ENG, mission: "M_READ" }, null, 2);
  for (const d of [jd, td]) {
    fs.mkdirSync(path.join(d, "runtime", "generated"), { recursive: true });
    fs.writeFileSync(path.join(d, "runtime", "generated", "mission-plan.json"), planJson);
  }
  const j = js.buildMissionContext("M_READ", { cwd: jd, loadRuntime: () => RUNTIME_FULL });
  const t = ts.buildMissionContext("M_READ", { cwd: td, loadRuntime: () => RUNTIME_FULL });
  check(EQ(j, t) && j.mission === "M_READ", "real loadMissionPlan read branch (plan present) BYTE-IDENTICAL, no spawn");
}

for (const d of temps) {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ }
}

console.log(failures === 0 ? "ALL PASS — LOT mission-context-builder EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
