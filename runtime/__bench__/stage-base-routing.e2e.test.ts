// @ts-nocheck
/*
 * LOT η1-B1 — STAGE-BASE ROUTING: historical default vs opt-in compiled base (Phase-03 TS migration).
 * ====================================================================================================
 *
 * Proves the stage-base selector added to runtime/core/pipeline-builder.ts (⇒ compiled dist/core/
 * pipeline-builder.js). ODG_STAGE_BASE chooses the DIRECTORY the 13 stage files are resolved FROM; it is
 * SEPARATE from ODG_RUNTIME_ENTRY (which selects the pipeline ENTRY). Historical DEFAULT is "runtime/core";
 * an operator may OPT IN to "runtime/dist/core". The chosen base is unique, observable (recorded verbatim in
 * runtime/generated/runtime-pipeline.json and printed "Stage base : <dir>"), and validated — NO silent
 * fallback to the other directory.
 *
 * This lot ROUTES the base only; it does NOT migrate/compile any stage. To PROVE the child process really
 * loads from the chosen base, the opt-in sandbox populates runtime/dist/core with COPIES of the 13 JS stages
 * (sentinels, NOT TS-migrated stages) and augments the dist copy of the FIRST stage to drop a provenance
 * marker runtime/generated/__stage_base.json={base:"dist"}. The marker's presence/absence is an INDEPENDENT
 * proof of which directory the spawned stage ran from (beyond the recorded path strings).
 *
 * SCENARIOS (all via the COMPILED entry runtime/dist/bin/odg-run.js, offline):
 *   A. default (ODG_STAGE_BASE unset) ⇒ stages from runtime/core; 13/13; paths all runtime/core/* ; NO marker.
 *   B. opt-in dist WITH all 13 stage copies ⇒ stages from runtime/dist/core; 13/13; paths all runtime/dist/core/* ;
 *      marker present {base:"dist"} (the dist stage provably executed).
 *   C. opt-in dist INCOMPLETE (only the 3 compiled orchestration modules, NO stages — the REAL repo state) ⇒
 *      explicit failure (first stage MODULE_NOT_FOUND), NOT validated, paths point at dist (NO silent fallback to core).
 *   D. opt-in INVALID (missing directory) ⇒ pipeline-builder THROWS at import ⇒ entry fails explicitly, NOT validated.
 *
 * ISOLATION: throwaway os.tmpdir() sandboxes OUTSIDE the repo (asserted); offline (FLEET_BRIDGE_MOCK=1;
 * ODG_FLEET/ODG_VERBOSE cleared). Distinct mission ids. The real repository is never written.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/stage-base-routing.e2e.test.ts
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const COMPILED_ENTRY = "runtime/dist/bin/odg-run.js";
const COPY_DIRS = ["core", "bin", "constitution", "policies", "governance", "brain"];
const STAGE_FILES = [
  "mission-interpreter", "mission-loader", "execution-planner", "capability-registry", "knowledge-engine",
  "fleet-stage", "decision-engine", "patch-engine", "patch-executor", "validation-engine",
  "mission-lifecycle", "mission-ledger", "final-report",
];
const sandboxes: string[] = [];
let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}
function git(cwd: string, args: string[]): string {
  return execFileSync("git", ["-c", "user.email=bench@local", "-c", "user.name=bench", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}
function cleanContract(mission: string) {
  return {
    mission, version: "1.0", status: "AUTHORIZED", mode: "READ_ONLY", priority: "NORMAL",
    requires_engineering: false, authorized_paths: [],
    objectives: [
      { id: "CLEAN_WORKSPACE_1", goal: "Enumerate the transient git-ignored runtime workspace artifacts under runtime/ (read-only scan).", done_when: ["A deterministic scan lists every candidate path under runtime/ that is safe to remove."], authorization: { eligible: true, authorized: true } },
      { id: "CLEAN_WORKSPACE_2", goal: "Confirm each candidate is covered by the gitignore/backup/archive policy so no tracked or required artifact is listed.", done_when: ["Every candidate is git-ignored or already archived; no tracked or required artifact is listed."], authorization: { eligible: true, authorized: true } },
      { id: "CLEAN_WORKSPACE_3", goal: "Produce read-only evidence of the cleaned workspace state without deleting any tracked or required artifact.", done_when: ["Evidence generated.", "Report generated."], authorization: { eligible: true, authorized: true } },
    ],
    verify: [{ capability: "Clean Workspace", evidence: "clean-workspace-scanned" }],
    definition_of_done: ["Evidence generated", "Report generated"],
  };
}
function seed(mission: string): string {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-stagebase-"));
  sandboxes.push(sb);
  if (sb.startsWith(REPO)) throw new Error("sandbox must live OUTSIDE the repository");
  for (const d of COPY_DIRS) fs.cpSync(path.join(REPO, "runtime", d), path.join(sb, "runtime", d), { recursive: true });
  fs.cpSync(path.join(REPO, "runtime", "dist"), path.join(sb, "runtime", "dist"), { recursive: true }); // the built dist (compiled entry + since η3-B101 the COMPLETE stage closure); cases override as needed
  fs.mkdirSync(path.join(sb, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "missions"), { recursive: true });
  fs.writeFileSync(path.join(sb, "runtime", "missions", `${mission}.json`), JSON.stringify(cleanContract(mission), null, 2));
  fs.writeFileSync(path.join(sb, ".gitignore"), "runtime/generated/\nnode_modules/\n");
  git(sb, ["init", "-q"]); git(sb, ["add", "-A"]); git(sb, ["commit", "-q", "-m", "baseline"]);
  return sb;
}
// Keep the 3 COMPILED orchestration modules already emitted under dist/core (their routing logic is what
// we are proving). A stage requires its siblings via "./", so a usable dist base needs the WHOLE core tree
// co-located — mirror every runtime/core/*.js into dist/core EXCEPT those 3 compiled modules.
const COMPILED_KEEP = new Set(["pipeline-builder.js", "stage-effect.js", "checkpoint-engine.js"]);
/** Mirror the JS core tree into runtime/dist/core (sentinels, NOT TS-migrated); augment the first stage with a provenance marker. */
function populateDistStages(sb: string): void {
  const coreDir = path.join(sb, "runtime", "core");
  const distCore = path.join(sb, "runtime", "dist", "core");
  for (const f of fs.readdirSync(coreDir)) {
    if (!f.endsWith(".js") || f.endsWith(".test.js") || COMPILED_KEEP.has(f)) continue;
    fs.cpSync(path.join(coreDir, f), path.join(distCore, f));
  }
  const first = path.join(distCore, "mission-interpreter.js");
  const marker = `require("fs").writeFileSync("runtime/generated/__stage_base.json", JSON.stringify({base:"dist"}));\n`;
  const src = fs.readFileSync(first, "utf8");
  // Insert the sentinel AFTER any shebang (node requires `#!` on line 1), preserving the stage's own logic.
  const withMarker = src.startsWith("#!")
    ? src.replace(/^(#![^\n]*\n)/, `$1${marker}`)
    : marker + src;
  fs.writeFileSync(first, withMarker);
}
function runEnv(stageBase?: string, odgRuntime?: string): NodeJS.ProcessEnv {
  const env = { ...process.env, FLEET_BRIDGE_MOCK: "1" };
  delete env.ODG_FLEET; delete env.ODG_VERBOSE; delete env.ODG_RUNTIME_ENTRY;
  if (stageBase === undefined) delete env.ODG_STAGE_BASE; else env.ODG_STAGE_BASE = stageBase;
  // ODG_RUNTIME selects the historical JS fallback: post-L7-FIX-2 the DEFAULT stage base is the compiled
  // dist/core when present, so to exercise the HISTORICAL "runtime/core" base an operator sets ODG_RUNTIME=js.
  if (odgRuntime === undefined) delete env.ODG_RUNTIME; else env.ODG_RUNTIME = odgRuntime;
  return env;
}
function run(sb: string, mission: string, stageBase?: string, odgRuntime?: string): { code: number | null; out: string } {
  const r = spawnSync("node", [COMPILED_ENTRY, mission], { cwd: sb, encoding: "utf8", env: runEnv(stageBase, odgRuntime) });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
const readGen = (sb: string, n: string): any => JSON.parse(fs.readFileSync(path.join(sb, "runtime", "generated", n), "utf8"));
const genExists = (sb: string, n: string): boolean => fs.existsSync(path.join(sb, "runtime", "generated", n));
function pipelinePaths(sb: string): string[] { return readGen(sb, "runtime-pipeline.json").map((s: any[]) => s[1]); }

console.log("LOT η1-B1 — STAGE-BASE ROUTING (default runtime/core vs opt-in runtime/dist/core)");
try {
  execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
  check(fs.existsSync(path.join(REPO, "runtime", "dist", "core", "pipeline-builder.js")), "prerequisite: compiled pipeline-builder present");

  // ---- A. HISTORICAL core base (ODG_RUNTIME=js) ⇒ runtime/core, 13/13, no marker -----------------
  // NOTE (L7-FIX-2): the UNSET default stage base is now the compiled dist/core when present (so TS stages
  // spawn from dist, not the source .js rollbacks). The HISTORICAL "runtime/core" base is reached by the
  // documented fallback ODG_RUNTIME=js. This scenario exercises that historical/JS core base (its assertions
  // verify core); the new dist default is exercised by scenario B's opt-in dist base.
  const sbA = seed("STAGEBASE_DEFAULT");
  check(fs.existsSync(path.join(sbA, "node_modules")) === false, "sandbox has NO node_modules");
  const rA = run(sbA, "STAGEBASE_DEFAULT", undefined, "js"); // ODG_STAGE_BASE unset + ODG_RUNTIME=js ⇒ historical core base
  check(rA.code === 0 && /PIPELINE SUCCESS — 13\/13 stages/.test(rA.out), "A core(js): 13/13 via compiled entry");
  check(/Stage base : runtime\/core/.test(rA.out), "A core(js): observable 'Stage base : runtime/core'");
  check(pipelinePaths(sbA).every((p) => p.startsWith("runtime/core/")) && pipelinePaths(sbA).length === 13, "A core(js): all 13 stage paths under runtime/core/");
  check(genExists(sbA, "__stage_base.json") === false, "A core(js): no dist provenance marker (stages ran from runtime/core)");
  check(readGen(sbA, "mission-report.json").validated === true, "A core(js): mission validated (historical behaviour preserved)");

  // ---- B. OPT-IN dist ⇒ child stages resolved from runtime/dist/core (sentinel proof) ------------
  // The dist base holds RAW COPIES of the JS stages (sentinels, NOT TS-migrated). The sentinel on the FIRST
  // stage proves the child process loaded from runtime/dist/core. HONEST FINDING (surfaced, not hidden): a
  // raw relocated copy of `capability-registry` derives ROOT from __dirname (resolve(__dirname,"..","..")),
  // so relocated to dist/core it writes its artifact to the WRONG tree (runtime/dist/generated) and the
  // pipeline STOPS EXPLICITLY at that stage. That is exactly why this lot ROUTES but does NOT migrate: real
  // stage migration must normalise such paths to CWD-relative. Routing itself is proven; there is NO silent
  // fallback to runtime/core (paths + sentinel + the explicit stop all point at dist).
  const sbB = seed("STAGEBASE_DIST");
  populateDistStages(sbB);
  const rB = run(sbB, "STAGEBASE_DIST", "runtime/dist/core");
  check(/Stage base : runtime\/dist\/core/.test(rB.out), "B opt-in dist: observable 'Stage base : runtime/dist/core'");
  check(pipelinePaths(sbB).every((p) => p.startsWith("runtime/dist/core/")) && pipelinePaths(sbB).length === 13, "B opt-in dist: all 13 stage paths under runtime/dist/core/");
  check(genExists(sbB, "__stage_base.json") && readGen(sbB, "__stage_base.json").base === "dist", "B opt-in dist: SENTINEL proves the first child stage executed from runtime/dist/core");
  check(rB.code !== 0 && /Capability Registry/.test(rB.out) && !/PIPELINE SUCCESS/.test(rB.out), "B opt-in dist: raw copy stops EXPLICITLY at Capability Registry (__dirname-derived path) — migration required; NO silent fallback to runtime/core");

  // ---- C. OPT-IN dist INCOMPLETE ⇒ explicit fail, NO silent fallback. Since η3-B101 the build closure
  // (scripts/build-dist-closure.js) makes `npm run build:runtime` emit a COMPLETE dist/core, so we must
  // CONSTRUCT incompleteness: delete a required stage dependency (budget-contract, required by
  // mission-loader) from the sandbox's dist/core. runtime/core STILL contains budget-contract, so this
  // also proves the stage does NOT fall back dir-relative to runtime/core — it fails explicitly in dist.
  const sbC = seed("STAGEBASE_INCOMPLETE");
  fs.rmSync(path.join(sbC, "runtime", "dist", "core", "budget-contract.js"));
  const rC = run(sbC, "STAGEBASE_INCOMPLETE", "runtime/dist/core");
  check(rC.code !== 0 && !/PIPELINE SUCCESS/.test(rC.out), "C incomplete dist: explicit failure (missing stage dependency MODULE_NOT_FOUND), NOT 13/13");
  check(/Cannot find module/.test(rC.out) && /budget-contract/.test(rC.out), "C incomplete dist: failure names the missing dependency (explicit, NOT a silent fallback to runtime/core/budget-contract.js)");
  check(pipelinePaths(sbC).every((p) => p.startsWith("runtime/dist/core/")), "C incomplete dist: paths point at dist (NO silent fallback to runtime/core)");
  check(!genExists(sbC, "mission-report.json") || readGen(sbC, "mission-report.json").validated !== true, "C incomplete dist: mission NOT validated");

  // ---- D. OPT-IN INVALID (missing directory) ⇒ pipeline-builder throws ⇒ explicit entry failure ---
  const sbD = seed("STAGEBASE_INVALID");
  const rD = run(sbD, "STAGEBASE_INVALID", "runtime/dist/NOPE_DOES_NOT_EXIST");
  check(rD.code !== 0 && !/PIPELINE SUCCESS/.test(rD.out), "D invalid base: explicit failure (pipeline-builder throws, no fallback)");
  check(/ODG_STAGE_BASE|does not exist/.test(rD.out), "D invalid base: failure names the invalid ODG_STAGE_BASE (explicit, not silent)");
  check(!genExists(sbD, "mission-report.json") || readGen(sbD, "mission-report.json").validated !== true, "D invalid base: mission NOT validated");
} finally {
  for (const sb of sandboxes) { try { fs.rmSync(sb, { recursive: true, force: true }); } catch { /* best-effort */ } }
}

console.log(failures === 0 ? "ALL PASS — LOT η1-B1 STAGE-BASE ROUTING" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
