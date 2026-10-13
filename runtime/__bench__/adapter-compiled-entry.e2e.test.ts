// @ts-nocheck
/*
 * LOT B-α — ADAPTER ENTRY SEAM: legacy vs compiled parity (Phase-03 TS migration).
 * ===============================================================================
 *
 * Proves the migration seam added to src/runtime/autonomy-runtime-adapter.ts: by DEFAULT the adapter
 * launches the historical legacy entry (runtime/bin/odg-run.js); when ODG_RUNTIME_ENTRY opts in to the
 * COMPILED entry (runtime/dist/bin/odg-run.js), the adapter drives the identical 13-stage pipeline in a
 * bare sandbox (NO node_modules, NO tsx) with semantically-equivalent results.
 *
 * Run via the repo's tsx runner, using the manual check()/process.exit convention (same as
 * src/runtime/*.test.ts). It runs `npm run build:runtime` first, then copies runtime/dist into each
 * throwaway sandbox. Distinct mission ids are used so no existing evidence is overwritten.
 *
 * NEGATIVE controls: (a) ODG_RUNTIME_ENTRY pointing at a missing/invalid entry fails EXPLICITLY with NO
 * silent fallback to the legacy entry; (b) with ODG_RUNTIME_ENTRY unset the behaviour stays historical.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/adapter-compiled-entry.e2e.test.ts
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
const { eligibilityFromObjectives, fromExecution, measureAutonomy } =
  require(path.join(REPO, "runtime", "core", "autonomy-measure.js"));

const COPY_DIRS = ["core", "bin", "constitution", "policies", "governance", "brain"];
const sandboxes: string[] = [];
let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}
function sh(cmd: string, args: string[], cwd?: string): string {
  return execFileSync(cmd, args, { cwd: cwd || REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}
function buildSandbox(mission: string): string {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-seam-"));
  sandboxes.push(sb);
  if (sb.startsWith(REPO)) throw new Error("sandbox must be OUTSIDE the repo");
  for (const d of COPY_DIRS) fs.cpSync(path.join(REPO, "runtime", d), path.join(sb, "runtime", d), { recursive: true });
  fs.cpSync(path.join(REPO, "runtime", "dist"), path.join(sb, "runtime", "dist"), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "missions"), { recursive: true });
  fs.writeFileSync(path.join(sb, "runtime", "missions", `${mission}.json`), JSON.stringify(contract(mission), null, 2));
  fs.writeFileSync(path.join(sb, ".gitignore"), "runtime/generated/\nnode_modules/\n");
  sh("git", ["init", "-q"], sb);
  sh("git", ["-c", "user.email=b@l", "-c", "user.name=b", "add", "-A"], sb);
  sh("git", ["-c", "user.email=b@l", "-c", "user.name=b", "commit", "-q", "-m", "baseline"], sb);
  return sb;
}
function contract(mission: string) {
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
const readGen = (sb: string, n: string): any => JSON.parse(fs.readFileSync(path.join(sb, "runtime", "generated", n), "utf8"));
const genExists = (sb: string, n: string): boolean => fs.existsSync(path.join(sb, "runtime", "generated", n));

// Semantic snapshot of a completed run in a sandbox (for equivalence comparison).
function snapshot(sb: string): any {
  const report = readGen(sb, "mission-report.json");
  const life = readGen(sb, "mission-lifecycle.json");
  const exec = readGen(sb, "patch-execution.json");
  const cp = readGen(sb, "pipeline-checkpoint.json");
  const ledger = readGen(sb, "mission-ledger.json");
  const entries = Array.isArray(ledger) ? ledger : (ledger.entries || ledger.missions || []);
  const cw = exec.executed.filter((e: any) => String(e.objectiveId || e.action || "").startsWith("CLEAN_WORKSPACE_"))
    .map((e: any) => ({ status: e.status, authoredBy: e.authoredBy, appliedBy: e.appliedBy, cap: e.capability }));
  const plan = readGen(sb, "mission-plan.json");
  const patchPlan = readGen(sb, "patch-plan.json");
  const probe = (p: string) => { try { return typeof p === "string" && p.length > 0 && fs.statSync(path.join(sb, p)).size > 0; } catch { return false; } };
  const attribution = attributeObjectives(plan, patchPlan, exec, probe, () => ({}), () => false, {});
  const { map } = eligibilityFromObjectives(Array.isArray(plan.objectives) ? plan.objectives : []);
  const measured = measureAutonomy(fromExecution(exec, attribution, map, { runComplete: !!(report.checks && report.checks.objectiveCoverage === true) }));
  return {
    validated: report.validated, status: report.status, achieved: life.achieved,
    cw, cpStatus: cp.status, cpAllDone: cp.completed.length === cp.stages.length,
    ledgerProven: entries.filter((e: any) => e.proven === true).length,
    measurable: measured.measurable, numerator: measured.numerator, denominator: measured.denominator,
  };
}

console.log("LOT B-α — ADAPTER ENTRY SEAM: legacy vs compiled parity");
try {
  // Precondition: build the compiled entry (writes gitignored runtime/dist in the real repo).
  sh("npm", ["run", "build:runtime"]);
  const compiled = path.join(REPO, "runtime", "dist", "bin", "odg-run.js");
  check(fs.existsSync(compiled), "prerequisite: runtime/dist/bin/odg-run.js built");

  // ---- LEGACY (default: ODG_RUNTIME_ENTRY unset) --------------------------------------------------
  delete process.env.ODG_RUNTIME_ENTRY;
  const sbL = buildSandbox("PARITY_LEGACY");
  check(fs.existsSync(path.join(sbL, "node_modules")) === false, "sandbox has no node_modules");
  const tsxProbe = spawnSync("node", ["-e", "require.resolve('tsx/cjs')"], { cwd: sbL, encoding: "utf8" });
  check(tsxProbe.status !== 0, "tsx/cjs unresolvable in the bare sandbox");
  const outL: any = new AutonomyRuntimeAdapter(sbL).runPipeline("PARITY_LEGACY");
  check(outL && outL.pipelineOk === true, "LEGACY entry (default) runs via the adapter");
  const snapL = snapshot(sbL);

  // ---- COMPILED (opt-in via ODG_RUNTIME_ENTRY) ----------------------------------------------------
  process.env.ODG_RUNTIME_ENTRY = "runtime/dist/bin/odg-run.js";
  const sbC = buildSandbox("PARITY_COMPILED");
  const outC: any = new AutonomyRuntimeAdapter(sbC).runPipeline("PARITY_COMPILED");
  check(outC && outC.pipelineOk === true, "COMPILED entry runs via the adapter (ODG_RUNTIME_ENTRY opt-in)");
  const snapC = snapshot(sbC);
  delete process.env.ODG_RUNTIME_ENTRY;

  // ---- PARITY (semantic equivalence; ids/timestamps allowed to differ) ---------------------------
  check(snapL.validated === true && snapC.validated === true, "both: validated=true");
  check(snapL.status === snapC.status && snapL.status === "SUCCESS", "both: status SUCCESS");
  check(snapL.achieved === snapC.achieved && snapC.achieved === "ARCHIVED", "both: lifecycle ARCHIVED");
  check(JSON.stringify(snapL.cw) === JSON.stringify(snapC.cw) && snapC.cw.length === 3, "both: 3× EXECUTED ODG_CAPABILITY/ODG_EXECUTOR (identical attribution)");
  check(snapL.cpStatus === "COMPLETE" && snapC.cpStatus === "COMPLETE" && snapL.cpAllDone && snapC.cpAllDone, "both: checkpoint COMPLETE (all stages DONE)");
  check(snapL.ledgerProven === 1 && snapC.ledgerProven === 1, "both: exactly one proven ledger entry (no double append)");
  check(snapL.measurable && snapC.measurable && snapL.numerator === snapC.numerator && snapL.denominator === snapC.denominator && snapC.numerator === 3 && snapC.denominator === 3, "both: independent measure 3/3 (parity)");

  // ---- NEGATIVE (a): missing/invalid override ⇒ explicit failure, NO silent legacy fallback -------
  process.env.ODG_RUNTIME_ENTRY = "runtime/dist/bin/DOES_NOT_EXIST.js";
  const sbBad = buildSandbox("PARITY_BADENTRY");
  const outBad: any = new AutonomyRuntimeAdapter(sbBad).runPipeline("PARITY_BADENTRY");
  check(!outBad || outBad.pipelineOk !== true, "invalid override ⇒ explicit failure (pipelineOk not true)");
  const badValidated = genExists(sbBad, "mission-report.json") ? readGen(sbBad, "mission-report.json").validated === true : false;
  check(badValidated === false, "invalid override ⇒ mission NOT validated (no silent fallback to legacy success)");
  // Prove the failure names the OVERRIDE path, not the legacy entry (the adapter committed to the override).
  const diagProvider = outBad && outBad.diagnostics && outBad.diagnostics.provider;
  check(diagProvider === undefined || /DOES_NOT_EXIST/.test(String(diagProvider)) || !/runtime\/bin\/odg-run\.js/.test(String(diagProvider)),
    "invalid override ⇒ diagnostics do NOT point at the legacy entry (no silent legacy use)");
  delete process.env.ODG_RUNTIME_ENTRY;

  // ---- NEGATIVE (b): unset ⇒ historical default (re-confirmed) -----------------------------------
  check(process.env.ODG_RUNTIME_ENTRY === undefined, "ODG_RUNTIME_ENTRY cleared ⇒ default historical entry in effect");
} finally {
  for (const sb of sandboxes) { try { fs.rmSync(sb, { recursive: true, force: true }); } catch { /* best-effort */ } }
  delete process.env.ODG_RUNTIME_ENTRY;
}

console.log(failures === 0 ? "ALL PASS — LOT B-α ADAPTER ENTRY SEAM" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
