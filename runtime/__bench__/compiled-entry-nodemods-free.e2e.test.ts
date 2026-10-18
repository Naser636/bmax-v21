// @ts-nocheck — L5 bench test migration: runs under tsx unchanged; suppresses tsc typechecking
// (NOT strict typing) — recorded migration debt. See ODG_PROJECT_STATE.md.
// @ts-nocheck
/*
 * LOT 1S — TypeScript port of the Lot 1R proof harness (compiled-entry-nodemods-free.e2e.test.js).
 * ================================================================================================
 *
 * Same intent and assertions as the JavaScript original, expressed in TypeScript and run with the
 * repo's existing tsx runner, using the repo's manual check()/process.exit convention (the same style
 * as src/runtime/*.test.ts — NOT node:test, so the exit code is explicit under tsx). The JavaScript
 * harness is kept for temporary comparison; neither replaces nor renames the other.
 *
 * Proves the COMPILED entry (runtime/dist/bin/odg-run.js, emitted by `npm run build:runtime`) drives
 * the full 13-stage pipeline in a throwaway sandbox that has NO node_modules and where tsx is
 * unresolvable — with plain `node`. Checks: no node_modules in the sandbox; the compiled entry carries
 * no tsx require/import; 13/13 stages; validated SUCCESS; ARCHIVED; ODG_CAPABILITY/ODG_EXECUTOR
 * attribution with no UNKNOWN/CONTRACT credited; the sandbox ledger records the mission (proven); an
 * independent recompute via the real modules agrees (3/3); checkpoint reaches COMPLETE.
 *
 * PREREQUISITE: `npm run build:runtime` has emitted runtime/dist. Writes ONLY into its tmpdir sandbox.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/compiled-entry-nodemods-free.e2e.test.ts
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync, spawnSync } from "node:child_process";

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

function sh(cmd: string, args: string[], cwd: string): string {
  return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}
function buildSandbox(contract: Record<string, unknown>): string {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-compiled-ts-"));
  sandboxes.push(sb);
  if (sb.startsWith(REPO)) throw new Error("sandbox must live OUTSIDE the repository");
  for (const d of COPY_DIRS) fs.cpSync(path.join(REPO, "runtime", d), path.join(sb, "runtime", d), { recursive: true });
  fs.cpSync(path.join(REPO, "runtime", "dist"), path.join(sb, "runtime", "dist"), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "missions"), { recursive: true });
  fs.writeFileSync(path.join(sb, "runtime", "missions", `${contract.mission}.json`), JSON.stringify(contract, null, 2));
  fs.writeFileSync(path.join(sb, ".gitignore"), "runtime/generated/\nnode_modules/\n");
  sh("git", ["init", "-q"], sb);
  sh("git", ["-c", "user.email=bench@local", "-c", "user.name=bench", "add", "-A"], sb);
  sh("git", ["-c", "user.email=bench@local", "-c", "user.name=bench", "commit", "-q", "-m", "baseline"], sb);
  return sb;
}
function runEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env, FLEET_BRIDGE_MOCK: "1" };
  delete env.ODG_FLEET; delete env.ODG_VERBOSE; delete env.NODE_PATH;
  return env;
}
function readGen(sb: string, n: string): any { return JSON.parse(fs.readFileSync(path.join(sb, "runtime", "generated", n), "utf8")); }

function contract(mission: string) {
  return {
    mission, version: "1.0", status: "AUTHORIZED", mode: "READ_ONLY", priority: "NORMAL",
    requires_engineering: false, authorized_paths: [],
    objectives: [
      { id: "CLEAN_WORKSPACE_1", goal: "Enumerate the transient git-ignored runtime workspace artifacts under runtime/ (read-only scan).",
        done_when: ["A deterministic scan lists every candidate path under runtime/ that is safe to remove."], authorization: { eligible: true, authorized: true } },
      { id: "CLEAN_WORKSPACE_2", goal: "Confirm each candidate is covered by the gitignore/backup/archive policy so no tracked or required artifact is listed.",
        done_when: ["Every candidate is git-ignored or already archived; no tracked or required artifact is listed."], authorization: { eligible: true, authorized: true } },
      { id: "CLEAN_WORKSPACE_3", goal: "Produce read-only evidence of the cleaned workspace state without deleting any tracked or required artifact.",
        done_when: ["Evidence generated.", "Report generated."], authorization: { eligible: true, authorized: true } },
    ],
    verify: [{ capability: "Clean Workspace", evidence: "clean-workspace-scanned" }],
    definition_of_done: ["Evidence generated", "Report generated"],
  };
}

console.log("LOT 1S — COMPILED ENTRY IN A BARE SANDBOX (TypeScript harness)");
try {
  const compiledEntry = path.join(REPO, "runtime", "dist", "bin", "odg-run.js");
  check(fs.existsSync(compiledEntry), "prerequisite: runtime/dist/bin/odg-run.js exists (npm run build:runtime)");
  check(!/(require\(|from\s+)['"]tsx(\/|['"])/.test(fs.readFileSync(compiledEntry, "utf8")), "compiled entry carries no tsx require/import");

  // 1 — full pipeline via the compiled entry in a bare sandbox.
  {
    const sb = buildSandbox(contract("COMPILED_TS_CLEAN"));
    check(fs.existsSync(path.join(sb, "node_modules")) === false, "sandbox has no node_modules");
    const tsxProbe = spawnSync("node", ["-e", "require.resolve('tsx/cjs')"], { cwd: sb, encoding: "utf8", env: runEnv() });
    check(tsxProbe.status !== 0, "tsx/cjs is UNRESOLVABLE in the bare sandbox (no hidden tsx dep)");

    const r = spawnSync("node", ["runtime/dist/bin/odg-run.js", "COMPILED_TS_CLEAN"], { cwd: sb, encoding: "utf8", env: runEnv() });
    const out = (r.stdout || "") + (r.stderr || "");
    check(r.status === 0, "compiled pipeline exits 0");
    check(/PIPELINE SUCCESS — 13\/13 stages/.test(out), "all 13 stages complete via the compiled entry");

    const report = readGen(sb, "mission-report.json");
    check(report.mission === "COMPILED_TS_CLEAN" && report.validated === true && report.status === "SUCCESS", "runtime report validated SUCCESS");
    check(readGen(sb, "mission-lifecycle.json").achieved === "ARCHIVED", "read-only mission reaches ARCHIVED");

    const exec = readGen(sb, "patch-execution.json");
    const cw = exec.executed.filter((e: any) => String(e.objectiveId || e.action || "").startsWith("CLEAN_WORKSPACE_"));
    check(cw.length === 3 && cw.every((e: any) => e.status === "EXECUTED" && e.authoredBy === "ODG_CAPABILITY" && e.appliedBy === "ODG_EXECUTOR"), "3 objectives EXECUTED, ODG_CAPABILITY/ODG_EXECUTOR");
    const ledger = readGen(sb, "mission-ledger.json");
    const entries = Array.isArray(ledger) ? ledger : (ledger.entries || ledger.missions || []);
    check(entries.some((e: any) => (e.mission || e.missionId) === "COMPILED_TS_CLEAN" && e.proven === true), "sandbox ledger records the mission (proven)");

    const plan = readGen(sb, "mission-plan.json");
    const patchPlan = readGen(sb, "patch-plan.json");
    const probe = (p: string) => { try { return typeof p === "string" && p.length > 0 && fs.statSync(path.join(sb, p)).size > 0; } catch { return false; } };
    const attribution = attributeObjectives(plan, patchPlan, exec, probe, () => ({}), () => false, {});
    const { map, complete } = eligibilityFromObjectives(Array.isArray(plan.objectives) ? plan.objectives : []);
    check(complete === true, "eligibility denominator complete");
    const coverageOk = !!(report.checks && report.checks.objectiveCoverage === true);
    const measured: any = measureAutonomy(fromExecution(exec, attribution, map, { runComplete: coverageOk }));
    check(measured.measurable === true && measured.numerator === 3 && measured.denominator === 3, "independent recompute: 3/3 measurable");
    check(exec.executed.some((e: any) => e.authoredBy === "UNKNOWN" || e.authoredBy === "CONTRACT") === false, "no UNKNOWN/CONTRACT origin credited");
  }

  // 2 — checkpoint/resume parity via the compiled checkpoint-engine.
  {
    const sb = buildSandbox(contract("COMPILED_TS_CLEAN2"));
    const r = spawnSync("node", ["runtime/dist/bin/odg-run.js", "COMPILED_TS_CLEAN2"], { cwd: sb, encoding: "utf8", env: runEnv() });
    check(r.status === 0, "second compiled run exits 0");
    const cp = readGen(sb, "pipeline-checkpoint.json");
    check(cp.mission === "COMPILED_TS_CLEAN2" && cp.status === "COMPLETE" && cp.completed.length === cp.stages.length, "checkpoint reaches COMPLETE (every stage DONE)");
  }
} finally {
  for (const sb of sandboxes) { try { fs.rmSync(sb, { recursive: true, force: true }); } catch { /* best-effort */ } }
}

console.log(failures === 0 ? "ALL PASS — LOT 1S TS HARNESS" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
