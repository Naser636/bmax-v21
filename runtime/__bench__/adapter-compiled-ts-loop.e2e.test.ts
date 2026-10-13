// @ts-nocheck
/*
 * LOT B-ζ — TS CONTINUOUS-LOOP ADAPTER: legacy vs compiled ENTRY parity via ODG_RUNTIME_ENTRY (Phase-03).
 * =======================================================================================================
 *
 * The accepted sibling runtime/__bench__/autonomy-ts-loop.e2e.test.ts drives the REAL production loop class
 * `AutonomyRuntimeAdapter` (src/runtime/autonomy-runtime-adapter.ts) — the exact per-mission executor the
 * autonomy/converge CLIs call — but it NEVER sets ODG_RUNTIME_ENTRY, so it exercises the adapter ONLY on the
 * historical/legacy entry (runtime/bin/odg-run.js). It does NOT compare the two entries. This bench closes
 * that gap: it drives the SAME adapter and proves its per-mission result is IDENTICAL whether the adapter's
 * resolvePipelineEntry() launches the LEGACY entry (ODG_RUNTIME_ENTRY unset — the production default) or the
 * COMPILED entry (ODG_RUNTIME_ENTRY=runtime/dist/bin/odg-run.js, built by `npm run build:runtime`).
 *
 * WHY THE ADAPTER IS SAFE HERE (verified): every scenario is READ_ONLY / non-engineering, so
 * missionRequiresProvider() === false (provider-port.ts:616) and AutonomyRuntimeAdapter.runPipeline NEVER
 * escalates to the engineering provider — no live/paid call, fully offline. (The genuine UNAUTHORIZED-attempt
 * refusals — empty-scope, self-approval — are IMPLEMENT-mode, which WOULD risk the forbidden provider path
 * through the adapter; those stay proven on the DIRECT-entry path by B-β/B-γ/B-ε and are NOT re-driven here.)
 *
 * WHAT IT PROVES (via the production adapter, both entries):
 *   POSITIVE : the TS loop executes a multi-objective AUTHORIZED READ_ONLY mission ⇒ pipelineOk; validated
 *     SUCCESS; lifecycle ARCHIVED; 3 objectives EXECUTED ODG_CAPABILITY/ODG_EXECUTOR; sandbox ledger proven;
 *     independent recompute 3/3 = 100%; no UNKNOWN/CONTRACT credited — and the two engine views are EQUAL.
 *   NEGATIVE (authorized-but-failed, non-ff) : the adapter surfaces the failure (NOT pipelineOk); target
 *     branch UNCHANGED (independent git proof); mission not validated; objective FAILED / measured 0/1
 *     BLOCKED_REFUSED_FAILED (never credited) — and the two engine views are EQUAL.
 *   NEGATIVE (no silent fallback) : with ODG_RUNTIME_ENTRY set to a MISSING compiled entry the adapter fails
 *     EXPLICITLY (NOT pipelineOk), its diagnostics name the OVERRIDE path (never the legacy entry), and the
 *     mission does not validate — proving the override is used verbatim with NO silent fallback to legacy.
 *
 * SCOPE HONESTY: this proves ENTRY-selection parity of the TS loop's per-mission core. It is NOT a claim that
 * the runtime is "all TypeScript": the 13 pipeline STAGES remain JavaScript (the compiled entry drives the
 * SAME JS stages). It is NOT the full plan-selection loop to PLAN_COMPLETE, and NOT Phase-03 certification.
 *
 * ISOLATION (§4): each run is its OWN os.tmpdir() sandbox (asserted OUTSIDE the repo; git sandboxes are
 * throwaway repos), NO node_modules (asserted), tsx unresolvable (asserted — compiled bare-node proof),
 * offline (FLEET_BRIDGE_MOCK=1; ODG_FLEET/ODG_VERBOSE cleared; no provider passed). Every git command targets
 * a sandbox cwd; the real repository is never written. Distinct mission ids per engine/scenario.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/adapter-compiled-ts-loop.e2e.test.ts
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync, spawnSync } from "node:child_process";
import { AutonomyRuntimeAdapter } from "@/runtime/autonomy-runtime-adapter";

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const { attributeObjectives } = require(path.join(REPO, "runtime", "core", "objective-attribution.js"));
const { eligibilityFromObjectives, fromExecution, measureAutonomy, CATEGORY } =
  require(path.join(REPO, "runtime", "core", "autonomy-measure.js"));

const COMPILED_REL = "runtime/dist/bin/odg-run.js";
const COPY_DIRS = ["core", "bin", "constitution", "policies", "governance", "brain"];
const sandboxes: string[] = [];
let failures = 0;

function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}
function git(cwd: string, args: string[]): string {
  return execFileSync("git", ["-c", "user.email=bench@local", "-c", "user.name=bench", ...args],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}
function seed(sb: string): void {
  if (sb.startsWith(REPO)) throw new Error("sandbox must live OUTSIDE the repository");
  for (const d of COPY_DIRS) fs.cpSync(path.join(REPO, "runtime", d), path.join(sb, "runtime", d), { recursive: true });
  fs.cpSync(path.join(REPO, "runtime", "dist"), path.join(sb, "runtime", "dist"), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "missions"), { recursive: true });
  fs.writeFileSync(path.join(sb, ".gitignore"), "runtime/generated/\nnode_modules/\n");
}
function plainSandbox(c: any): string {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-tsloop-par-"));
  sandboxes.push(sb); seed(sb);
  fs.writeFileSync(path.join(sb, "runtime", "missions", `${c.mission}.json`), JSON.stringify(c, null, 2));
  git(sb, ["init", "-q"]); git(sb, ["add", "-A"]); git(sb, ["commit", "-q", "-m", "baseline"]);
  return sb;
}
function gitSandbox(c: any, diverge: boolean): string {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-tsloop-git-par-"));
  sandboxes.push(sb); seed(sb);
  fs.writeFileSync(path.join(sb, "runtime", "missions", `${c.mission}.json`), JSON.stringify(c, null, 2));
  git(sb, ["init", "-q"]); git(sb, ["add", "-A"]); git(sb, ["commit", "-q", "-m", "baseline"]);
  const base = git(sb, ["rev-parse", "HEAD"]);
  git(sb, ["branch", "stable", base]); git(sb, ["branch", "work", base]);
  git(sb, ["checkout", "-q", "work"]);
  fs.writeFileSync(path.join(sb, "work-change.txt"), "work-1\n");
  git(sb, ["add", "-A"]); git(sb, ["commit", "-q", "-m", "work commit 1"]);
  if (diverge) {
    git(sb, ["checkout", "-q", "stable"]);
    fs.writeFileSync(path.join(sb, "stable-change.txt"), "stable-1\n");
    git(sb, ["add", "-A"]); git(sb, ["commit", "-q", "-m", "stable commit 1"]);
  }
  git(sb, ["checkout", "-q", base]);
  return sb;
}
const readGen = (sb: string, n: string): any => JSON.parse(fs.readFileSync(path.join(sb, "runtime", "generated", n), "utf8"));
const genExists = (sb: string, n: string): boolean => fs.existsSync(path.join(sb, "runtime", "generated", n));

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
function gitContract(mission: string) {
  return {
    mission, version: "1.0", status: "AUTHORIZED", mode: "READ_ONLY", priority: "NORMAL",
    requires_engineering: false, authorized_paths: [],
    objectives: [{ id: "GIT_BRANCH_INTEGRATION_1", goal: "Integrate the local source branch into the local target branch, fast-forward only, recorded C03.", done_when: ["The target branch tip equals the source tip via a local fast-forward."], authorization: { eligible: true, authorized: true }, git_branch_integration: { target: "stable", source: "work", execute: true } }],
    verify: [{ capability: "Governed Git Branch Integration", evidence: "git-branch-integrated" }],
    definition_of_done: ["Local fast-forward integration performed and recorded."],
  };
}

function unitsFor(sb: string, mission: string): any[] {
  const exec = readGen(sb, "patch-execution.json");
  const plan = readGen(sb, "mission-plan.json");
  const patchPlan = readGen(sb, "patch-plan.json");
  const report = genExists(sb, "mission-report.json") ? readGen(sb, "mission-report.json") : { checks: {} };
  const probe = (p: string) => { try { return typeof p === "string" && p.length > 0 && fs.statSync(path.join(sb, p)).size > 0; } catch { return false; } };
  const attribution = attributeObjectives(plan, patchPlan, exec, probe, () => ({}), () => false, {});
  const { map } = eligibilityFromObjectives(Array.isArray(plan.objectives) ? plan.objectives : []);
  const coverageOk = !!(report.checks && report.checks.objectiveCoverage === true);
  const units = fromExecution(exec, attribution, map, { runComplete: coverageOk });
  return units.map((u: any) => ({ ...u, id: `${mission}::${u.id}` }));
}

/** POSITIVE via the adapter: engine-independent parity view + raw ledger facts. */
function positiveView(sb: string, mission: string): any {
  const report = readGen(sb, "mission-report.json");
  const life = readGen(sb, "mission-lifecycle.json");
  const exec = readGen(sb, "patch-execution.json");
  const cp = readGen(sb, "pipeline-checkpoint.json");
  const ledger = readGen(sb, "mission-ledger.json");
  const entries = Array.isArray(ledger) ? ledger : (ledger.entries || ledger.missions || []);
  const cw = exec.executed.filter((e: any) => String(e.objectiveId || e.action || "").startsWith("CLEAN_WORKSPACE_"));
  const m = measureAutonomy(unitsFor(sb, mission));
  return {
    reportValidated: report.validated, reportStatus: report.status, achieved: life.achieved,
    cwCount: cw.length, cwAllExecutedOdg: cw.length === 3 && cw.every((e: any) => e.status === "EXECUTED" && e.authoredBy === "ODG_CAPABILITY" && e.appliedBy === "ODG_EXECUTOR"),
    ledgerProvenForMission: entries.some((e: any) => (e.mission || e.missionId) === mission && e.proven === true),
    anyUnknownOrContract: exec.executed.some((e: any) => e.authoredBy === "UNKNOWN" || e.authoredBy === "CONTRACT"),
    cpStatus: cp.status, cpAllDone: cp.completed.length === cp.stages.length,
    measurable: m.measurable, denominator: m.denominator, numerator: m.numerator, autonomyPercent: m.autonomyPercent,
    catExecuted: m.categories[CATEGORY.ODG_EXECUTED_VERIFIED], catOperator: m.categories[CATEGORY.OPERATOR_OR_EXTERNAL],
  };
}
function nonffView(sb: string, mission: string, stableBefore: string, pipelineOk: boolean): any {
  const stableAfter = git(sb, ["rev-parse", "stable"]);
  const exec = genExists(sb, "patch-execution.json") ? readGen(sb, "patch-execution.json") : null;
  const e = exec ? exec.executed.find((x: any) => x.objectiveId === "GIT_BRANCH_INTEGRATION_1" || x.action === "GIT_BRANCH_INTEGRATION_1") : null;
  const report = genExists(sb, "mission-report.json") ? readGen(sb, "mission-report.json") : null;
  let measured: any = { measurable: null, denominator: null, numerator: null, blocked: null };
  if (exec) { const m = measureAutonomy(unitsFor(sb, mission)); measured = { measurable: m.measurable, denominator: m.denominator, numerator: m.numerator, blocked: m.categories[CATEGORY.BLOCKED_REFUSED_FAILED] }; }
  return {
    adapterNotPipelineOk: pipelineOk !== true,
    stableUnchanged: stableAfter === stableBefore,
    execStatus: e ? e.status : "(no-record)",
    reportValidatedNotTrue: !report || report.validated !== true,
    measured,
  };
}

// Offline (identical to the accepted TS-loop bench): no provider; FLEET_BRIDGE_MOCK=1; ODG_FLEET/ODG_VERBOSE cleared.
process.env.FLEET_BRIDGE_MOCK = "1";
delete process.env.ODG_FLEET;
delete process.env.ODG_VERBOSE;

console.log("LOT B-ζ — TS CONTINUOUS-LOOP ADAPTER: legacy vs compiled ENTRY parity via ODG_RUNTIME_ENTRY");
try {
  execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
  check(fs.existsSync(path.join(REPO, "runtime", "dist", "bin", "odg-run.js")), "prerequisite: runtime/dist/bin/odg-run.js built");

  // ======== POSITIVE — multi-objective READ_ONLY mission via the ADAPTER, both entries ============
  const sbPL = plainSandbox(cleanContract("TSLOOP_PAR_CLEAN_LEGACY"));
  const sbPC = plainSandbox(cleanContract("TSLOOP_PAR_CLEAN_COMPILED"));
  check(fs.existsSync(path.join(sbPC, "node_modules")) === false, "compiled sandbox has NO node_modules");
  const tsxProbe = spawnSync("node", ["-e", "require.resolve('tsx/cjs')"], { cwd: sbPC, encoding: "utf8" });
  check(tsxProbe.status !== 0, "tsx/cjs unresolvable in the bare compiled sandbox (plain-node proof)");

  delete process.env.ODG_RUNTIME_ENTRY; // LEGACY (production default)
  const outL: any = new AutonomyRuntimeAdapter(sbPL).runPipeline("TSLOOP_PAR_CLEAN_LEGACY");
  check(outL && outL.pipelineOk === true, "LEGACY (default): adapter.runPipeline executes (pipelineOk)");

  process.env.ODG_RUNTIME_ENTRY = COMPILED_REL; // COMPILED (opt-in via the seam)
  const outC: any = new AutonomyRuntimeAdapter(sbPC).runPipeline("TSLOOP_PAR_CLEAN_COMPILED");
  check(outC && outC.pipelineOk === true, "COMPILED (ODG_RUNTIME_ENTRY opt-in): adapter.runPipeline executes (pipelineOk)");
  delete process.env.ODG_RUNTIME_ENTRY;

  const vL = positiveView(sbPL, "TSLOOP_PAR_CLEAN_LEGACY");
  const vC = positiveView(sbPC, "TSLOOP_PAR_CLEAN_COMPILED");
  for (const [tag, v] of [["LEGACY", vL], ["COMPILED", vC]] as const) {
    check(v.reportValidated === true && v.reportStatus === "SUCCESS", `${tag}: validated SUCCESS`);
    check(v.achieved === "ARCHIVED", `${tag}: read-only mission ARCHIVED via the shared pipeline`);
    check(v.cwAllExecutedOdg === true, `${tag}: 3 objectives EXECUTED ODG_CAPABILITY/ODG_EXECUTOR`);
    check(v.ledgerProvenForMission === true, `${tag}: sandbox ledger records the mission (proven)`);
    check(v.measurable === true && v.denominator === 3 && v.numerator === 3 && v.autonomyPercent === 100, `${tag}: independent measure 3/3 = 100%`);
    check(v.catExecuted === 3 && v.catOperator === 0, `${tag}: categories 3 ODG-executed / 0 operator`);
    check(v.anyUnknownOrContract === false, `${tag}: no UNKNOWN/CONTRACT origin credited`);
  }
  check(JSON.stringify(vL) === JSON.stringify(vC), "PARITY(positive): legacy and compiled adapter views identical");

  // ======== NEGATIVE (authorized-but-failed, non-ff) via the ADAPTER, both entries ================
  const sbNL = gitSandbox(gitContract("TSLOOP_PAR_NONFF_LEGACY"), true);
  const sbNC = gitSandbox(gitContract("TSLOOP_PAR_NONFF_COMPILED"), true);
  const nStBeforeL = git(sbNL, ["rev-parse", "stable"]);
  const nStBeforeC = git(sbNC, ["rev-parse", "stable"]);

  delete process.env.ODG_RUNTIME_ENTRY;
  const nOutL: any = new AutonomyRuntimeAdapter(sbNL).runPipeline("TSLOOP_PAR_NONFF_LEGACY");
  process.env.ODG_RUNTIME_ENTRY = COMPILED_REL;
  const nOutC: any = new AutonomyRuntimeAdapter(sbNC).runPipeline("TSLOOP_PAR_NONFF_COMPILED");
  delete process.env.ODG_RUNTIME_ENTRY;

  const rL = nonffView(sbNL, "TSLOOP_PAR_NONFF_LEGACY", nStBeforeL, nOutL && nOutL.pipelineOk);
  const rC = nonffView(sbNC, "TSLOOP_PAR_NONFF_COMPILED", nStBeforeC, nOutC && nOutC.pipelineOk);
  for (const [tag, r] of [["LEGACY", rL], ["COMPILED", rC]] as const) {
    check(r.adapterNotPipelineOk === true, `${tag} non-ff: adapter surfaces the failure (NOT pipelineOk)`);
    check(r.stableUnchanged === true, `${tag} non-ff: target branch UNCHANGED (independent git proof, fail-closed)`);
    check(r.execStatus === "FAILED", `${tag} non-ff: objective recorded FAILED`);
    check(r.reportValidatedNotTrue === true, `${tag} non-ff: mission NOT validated`);
    check(r.measured.measurable === true && r.measured.denominator === 1 && r.measured.numerator === 0 && r.measured.blocked === 1, `${tag} non-ff: measured authorized-but-failed 0/1 (BLOCKED, never credited)`);
  }
  check(JSON.stringify(rL) === JSON.stringify(rC), "PARITY(non-ff): legacy and compiled adapter refusal views identical");

  // ======== NEGATIVE (no silent fallback) — adapter honours a MISSING override verbatim ===========
  const sbBad = plainSandbox(cleanContract("TSLOOP_PAR_BADENTRY"));
  process.env.ODG_RUNTIME_ENTRY = "runtime/dist/bin/DOES_NOT_EXIST.js";
  const badOut: any = new AutonomyRuntimeAdapter(sbBad).runPipeline("TSLOOP_PAR_BADENTRY");
  delete process.env.ODG_RUNTIME_ENTRY;
  check(!badOut || badOut.pipelineOk !== true, "invalid override: adapter does NOT report pipelineOk (explicit failure)");
  const diagProvider = badOut && badOut.diagnostics && badOut.diagnostics.provider;
  check(/DOES_NOT_EXIST/.test(String(diagProvider)) && !/runtime\/bin\/odg-run\.js/.test(String(diagProvider)), "invalid override: diagnostics name the OVERRIDE path, never the legacy entry (no silent fallback)");
  check(!genExists(sbBad, "mission-report.json") || readGen(sbBad, "mission-report.json").validated !== true, "invalid override: mission NOT validated");

  check(process.env.ODG_RUNTIME_ENTRY === undefined, "ODG_RUNTIME_ENTRY cleared ⇒ production default (legacy) restored");
} finally {
  for (const sb of sandboxes) { try { fs.rmSync(sb, { recursive: true, force: true }); } catch { /* best-effort */ } }
  delete process.env.ODG_RUNTIME_ENTRY;
}

console.log(failures === 0 ? "ALL PASS — LOT B-ζ TS-LOOP ADAPTER ENTRY PARITY" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
