/*
 * AUTONOMY E2E — TypeScript continuous-loop execution surface (Phase 03 — Gate B, B2)
 * ===================================================================================
 *
 * PURPOSE (Gate-A gap #5). The sibling JS benches drive `runtime/bin/odg-run.js` directly. This bench
 * drives the REAL TypeScript continuous-loop executor — `AutonomyRuntimeAdapter` (src/runtime/
 * autonomy-runtime-adapter.ts), the exact class `autonomy-cli`/`converge-cli` use per mission — and
 * proves its per-mission execution is MEASURABLE with the EXISTING measure, with an explicit
 * denominator and unambiguous ODG attribution.
 *
 * WHAT THIS ESTABLISHES (verified independently):
 *   - The TS adapter's `runPipeline(mission)` executes a REAL multi-objective AUTHORIZED mission in an
 *     isolated sandbox (it spawns the same `odg-run.js` a human runs — adapter.ts:102 PIPELINE). There
 *     is NO hidden second attribution: the TS loop reuses the JS pipeline's `patch-execution.json`.
 *   - Independent recompute via the REAL modules (objective-attribution + autonomy-measure): a 3/3
 *     explicit denominator, ODG_CAPABILITY/ODG_EXECUTOR, no UNKNOWN/CONTRACT credited.
 *   - NEGATIVE (separate denominator): a non-fast-forward integration driven through the SAME adapter
 *     fails closed — target branch unchanged, mission not validated, the objective measured
 *     BLOCKED_REFUSED_FAILED (never credited).
 *
 * HONEST LIMITS: this exercises the adapter's per-mission execution core (what the loop calls each
 * cycle), NOT the full plan-selection loop to PLAN_COMPLETE (which needs roadmap/plan scaffolding — a
 * larger isolation). Offline (no provider passed; FLEET_BRIDGE_MOCK=1); synthetic throwaway sandboxes;
 * NOT Phase-03 certification; a green run is NOT CTO acceptance. Denominators are kept DISTINCT from the
 * JS benches and from QUAL_CLEAN_GATEB — never summed into a global rate.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/autonomy-ts-loop.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { AutonomyRuntimeAdapter } from "@/runtime/autonomy-runtime-adapter";

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const { attributeObjectives } = require(path.join(REPO, "runtime", "core", "objective-attribution.js"));
const { eligibilityFromObjectives, fromExecution, measureAutonomy, CATEGORY } =
  require(path.join(REPO, "runtime", "core", "autonomy-measure.js"));

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
  for (const d of COPY_DIRS) fs.cpSync(path.join(REPO, "runtime", d), path.join(sb, "runtime", d), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "missions"), { recursive: true });
  fs.writeFileSync(path.join(sb, ".gitignore"), "runtime/generated/\nnode_modules/\n");
}
function writeContract(sb: string, c: Record<string, unknown>): void {
  fs.writeFileSync(path.join(sb, "runtime", "missions", `${c.mission as string}.json`), JSON.stringify(c, null, 2));
}
function plainSandbox(c: Record<string, unknown>): string {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-tsloop-"));
  sandboxes.push(sb); seed(sb); writeContract(sb, c);
  git(sb, ["init", "-q"]); git(sb, ["add", "-A"]); git(sb, ["commit", "-q", "-m", "baseline"]);
  return sb;
}
function gitSandbox(c: Record<string, unknown>, diverge: boolean): string {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-tsloop-git-"));
  sandboxes.push(sb); seed(sb); writeContract(sb, c);
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
const readGen = (sb: string, n: string) => JSON.parse(fs.readFileSync(path.join(sb, "runtime", "generated", n), "utf8"));
const genExists = (sb: string, n: string) => fs.existsSync(path.join(sb, "runtime", "generated", n));

function cleanContract(mission: string) {
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
function gitContract(mission: string) {
  return {
    mission, version: "1.0", status: "AUTHORIZED", mode: "READ_ONLY", priority: "NORMAL",
    requires_engineering: false, authorized_paths: [],
    objectives: [{
      id: "GIT_BRANCH_INTEGRATION_1", goal: "Integrate the local source branch into the local target branch, fast-forward only, recorded C03.",
      done_when: ["The target branch tip equals the source tip via a local fast-forward."],
      authorization: { eligible: true, authorized: true },
      git_branch_integration: { target: "stable", source: "work", execute: true },
    }],
    verify: [{ capability: "Governed Git Branch Integration", evidence: "git-branch-integrated" }],
    definition_of_done: ["Local fast-forward integration performed and recorded."],
  };
}

function unitsFor(sb: string, mission: string) {
  const exec = readGen(sb, "patch-execution.json");
  const plan = readGen(sb, "mission-plan.json");
  const patchPlan = readGen(sb, "patch-plan.json");
  const report = genExists(sb, "mission-report.json") ? readGen(sb, "mission-report.json") : { checks: {} };
  const probe = (p: string) => { try { return typeof p === "string" && p.length > 0 && fs.statSync(path.join(sb, p)).size > 0; } catch { return false; } };
  const attribution = attributeObjectives(plan, patchPlan, exec, probe, () => ({}), () => false, {});
  const { map, complete } = eligibilityFromObjectives(Array.isArray(plan.objectives) ? plan.objectives : []);
  check(complete === true, `[${mission}] eligibility denominator complete`);
  const coverageOk = !!(report.checks && report.checks.objectiveCoverage === true);
  const units = fromExecution(exec, attribution, map, { runComplete: coverageOk });
  return units.map((u: Record<string, unknown>) => ({ ...u, id: `${mission}::${u.id as string}` }));
}

// Offline: no provider is passed to the adapter; FLEET_BRIDGE_MOCK=1; ODG_FLEET/ODG_VERBOSE cleared.
process.env.FLEET_BRIDGE_MOCK = "1";
delete process.env.ODG_FLEET;
delete process.env.ODG_VERBOSE;

console.log("AUTONOMY E2E — TS CONTINUOUS-LOOP EXECUTION SURFACE (B2)");
try {
  // ---- POSITIVE: real TS adapter runs a multi-objective AUTHORIZED mission, measured 3/3 ----------
  {
    const sb = plainSandbox(cleanContract("TSLOOP_CLEAN"));
    const adapter = new AutonomyRuntimeAdapter(sb); // no provider ⇒ never a live provider call
    const out: any = adapter.runPipeline("TSLOOP_CLEAN");
    check(!!out && out.pipelineOk === true, "1. TS adapter.runPipeline executes the mission (pipelineOk)");
    const report = readGen(sb, "mission-report.json");
    check(report.mission === "TSLOOP_CLEAN" && report.validated === true && report.status === "SUCCESS", "1b. runtime report validated SUCCESS for this mission");
    const life = readGen(sb, "mission-lifecycle.json");
    check(life.achieved === "ARCHIVED", "1c. read-only mission reaches ARCHIVED via the shared pipeline");
    const exec = readGen(sb, "patch-execution.json");
    const cw = exec.executed.filter((e: any) => String(e.objectiveId || e.action || "").startsWith("CLEAN_WORKSPACE_"));
    check(cw.length === 3 && cw.every((e: any) => e.status === "EXECUTED" && e.authoredBy === "ODG_CAPABILITY" && e.appliedBy === "ODG_EXECUTOR"), "1d. 3 objectives EXECUTED, ODG_CAPABILITY/ODG_EXECUTOR");
    // Ledger recorded in the sandbox (the loop's per-mission execution released it).
    const ledger = readGen(sb, "mission-ledger.json");
    const entries = Array.isArray(ledger) ? ledger : (ledger.entries || ledger.missions || []);
    check(entries.some((e: any) => (e.mission || e.missionId) === "TSLOOP_CLEAN" && e.proven === true), "1e. sandbox ledger records the mission (proven)");

    // Independent recompute — explicit denominator, no UNKNOWN/CONTRACT credited.
    const m: any = measureAutonomy(unitsFor(sb, "TSLOOP_CLEAN"));
    check(m.measurable === true && m.denominator === 3 && m.numerator === 3 && m.autonomyPercent === 100, "2. independent measure: 3/3 = 100% (TS surface)");
    check(m.categories[CATEGORY.ODG_EXECUTED_VERIFIED] === 3 && m.categories[CATEGORY.OPERATOR_OR_EXTERNAL] === 0, "2b. all three are ODG-executed+verified");
    check(exec.executed.some((e: any) => e.authoredBy === "UNKNOWN" || e.authoredBy === "CONTRACT") === false, "2c. no UNKNOWN/CONTRACT origin credited");
    console.log("  POSITIVE (TS surface):", JSON.stringify({ denominator: m.denominator, numerator: m.numerator, autonomyPercent: m.autonomyPercent, categories: m.categories, distinctions: m.distinctions }));
  }

  // ---- NEGATIVE (separate denominator): non-ff through the SAME adapter fails closed --------------
  {
    const sb = gitSandbox(gitContract("TSLOOP_NONFF"), true);
    const stableBefore = git(sb, ["rev-parse", "stable"]);
    const adapter = new AutonomyRuntimeAdapter(sb); // no provider; READ_ONLY ⇒ provider never required
    const out: any = adapter.runPipeline("TSLOOP_NONFF");
    check(!out || out.pipelineOk !== true, "3. TS adapter surfaces the non-ff failure (not pipelineOk)");
    check(git(sb, ["rev-parse", "stable"]) === stableBefore, "3b. target branch UNCHANGED (independent git proof, fail-closed)");
    if (genExists(sb, "mission-report.json")) check(readGen(sb, "mission-report.json").validated !== true, "3c. non-ff mission is not a validated success");
    if (genExists(sb, "patch-execution.json")) {
      const e = readGen(sb, "patch-execution.json").executed.find((x: any) => x.objectiveId === "GIT_BRANCH_INTEGRATION_1" || x.action === "GIT_BRANCH_INTEGRATION_1");
      check(!!e && e.status === "FAILED", "3d. non-ff objective recorded FAILED");
      const m: any = measureAutonomy(unitsFor(sb, "TSLOOP_NONFF"));
      check(m.measurable === true && m.denominator === 1 && m.numerator === 0 && m.categories[CATEGORY.BLOCKED_REFUSED_FAILED] === 1, "3e. measured as authorized-but-failed (0/1), never credited");
      console.log("  NEGATIVE (separate denominator):", JSON.stringify({ denominator: m.denominator, numerator: m.numerator, categories: m.categories }));
    }
  }
} finally {
  for (const sb of sandboxes) { try { fs.rmSync(sb, { recursive: true, force: true }); } catch { /* best-effort */ } }
}

console.log(failures === 0 ? "ALL PASS — TS CONTINUOUS-LOOP EXECUTION SURFACE (B2)" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
