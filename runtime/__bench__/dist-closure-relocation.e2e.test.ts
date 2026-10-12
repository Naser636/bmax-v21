// @ts-nocheck
/*
 * LOT η3-B13 — DIST-CLOSURE RELOCATION: the 13 pipeline stages executed FROM runtime/dist/core, with their
 * transitive local-require() closure co-located there, in a bare sandbox (no node_modules). Offline.
 * =====================================================================================================
 *
 * WHY: η3-B10/B11 showed (statically) that `build:runtime` emits only 8 TypeScript outputs, while the
 * stages' transitive require() closure is ~55 local modules — so a BARE runtime/dist/core cannot run the
 * stages (MODULE_NOT_FOUND). η3-B12 found the existing "compiled-entry" bench proves the compiled ENTRY but
 * runs the STAGES from the DEFAULT base runtime/core (ODG_STAGE_BASE unset) — it never exercises dist/core
 * stage relocation. This harness closes that gap: it runs with ODG_STAGE_BASE=runtime/dist/core and proves
 * the stages really execute from dist/core with a COMPLETE co-located closure.
 *
 * MECHANISM (verified against the real sources, not names):
 *  - The compiled entry runtime/dist/bin/odg-run.js requires 3 compiled orchestration siblings from
 *    ../core (dist/core) and loads governance-kernel / odg-bootstrap / runtime-context-loader CWD-relative
 *    from the ORIGINAL runtime/ tree (legacyRequire(path.resolve(process.cwd(), rel))).
 *  - pipeline-builder (compiled) reads ODG_STAGE_BASE: an opt-in value is used VERBATIM and THROWS if the
 *    dir is absent — NO silent fallback. Stages are spawned `node <base>/<stage>.js`; each stage's
 *    require("./sibling") resolves ONLY within that base (dist/core) — a missing member fails explicitly.
 *  - The pipeline length is CONDITIONAL: ProjectContext Engine is added ONLY if the registry advertises it
 *    (absent on a fresh sandbox ⇒ omitted); Fleet Bridge is always inserted before Decision Engine.
 *    The expected stage count is therefore read from the REAL runtime-pipeline.json, not a constant.
 *
 * PRINCIPLE: dist/core is populated with EXACTLY the computed stage closure (compiled output where
 * build:runtime emits it, historical .js otherwise) + the 3 compiled orchestration modules + the entry.
 * If the closure computation is incomplete, a stage's require fails from dist/core and THIS TEST GOES RED —
 * that is the proof. The full runtime/core tree is copied ONLY for the entry's CWD-relative legacy helpers
 * and is never consulted by the dist-based stages (asserted: every stage path is under runtime/dist/core/).
 *
 * ISOLATION: throwaway os.tmpdir() sandbox OUTSIDE the repo (asserted); offline (FLEET_BRIDGE_MOCK=1;
 * ODG_FLEET/ODG_VERBOSE/NODE_PATH cleared); no external services, no real business effect. Repo read-only.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/dist-closure-relocation.e2e.test.ts
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const CORE = path.join(REPO, "runtime", "core");
const DIST_CORE = path.join(REPO, "runtime", "dist", "core");
const DIST_BIN = path.join(REPO, "runtime", "dist", "bin");

// The 14 stage FILES the pipeline can reference (from pipeline-builder.{js,ts}): the 12 unconditional
// stages, the CONDITIONAL project-context-engine, and fleet-stage (always inserted). Seeds for the closure.
const STAGE_SEEDS = [
  "mission-interpreter", "mission-loader", "execution-planner", "capability-registry", "knowledge-engine",
  "project-context-engine", "fleet-stage", "decision-engine", "patch-engine", "patch-executor",
  "validation-engine", "mission-lifecycle", "mission-ledger", "final-report",
];
// Compiled orchestration modules the ENTRY requires from ../core (dist/core), NOT reached via the stages.
const ORCHESTRATION = ["pipeline-builder", "stage-effect", "checkpoint-engine"];
// Support DATA dirs the modules read; core/bin also carry the entry's CWD-relative legacy helpers.
const COPY_DIRS = ["core", "bin", "constitution", "policies", "governance", "brain"];

const sandboxes: string[] = [];
let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

/** BFS the transitive closure of static local require("./x") over the stage seeds. Resolve each target to
 *  a runtime/core/*.js on disk; a missing target is a real gap (returned in `missing`). */
function computeClosure(seeds: string[]): { closure: string[]; missing: string[] } {
  const visited = new Set<string>();
  const closure = new Set<string>();
  const missing: string[] = [];
  const stack = [...seeds];
  while (stack.length) {
    const name = stack.pop()!;
    if (visited.has(name)) continue;
    visited.add(name);
    const file = path.join(CORE, name + ".js");
    if (!fs.existsSync(file)) { missing.push(name); continue; }
    closure.add(name);
    const src = fs.readFileSync(file, "utf8");
    const re = /\brequire\(\s*["'`](\.\/[A-Za-z0-9_-]+)["'`]\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      stack.push(m[1].replace(/^\.\//, ""));
    }
  }
  return { closure: [...closure].sort(), missing };
}

/** Place module `name` into sandbox dist/core: compiled output if build:runtime emitted it, else the
 *  historical .js. Returns the provenance so the harness can report compiled vs historical composition. */
function placeInDistCore(sbDistCore: string, name: string): "compiled" | "historical" {
  const compiled = path.join(DIST_CORE, name + ".js");
  const historical = path.join(CORE, name + ".js");
  const dest = path.join(sbDistCore, name + ".js");
  if (fs.existsSync(compiled)) { fs.cpSync(compiled, dest); return "compiled"; }
  fs.cpSync(historical, dest); return "historical";
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

function git(cwd: string, args: string[]): void {
  execFileSync("git", ["-c", "user.email=bench@local", "-c", "user.name=bench", ...args], { cwd, stdio: ["ignore", "ignore", "ignore"] });
}
function runEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env, FLEET_BRIDGE_MOCK: "1", ODG_STAGE_BASE: "runtime/dist/core" };
  delete env.ODG_FLEET; delete env.ODG_VERBOSE; delete env.NODE_PATH;
  return env;
}
function readGen(sb: string, n: string): any { return JSON.parse(fs.readFileSync(path.join(sb, "runtime", "generated", n), "utf8")); }

console.log("LOT η3-B13 — DIST-CLOSURE RELOCATION (stages executed FROM runtime/dist/core)");
try {
  // Build the compiled artifacts with the EXISTING command only (no config change).
  execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
  check(fs.existsSync(path.join(DIST_BIN, "odg-run.js")), "prerequisite: compiled runtime/dist/bin/odg-run.js present");

  // ---- Compute the transitive stage closure (the thing under test) ------------------------------
  const { closure, missing } = computeClosure(STAGE_SEEDS);
  check(missing.length === 0, `closure resolves every require target on disk (missing: ${missing.join(", ") || "none"})`);
  check(closure.length >= STAGE_SEEDS.length, `closure is a transitive superset of the ${STAGE_SEEDS.length} stage seeds (size=${closure.length})`);

  // ---- Build the sandbox --------------------------------------------------------------------------
  const mission = "DISTCLO_CLEAN";
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-distclosure-"));
  sandboxes.push(sb);
  if (sb.startsWith(REPO)) throw new Error("sandbox must live OUTSIDE the repository");
  // Entry side: support dirs (core/bin carry the entry's CWD-relative legacy helpers + their data).
  for (const d of COPY_DIRS) fs.cpSync(path.join(REPO, "runtime", d), path.join(sb, "runtime", d), { recursive: true });
  // Compiled entry + its 3 orchestration siblings under dist (the entry resolves these from ../core).
  const sbDistBin = path.join(sb, "runtime", "dist", "bin");
  const sbDistCore = path.join(sb, "runtime", "dist", "core");
  fs.mkdirSync(sbDistBin, { recursive: true });
  fs.mkdirSync(sbDistCore, { recursive: true });
  fs.cpSync(path.join(DIST_BIN, "odg-run.js"), path.join(sbDistBin, "odg-run.js"));
  // Populate dist/core with EXACTLY the computed closure (+ orchestration), compiled-or-historical.
  const composition: Record<string, string> = {};
  for (const name of closure) composition[name] = placeInDistCore(sbDistCore, name);
  for (const name of ORCHESTRATION) if (!composition[name]) composition[name] = placeInDistCore(sbDistCore, name);
  const compiledCount = Object.values(composition).filter((v) => v === "compiled").length;
  const historicalCount = Object.values(composition).filter((v) => v === "historical").length;
  console.log(`  dist/core composition: ${compiledCount} compiled + ${historicalCount} historical = ${Object.keys(composition).length} modules`);

  // HARD closure-completeness gate: every computed closure member MUST be present in dist/core. If any is
  // absent we fail NOW (no silent fallback to runtime/core is even possible for a stage's ./sibling).
  const absent = closure.filter((n) => !fs.existsSync(path.join(sbDistCore, n + ".js")));
  check(absent.length === 0, `every closure member co-located in dist/core (absent: ${absent.join(", ") || "none"})`);

  fs.mkdirSync(path.join(sb, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "missions"), { recursive: true });
  fs.writeFileSync(path.join(sb, "runtime", "missions", `${mission}.json`), JSON.stringify(cleanContract(mission), null, 2));
  fs.writeFileSync(path.join(sb, ".gitignore"), "runtime/generated/\nnode_modules/\n");
  git(sb, ["init", "-q"]); git(sb, ["add", "-A"]); git(sb, ["commit", "-q", "-m", "baseline"]);
  check(fs.existsSync(path.join(sb, "node_modules")) === false, "sandbox has NO node_modules (offline)");

  // ---- Run the compiled entry with the dist stage base -------------------------------------------
  const r = spawnSync("node", ["runtime/dist/bin/odg-run.js", mission], { cwd: sb, encoding: "utf8", env: runEnv() });
  const out = (r.stdout || "") + (r.stderr || "");
  check(r.status === 0, `compiled pipeline exits 0 (got ${r.status})${r.status === 0 ? "" : "\n--- output tail ---\n" + out.trim().split("\n").slice(-25).join("\n")}`);

  // Observable: stage base is dist/core, and EVERY stage path is under runtime/dist/core/ (no fallback).
  check(/Stage base : runtime\/dist\/core/.test(out), "observable 'Stage base : runtime/dist/core'");
  const pipelineStages = readGen(sb, "runtime-pipeline.json");
  const stagePaths: string[] = pipelineStages.map((s: any[]) => s[1]);
  const stageNames: string[] = pipelineStages.map((s: any[]) => s[0]);
  check(stagePaths.length > 0 && stagePaths.every((p) => p.startsWith("runtime/dist/core/")), `all ${stagePaths.length} stage paths under runtime/dist/core/ (no silent fallback to runtime/core)`);

  // Expected count derived from the REAL pipeline, with the conditional stage made explicit.
  const expected = stagePaths.length;
  check(new RegExp(`PIPELINE SUCCESS — ${expected}\\/${expected} stages`).test(out), `all ${expected}/${expected} stages complete (count from real pipeline, not a constant)`);
  check(stageNames.includes("Fleet Bridge"), "Fleet Bridge present (always inserted)");
  check(!stageNames.includes("ProjectContext Engine"), "ProjectContext Engine ABSENT (conditional; registry does not advertise it on a fresh sandbox)");

  // Zero module-resolution errors anywhere in the transcript (entry output + per-stage run-log).
  const runLog = (() => { try { return fs.readFileSync(path.join(sb, "runtime", "generated", "logs", mission + ".run.log"), "utf8"); } catch { return ""; } })();
  const haystack = out + "\n" + runLog;
  check(!/Cannot find module|MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND/.test(haystack), "ZERO MODULE_NOT_FOUND across entry output + per-stage run-log");

  // Per-stage return codes captured from the run-log; every stage section must report exit 0.
  const exitMatches = [...runLog.matchAll(/=====\s+>>>\s+(.+?)\s+\(exit\s+(-?\d+|null)\)\s+=====/g)];
  const nonZero = exitMatches.filter((m) => m[2] !== "0").map((m) => `${m[1]}=${m[2]}`);
  check(exitMatches.length >= expected, `per-stage run-log captured ${exitMatches.length} stage exit codes (>= ${expected})`);
  check(nonZero.length === 0, `every stage exited 0 (non-zero: ${nonZero.join(", ") || "none"})`);

  // Validated SUCCESS — a real mission outcome, not merely process exit 0.
  const report = readGen(sb, "mission-report.json");
  check(report.mission === mission && report.validated === true && report.status === "SUCCESS", "mission-report.json: validated SUCCESS (real outcome, not just exit 0)");
  check(readGen(sb, "mission-lifecycle.json").achieved === "ARCHIVED", "read-only mission reaches ARCHIVED");
  const ledger = readGen(sb, "mission-ledger.json");
  const entries = Array.isArray(ledger) ? ledger : (ledger.entries || ledger.missions || []);
  check(entries.some((e: any) => (e.mission || e.missionId) === mission && e.proven === true), "sandbox ledger records the mission (proven)");

  // The Capability Registry stage (compiled port) wrote its artifact to runtime/generated, NOT dist/generated.
  check(fs.existsSync(path.join(sb, "runtime", "generated", "capability-registry.json")), "Capability Registry artifact at runtime/generated/ (process.cwd() root, from dist/core)");
  check(!fs.existsSync(path.join(sb, "runtime", "dist", "generated")), "NO runtime/dist/generated/ created (path invariant holds from dist/core)");
} finally {
  for (const sb of sandboxes) { try { fs.rmSync(sb, { recursive: true, force: true }); } catch { /* best-effort */ } }
}

console.log(failures === 0 ? "ALL PASS — LOT η3-B13 DIST-CLOSURE RELOCATION" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
