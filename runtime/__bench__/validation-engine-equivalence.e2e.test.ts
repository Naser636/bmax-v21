// @ts-nocheck
/*
 * LOT η3-B78 — VALIDATION-ENGINE EQUIVALENCE: the historical runtime/core/validation-engine.js vs the
 * compiled runtime/dist/core/validation-engine.js (TypeScript port) must be behaviourally identical.
 * Offline, deterministic. =============================================================================
 *
 * WHY: η3-B77 selected validation-engine as the 1st lot of the single-command TS campaign (it is CLEAN —
 * not in the A2/A3/B49 dirty set — and all 3 direct deps are clean). It is a TOP-LEVEL executing script
 * (no exports, no require.main guard): it reads runtime/generated/{mission-plan,patch-plan,patch-execution}
 * .json from cwd, computes an evidence-based verdict, writes runtime/generated/mission-report.json, prints a
 * banner, and exits 0 (SUCCESS) or 1 (PARTIAL/BLOCKED). Its transitive ./require closure is 15 modules; only
 * validation-engine is ported, the 15 stay .js. .js remains the production default.
 *
 * DETERMINISM / VOLATILES: the ONLY wall-clock in validation-engine is `new Date().toISOString()` in the
 * RED-build RECOVERY branch (requires runtime-verify.json with build/tsc false ⇒ build-recovery-engine spawns
 * a real tsc/build — non-deterministic, possibly networked). That branch is DELIBERATELY NOT exercised here;
 * every tested scenario omits runtime-verify.json, so the emitted mission-report.json has NO volatile field
 * and is compared BYTE-IDENTICAL with ZERO normalisation (like mission-lifecycle). Read-only scenarios keep
 * isEngineering=false ⇒ no git is ever invoked ⇒ fully offline & deterministic.
 *
 * SCENARIOS (derived from the source gates, not invented):
 *   S0 missing inputs            → exit 1, "STOP: missing", NO report written.
 *   S1 SUCCESS (read-only)       → coverage ok, no failures, no verify block ⇒ validated, exit 0.
 *   S2 BLOCKED (coverage)        → executed≠planned ⇒ not validated, exit 1.
 *   S3 BLOCKED (failed action)   → an execution entry status=FAILED ⇒ exit 1.
 *   S4 PARTIAL (blocked action)  → a BLOCKED entry + otherwise proven ⇒ status PARTIAL, exit 1.
 *   S5 BLOCKED (evidence)        → EXECUTED entry whose evidence artifact is absent ⇒ exit 1.
 * Each asserts mission-report.json BYTE-IDENTICAL JS≡compiled AND the hand-derived status/exit.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/validation-engine-equivalence.e2e.test.ts
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const CORE = path.join(REPO, "runtime", "core");
const DIST_CORE = path.join(REPO, "runtime", "dist", "core");
const JS_ENGINE = path.join(CORE, "validation-engine.js");

const sandboxes: string[] = [];
let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

// --- reuse of the dist-closure-relocation technique (fleet-stage/mission-lifecycle): BFS the transitive
//     ./require closure, then co-locate each member (compiled where build:runtime emitted it, historical .js
//     otherwise) so the compiled validation-engine can be RUN standalone. ------------------------------------
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
    const re = /\brequire\(\s*["'`](\.\/[A-Za-z0-9_-]+)["'`]\s*\)/g;
    let m: RegExpExecArray | null;
    const src = fs.readFileSync(file, "utf8");
    while ((m = re.exec(src)) !== null) stack.push(m[1].replace(/^\.\//, ""));
  }
  return { closure: [...closure].sort(), missing };
}
function placeInDistCore(dir: string, name: string): "compiled" | "historical" {
  const compiled = path.join(DIST_CORE, name + ".js");
  const dest = path.join(dir, name + ".js");
  if (fs.existsSync(compiled)) { fs.cpSync(compiled, dest); return "compiled"; }
  fs.cpSync(path.join(CORE, name + ".js"), dest); return "historical";
}
function writeJson(p: string, obj: any): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}
function baseEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.ODG_VERBOSE; delete env.NODE_PATH;
  return env;
}

let COMPILED_ENGINE = "";
let composition = { compiled: 0, historical: 0 };
function buildCompiledEngineDir(): void {
  const { closure, missing } = computeClosure(["validation-engine"]);
  check(missing.length === 0, `closure resolves every require target on disk (missing: ${missing.join(",") || "none"})`);
  // Exact-set structural invariant: the validation-engine transitive require-closure is the complete,
  // resolvable module set (line above proves every target resolves on disk). The count is updated when
  // validation-engine's dependency graph LEGITIMATELY changes — it grew 15→17 via the per-objective
  // proof gate + per-action authorization + A1+ fail-closed classification (capability-probes/
  // capability-executors now pull in mission-synthesizer/decision-rules/economic+research modules, all
  // verified resolvable). Kept as an exact count (not a weak membership/>0 check) so any unexpected
  // drift — an added OR removed module — still fails the gate for review.
  // 17→18 (V64j): capability-executors.writeEvidence now stamps provenance via `evidence-provenance`
  // (audit C5-A2), a legitimate new transitive member of the closure; count updated to match.
  check(closure.length === 18, `transitive closure is the expected 18-module set (size=${closure.length})`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-ve-dist-"));
  sandboxes.push(dir);
  for (const n of closure) { const prov = placeInDistCore(dir, n); composition[prov]++; }
  check(fs.existsSync(path.join(dir, "validation-engine.js")), "compiled validation-engine.js co-located in dist closure dir");
  check(fs.readFileSync(path.join(DIST_CORE, "validation-engine.js"), "utf8") === fs.readFileSync(path.join(dir, "validation-engine.js"), "utf8"), "the co-located validation-engine.js IS the compiled build output");
  COMPILED_ENGINE = path.join(dir, "validation-engine.js");
}

// Seed a sandbox's runtime/generated with the three pipeline artifacts for one scenario.
function seedCase(sb: string, seed: { plan?: any; patch?: any; execution?: any; verify?: any; checkpoint?: any }): void {
  const G = path.join(sb, "runtime", "generated");
  fs.mkdirSync(G, { recursive: true });
  if (seed.plan !== undefined) writeJson(path.join(G, "mission-plan.json"), seed.plan);
  if (seed.patch !== undefined) writeJson(path.join(G, "patch-plan.json"), seed.patch);
  if (seed.execution !== undefined) writeJson(path.join(G, "patch-execution.json"), seed.execution);
  // Optional build/type evidence + per-run checkpoint (for the run-ownership / staleness scenarios). The
  // files are written NOW, so a checkpoint.startedAt in the FUTURE makes the verify evidence STALE
  // (mtime < startedAt), and one in the PAST makes it FRESH (mtime >= startedAt) — deterministic.
  if (seed.verify !== undefined) writeJson(path.join(G, "runtime-verify.json"), seed.verify);
  if (seed.checkpoint !== undefined) writeJson(path.join(G, "pipeline-checkpoint.json"), seed.checkpoint);
}
function newSandbox(tag: string): string {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-ve-" + tag + "-"));
  sandboxes.push(sb);
  return sb;
}
function runEngine(enginePath: string, sb: string): { status: number | null; out: string } {
  const r = spawnSync("node", [enginePath], { cwd: sb, encoding: "utf8", env: baseEnv() });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
function reportJson(sb: string): string | null {
  const f = path.join(sb, "runtime", "generated", "mission-report.json");
  return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null;
}

console.log("LOT η3-B78 — VALIDATION-ENGINE EQUIVALENCE (historical .js vs compiled .ts)");
try {
  execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
  check(fs.existsSync(JS_ENGINE), "prerequisite: historical runtime/core/validation-engine.js present (untouched)");
  check(fs.existsSync(path.join(DIST_CORE, "validation-engine.js")), "prerequisite: compiled runtime/dist/core/validation-engine.js emitted by build:runtime");
  buildCompiledEngineDir();
  console.log(`  dist closure composition: ${composition.compiled} compiled + ${composition.historical} historical`);

  const SCENARIOS = [
    { name: "S0 missing inputs → STOP exit 1, no report", seed: {}, expectStatus: null, expectExit: 1, expectReport: false },
    {
      name: "S1 SUCCESS (read-only, full coverage)",
      seed: { plan: { mission: "M", objectives: [{ id: "o1" }] }, patch: { mission: "M", patches: [{ file: "a" }] }, execution: { executed: [{ status: "APPLIED", objectiveId: "o1" }] } },
      expectStatus: "SUCCESS", expectExit: 0, expectReport: true,
    },
    {
      name: "S2 BLOCKED (coverage incomplete)",
      seed: { plan: { mission: "M", objectives: [{ id: "o1" }, { id: "o2" }] }, patch: { mission: "M", patches: [{ file: "a" }] }, execution: { executed: [{ status: "APPLIED", objectiveId: "o1" }] } },
      expectStatus: "BLOCKED", expectExit: 1, expectReport: true,
    },
    {
      name: "S3 BLOCKED (failed action)",
      seed: { plan: { mission: "M", objectives: [{ id: "o1" }] }, patch: { mission: "M", patches: [{ file: "a" }] }, execution: { executed: [{ status: "FAILED", action: "edit", objectiveId: "o1" }] } },
      expectStatus: "BLOCKED", expectExit: 1, expectReport: true,
    },
    {
      name: "S4 PARTIAL (one proven + one blocked)",
      seed: { plan: { mission: "M", objectives: [{ id: "o1" }, { id: "o2" }] }, patch: { mission: "M", patches: [{ file: "a" }, { file: "b" }] }, execution: { executed: [{ status: "APPLIED", objectiveId: "o1" }, { status: "BLOCKED", objectiveId: "o2", decision: "DENY", needs: "authorize" }] } },
      expectStatus: "PARTIAL", expectExit: 1, expectReport: true,
    },
    {
      name: "S5 BLOCKED (evidence artifact absent)",
      seed: { plan: { mission: "M", objectives: [{ id: "o1" }] }, patch: { mission: "M", patches: [{ file: "a" }] }, execution: { executed: [{ status: "EXECUTED", objectiveId: "o1", evidence: "runtime/generated/does-not-exist.json" }] } },
      expectStatus: "BLOCKED", expectExit: 1, expectReport: true,
    },
    // (S6/S7 run-ownership scenarios removed in V68 together with the reverted V64u `freshGatesOk` gate —
    //  that gate false-BLOCKED every real mission, see validation-engine note. The seedCase verify/checkpoint
    //  seeds remain available but are no longer exercised here.)
  ];

  for (const s of SCENARIOS) {
    const sbJ = newSandbox("s"); seedCase(sbJ, s.seed); const rJ = runEngine(JS_ENGINE, sbJ);
    const sbT = newSandbox("s"); seedCase(sbT, s.seed); const rT = runEngine(COMPILED_ENGINE, sbT);
    const jr = reportJson(sbJ), tr = reportJson(sbT);
    check(rJ.status === s.expectExit && rT.status === s.expectExit, `${s.name}: both exit ${s.expectExit} (js=${rJ.status} ts=${rT.status})`);
    if (s.expectReport) {
      check(jr !== null && jr === tr, `${s.name}: mission-report.json BYTE-IDENTICAL JS≡compiled (zero normalisation)`);
      const st = jr ? JSON.parse(jr).status : "<none>";
      check(st === s.expectStatus, `${s.name}: status=${st} (expected ${s.expectStatus})`);
    } else {
      check(jr === null && tr === null, `${s.name}: neither engine wrote mission-report.json`);
      check(/STOP: missing/.test(rJ.out) && /STOP: missing/.test(rT.out), `${s.name}: both print 'STOP: missing' banner`);
    }
  }
} finally {
  for (const sb of sandboxes) { try { fs.rmSync(sb, { recursive: true, force: true }); } catch { /* best-effort */ } }
}

console.log(failures === 0 ? "ALL PASS — LOT η3-B78 VALIDATION-ENGINE EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
