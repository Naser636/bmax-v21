// @ts-nocheck
/*
 * LOT η3-B34 — ODG_SPEC JS / COMPILED PARITY (regression of the η3-B33 proof).
 * ============================================================================
 *
 * Institutionalises η3-B33: the ODG Spec Author capability (capability-executors.js, prefix ODG_SPEC_) +
 * its independent verifier (capability-probes.js spec-schema-valid) behave IDENTICALLY on:
 *   (A) the JS path    — stages from runtime/core (default base), historical entry runtime/bin/odg-run.js;
 *   (B) the COMPILED path — compiled entry runtime/dist/bin/odg-run.js + ODG_STAGE_BASE=runtime/dist/core,
 *       with the FULL transitive stage closure co-located as raw .js in dist/core (the B13 relocation model).
 *
 * capability-executors.js / capability-probes.js / mission-synthesizer.js / patch-executor.js are NOT
 * compiled (they are .js, outside tsconfig.runtime-dist); they reach the compiled path ONLY via the
 * co-located closure. This bench proves ODG_SPEC is reachable there WITHOUT any runtime/source change, and
 * that the three-axis credit (ODG author + ODG_EXECUTOR applicator + independent probe) + the security
 * refusals hold on the compiled path exactly as on JS. Parity is EXERCISED, never inferred from the build.
 *
 * NOT a Phase-03 certification. A structured specification is NOT executable code. No attribution/measure
 * rule is modified. Isolation: throwaway os.tmpdir() git sandboxes OUTSIDE the repo (asserted), offline
 * (FLEET_BRIDGE_MOCK=1; ODG_FLEET/ODG_VERBOSE/NODE_PATH cleared). The real repository is never written.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/autonomy-spec-author-dist.e2e.test.ts
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync, spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const CORE = path.join(REPO, "runtime", "core");
const DIST_CORE = path.join(REPO, "runtime", "dist", "core");
const DIST_BIN = path.join(REPO, "runtime", "dist", "bin");
const COPY_DIRS = ["core", "bin", "constitution", "policies", "governance", "brain"];
const STAGE_SEEDS = [
  "mission-interpreter", "mission-loader", "execution-planner", "capability-registry", "knowledge-engine",
  "project-context-engine", "fleet-stage", "decision-engine", "patch-engine", "patch-executor",
  "validation-engine", "mission-lifecycle", "mission-ledger", "final-report",
];
const ORCHESTRATION = ["pipeline-builder", "stage-effect", "checkpoint-engine", "log-slug"]; // log-slug: the entry odg-run requires ../core/log-slug (first require) — an entry sibling, not a stage/orchestration dep; was missing from the relocation closure

// Pure REAL runtime modules for the independent recompute (no reimplementation of measure/attribution).
const { attributeObjectives } = require(path.join(CORE, "objective-attribution.js"));
const { eligibilityFromObjectives, fromExecution, measureAutonomy } = require(path.join(CORE, "autonomy-measure.js"));
const synth = require(path.join(CORE, "mission-synthesizer.js"));

const sandboxes: string[] = [];
let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); }
}
function computeClosure(seeds: string[]): string[] {
  const visited = new Set<string>(); const closure = new Set<string>(); const stack = [...seeds];
  while (stack.length) {
    const name = stack.pop()!; if (visited.has(name)) continue; visited.add(name);
    const file = path.join(CORE, name + ".js"); if (!fs.existsSync(file)) continue;
    closure.add(name);
    const src = fs.readFileSync(file, "utf8");
    const re = /\brequire\(\s*["'`](\.\/[A-Za-z0-9_-]+)["'`]\s*\)/g; let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) stack.push(m[1].replace(/^\.\//, ""));
  }
  return [...closure].sort();
}
function placeInDistCore(dst: string, name: string): void {
  const compiled = path.join(DIST_CORE, name + ".js"); const historical = path.join(CORE, name + ".js");
  fs.cpSync(fs.existsSync(compiled) ? compiled : historical, path.join(dst, name + ".js"));
}
function git(cwd: string, args: string[]): void {
  execFileSync("git", ["-c", "user.email=bench@local", "-c", "user.name=bench", ...args], { cwd, stdio: ["ignore", "ignore", "ignore"] });
}
function specContract(mission: string, authorizedPaths: string[]) {
  return {
    mission, version: "1.0", status: "AUTHORIZED", mode: "IMPLEMENT", priority: "NORMAL",
    requires_engineering: true, authorized_paths: authorizedPaths,
    objectives: [{
      id: "ODG_SPEC_1", goal: "1. scan inputs 2. validate schema 3. report findings",
      done_when: ["An ODG-authored specification JSON exists inside the authorized scope and passes spec-schema-valid."],
      authorization: { eligible: true, authorized: true },
    }],
    verify: [{ capability: "ODG Spec Author", evidence: "spec-schema-valid" }],
    definition_of_done: ["ODG-authored specification written strictly within the authorized scope and schema-valid."],
  };
}
function seed(mission: string, authorizedPaths: string[]): string {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-spec-par-"));
  sandboxes.push(sb);
  if (sb.startsWith(REPO)) throw new Error("sandbox must live OUTSIDE the repository");
  for (const d of COPY_DIRS) fs.cpSync(path.join(REPO, "runtime", d), path.join(sb, "runtime", d), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "missions"), { recursive: true });
  fs.writeFileSync(path.join(sb, "runtime", "missions", `${mission}.json`), JSON.stringify(specContract(mission, authorizedPaths), null, 2));
  fs.writeFileSync(path.join(sb, ".gitignore"), "runtime/generated/\nnode_modules/\n");
  git(sb, ["init", "-q"]); git(sb, ["add", "-A"]); git(sb, ["commit", "-q", "-m", "baseline"]);
  return sb;
}
/** Co-locate the full stage closure (+orchestration) + compiled entry into the sandbox's dist tree. */
function populateDist(sb: string, closure: string[]): void {
  const dc = path.join(sb, "runtime", "dist", "core"); const db = path.join(sb, "runtime", "dist", "bin");
  fs.mkdirSync(dc, { recursive: true }); fs.mkdirSync(db, { recursive: true });
  fs.cpSync(path.join(DIST_BIN, "odg-run.js"), path.join(db, "odg-run.js"));
  for (const n of closure) placeInDistCore(dc, n);
  for (const n of ORCHESTRATION) if (!closure.includes(n)) placeInDistCore(dc, n);
}
function env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const e = { ...process.env, FLEET_BRIDGE_MOCK: "1", ...extra };
  delete e.ODG_FLEET; delete e.ODG_VERBOSE; delete e.NODE_PATH; return e;
}
function runJs(sb: string, mission: string) {
  const r = spawnSync("node", ["runtime/bin/odg-run.js", mission], { cwd: sb, encoding: "utf8", env: env() });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
function runCompiled(sb: string, mission: string) {
  const r = spawnSync("node", ["runtime/dist/bin/odg-run.js", mission], { cwd: sb, encoding: "utf8", env: env({ ODG_STAGE_BASE: "runtime/dist/core" }) });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
const readGen = (sb: string, n: string): any => JSON.parse(fs.readFileSync(path.join(sb, "runtime", "generated", n), "utf8"));
const deliverablePath = (sb: string) => path.join(sb, "bench-spec", "odg-spec.json");
/** Run the spec-schema-valid probe in a child with cwd=sandbox (probe reads CWD-relative paths). */
function runProbe(sb: string): { ok: boolean | null; detail: string } {
  const probesPath = path.join(sb, "runtime", "core", "capability-probes.js");
  const code = `const p=require(${JSON.stringify(probesPath)});process.chdir(${JSON.stringify(sb)});process.stdout.write("@@"+JSON.stringify(p.runProbe("spec-schema-valid",{}))+"@@");`;
  const r = spawnSync("node", ["-e", code], { encoding: "utf8", env: env() });
  const m = (r.stdout || "").match(/@@([\s\S]*)@@/);
  return m ? JSON.parse(m[1]) : { ok: null, detail: r.stderr || "" };
}
/** Independent per-mission autonomy recompute (reuses the real modules; no measure reimplementation). */
function measureUnit(sb: string) {
  const exec = readGen(sb, "patch-execution.json");
  const plan = readGen(sb, "mission-plan.json");
  const patchPlan = readGen(sb, "patch-plan.json");
  const report = fs.existsSync(path.join(sb, "runtime", "generated", "mission-report.json")) ? readGen(sb, "mission-report.json") : { checks: {} };
  const probe = (p: string) => { try { return typeof p === "string" && p.length > 0 && fs.statSync(path.join(sb, p)).size > 0; } catch { return false; } };
  const attribution = attributeObjectives(plan, patchPlan, exec, probe, () => ({}), () => false, {});
  const { map } = eligibilityFromObjectives(Array.isArray(plan.objectives) ? plan.objectives : []);
  const coverageOk = !!(report.checks && report.checks.objectiveCoverage === true);
  return measureAutonomy(fromExecution(exec, attribution, map, { runComplete: coverageOk }));
}

console.log("LOT η3-B34 — ODG_SPEC JS/COMPILED PARITY REGRESSION");
try {
  execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
  const closure = computeClosure(STAGE_SEEDS);
  check(["capability-executors", "capability-probes", "mission-synthesizer", "patch-executor"].every((n) => closure.includes(n)),
    `closure (${closure.length}) includes capability-executors/probes/mission-synthesizer/patch-executor`);

  const MISSION = "PAR_SPEC"; // SAME id on both paths ⇒ byte-identical deliverable comparison is valid.

  // ---- (A) JS PATH ------------------------------------------------------------------------------
  const sbA = seed(MISSION, ["bench-spec/**"]);
  const rA = runJs(sbA, MISSION);
  check(rA.code === 0 && /PIPELINE SUCCESS — 13\/13 stages/.test(rA.out), "A(JS): 13/13 stages, exit 0");
  const execA = readGen(sbA, "patch-execution.json").executed.find((x: any) => x.objectiveId === "ODG_SPEC_1");
  const delA = fs.readFileSync(deliverablePath(sbA), "utf8");
  const probeA = runProbe(sbA);
  check(probeA.ok === true, "A(JS): spec-schema-valid probe passes");

  // ---- (B) COMPILED PATH ------------------------------------------------------------------------
  const sbB = seed(MISSION, ["bench-spec/**"]);
  populateDist(sbB, closure);
  check(fs.existsSync(path.join(sbB, "node_modules")) === false, "B(compiled): sandbox has NO node_modules (offline)");
  const rB = runCompiled(sbB, MISSION);
  const outB = rB.out;
  check(/Stage base : runtime\/dist\/core/.test(outB), "B(compiled): stages ran FROM runtime/dist/core");
  check(rB.code === 0 && /PIPELINE SUCCESS — 13\/13 stages/.test(outB), "B(compiled): 13/13 stages via compiled entry, exit 0");
  check(!/Cannot find module|MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND/.test(outB), "B(compiled): ZERO MODULE_NOT_FOUND (closure complete)");

  const delB = fs.existsSync(deliverablePath(sbB)) ? fs.readFileSync(deliverablePath(sbB), "utf8") : null;
  const parsedB = delB ? JSON.parse(delB) : null;
  const execB = readGen(sbB, "patch-execution.json").executed.find((x: any) => x.objectiveId === "ODG_SPEC_1");
  const probeB = runProbe(sbB);
  check(!!delB && delB.length > 0, "B(compiled): real deliverable bench-spec/odg-spec.json produced");
  check(!!execB && execB.status === "EXECUTED" && execB.capability === "ODG Spec Author", "B(compiled): EXECUTED by ODG Spec Author");
  check(!!execB && execB.authoredBy === "ODG_CAPABILITY", "B(compiled): authoredBy = ODG_CAPABILITY");
  check(!!execB && execB.appliedBy === "ODG_EXECUTOR", "B(compiled): appliedBy = ODG_EXECUTOR");
  check(probeB.ok === true, "B(compiled): INDEPENDENT spec-schema-valid probe passes: " + probeB.detail);
  check(readGen(sbB, "mission-report.json").validated === true, "B(compiled): mission validated");
  check(!!parsedB && Array.isArray(parsedB.objectives) && parsedB.objectives.length === 3, "B(compiled): exactly the 3 expected objectives (decompose(goal))");
  // Determinism, independently recomputed from the REAL synthesizer (not the probe's internal check).
  const ev = readGen(sbB, "odg-spec-author.json");
  check(JSON.stringify(synth.toContract(ev.spec)) === JSON.stringify(parsedB), "B(compiled): deliverable is the byte-identical toContract(spec) output (determinism)");

  // ---- PARITY (A) vs (B) ------------------------------------------------------------------------
  check(delA === delB, "PARITY: deliverable byte-identical JS vs compiled (same mission id)");
  check(execA.authoredBy === execB.authoredBy && execA.appliedBy === execB.appliedBy, "PARITY: attribution identical (author/applicator)");
  check(probeA.ok === true && probeB.ok === true, "PARITY: probe passes on BOTH paths");
  check(measureUnit(sbA).numerator === 1 && measureUnit(sbB).numerator === 1, "PARITY: independent per-mission measure = 1/1 on BOTH paths");

  // ---- REFUSALS on the compiled path ------------------------------------------------------------
  // (1) tampered content ⇒ present-but-invalid ⇒ probe FAIL ⇒ NO autonomy credit under the probe gate.
  fs.writeFileSync(deliverablePath(sbB), JSON.stringify({ ...parsedB, objectives: [{ ...parsedB.objectives[0], goal: parsedB.objectives[0].goal + " [TAMPERED]" }, ...parsedB.objectives.slice(1)] }, null, 2) + "\n");
  const tamper = runProbe(sbB);
  check(tamper.ok === false && /determinism|tampered|non-deterministic/i.test(tamper.detail), "B(compiled): tampered deliverable FAILS the independent probe");
  check(measureUnit(sbB).numerator === 1, "B(compiled): WITHOUT the gate, artifact-presence alone would still count it (gap the probe closes)");
  const gated = tamper.ok ? measureUnit(sbB).numerator : 0;
  check(gated === 0, "B(compiled): present-but-INVALID deliverable receives NO autonomy credit under the probe gate");

  // (2) empty scope ⇒ zero mutation.
  const sbNo = seed("PAR_NOSCOPE", []); populateDist(sbNo, closure); runCompiled(sbNo, "PAR_NOSCOPE");
  check(fs.existsSync(deliverablePath(sbNo)) === false, "B(compiled): empty scope ⇒ zero mutation (refused before write)");
  check(readGen(sbNo, "mission-report.json").validated !== true, "B(compiled): empty-scope mission NOT validated");

  // (3) governance target without elevation ⇒ refused.
  const sbGov = seed("PAR_GOV", ["runtime/governance/**"]); populateDist(sbGov, closure); runCompiled(sbGov, "PAR_GOV");
  check(fs.existsSync(path.join(sbGov, "runtime", "governance", "odg-spec.json")) === false, "B(compiled): governance target refused (no write without elevation)");
  check(readGen(sbGov, "mission-report.json").validated !== true, "B(compiled): governance mission NOT validated");
} finally {
  for (const sb of sandboxes) { try { fs.rmSync(sb, { recursive: true, force: true }); } catch { /* best-effort */ } }
}

console.log(failures === 0 ? "ALL PASS — LOT η3-B34 ODG_SPEC JS/COMPILED PARITY" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
