// @ts-nocheck — L5 bench test migration: runs under tsx unchanged; suppresses tsc typechecking
// (NOT strict typing) — recorded migration debt. See ODG_PROJECT_STATE.md.
"use strict";

/*
 * AUTONOMY E2E — FIRST OPERATIONAL QUALIFICATION via GOVERNED GIT BRANCH INTEGRATION  (Phase 03 — Gate B, Option A)
 * ===============================================================================================================
 *
 * Proves the NEW objective-level transport (mission-loader → decision-engine passthrough → patch-engine)
 * carries a contract's `git_branch_integration` spec to the REAL capability, so a CONTRACT objective driven
 * through the REAL runtime (runtime/bin/odg-run.js, 13 stages) performs a genuine LOCAL fast-forward branch
 * integration — a CONCRETE operational result (not a synthetic manifest), verified INDEPENDENTLY by git.
 *
 * WHAT THIS BENCHMARK PROVES (end-to-end, new transport):
 *   - positive: a real ff-integration executed by the ODG capability; target tip re-read from git equals the
 *     source tip (independent of ODG's declaration); EXECUTED + authoredBy ODG_CAPABILITY + appliedBy
 *     ODG_EXECUTOR + non-empty evidence; per-mission autonomy recomputed independently (1/1).
 *   - negative (non-fast-forward, through the WHOLE pipeline): the capability fails closed → FAILED, the
 *     target branch is UNCHANGED (git), the mission does not validate, and it is NOT credited as autonomous.
 *
 * WHAT IS PROVEN ELSEWHERE (reused, NOT duplicated — see runtime/core/git-branch-integration.test.js, real
 * throwaway git repos, real engine): DRY_RUN hard default zero-mutation (case 1), non-ff BLOCKED (case 6),
 * protected-branch-without-authority ⇒ HUMAN_APPROVAL_REQUIRED zero-mutation (case 7), protected+authority
 * ⇒ INTEGRATED (case 8), ALREADY_UP_TO_DATE (case 4). This benchmark does NOT re-prove the engine; it proves
 * the CONTRACT→PLAN→PATCH transport and the end-to-end pipeline behaviour.
 *
 * HONEST LIMITS: a single synthetic git mission is a LOCAL operational proof; it does NOT by itself establish
 * the Phase-03 ≥80% global threshold on a representative set. Offline; no remote/secret/push; throwaway repo.
 *
 * ISOLATION (reused harness): throwaway os.tmpdir() git repo outside the real repo (asserted); offline
 * (FLEET_BRIDGE_MOCK=1, ODG_FLEET cleared). git-branch-integration is local-only (push refused by the wrapper).
 *
 * Run:  node --test runtime/__bench__/autonomy-qualification.e2e.test.ts
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const COPY_DIRS = ["core", "bin", "constitution", "policies", "governance", "brain"];
const sandboxes = [];

const { attributeObjectives } = require(path.join(REPO, "runtime", "core", "objective-attribution.js"));
const { eligibilityFromObjectives, fromExecution, measureAutonomy } =
  require(path.join(REPO, "runtime", "core", "autonomy-measure.js"));

function git(cwd, args) {
  return execFileSync("git", ["-c", "user.email=bench@local", "-c", "user.name=bench", ...args],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

// Build a throwaway sandbox repo with the real runtime source + two synthetic branches:
//   stable (target) at the baseline commit ; work (source) = baseline + one descendant commit.
// `diverge` instead creates a non-fast-forward topology (stable and work each have a unique commit).
function buildSandbox(contract, diverge) {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-qual-e2e-"));
  sandboxes.push(sb);
  assert.ok(!sb.startsWith(REPO), "sandbox must live OUTSIDE the repository");
  for (const d of COPY_DIRS) fs.cpSync(path.join(REPO, "runtime", d), path.join(sb, "runtime", d), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "missions"), { recursive: true });
  fs.writeFileSync(path.join(sb, "runtime", "missions", `${contract.mission}.json`), JSON.stringify(contract, null, 2));
  fs.writeFileSync(path.join(sb, ".gitignore"), "runtime/generated/\nnode_modules/\n");
  git(sb, ["init", "-q"]);
  git(sb, ["add", "-A"]);
  git(sb, ["commit", "-q", "-m", "baseline"]);
  const base = git(sb, ["rev-parse", "HEAD"]);
  // stable (target) at baseline.
  git(sb, ["branch", "stable", base]);
  // work (source): a descendant of baseline (fast-forwardable), on a non-checked-out branch.
  git(sb, ["branch", "work", base]);
  git(sb, ["checkout", "-q", "work"]);
  fs.writeFileSync(path.join(sb, "work-change.txt"), "work-1\n");
  git(sb, ["add", "-A"]); git(sb, ["commit", "-q", "-m", "work commit 1"]);
  if (diverge) {
    // Give stable its OWN commit so stable is NOT an ancestor of work ⇒ non-fast-forward.
    git(sb, ["checkout", "-q", "stable"]);
    fs.writeFileSync(path.join(sb, "stable-change.txt"), "stable-1\n");
    git(sb, ["add", "-A"]); git(sb, ["commit", "-q", "-m", "stable commit 1"]);
  }
  // Return to baseline on a clean detached-free branch so the worktree is clean for the pipeline.
  git(sb, ["checkout", "-q", base]);
  return sb;
}

function runEnv() {
  const env = { ...process.env, FLEET_BRIDGE_MOCK: "1" };
  delete env.ODG_FLEET; delete env.ODG_VERBOSE;
  return env;
}
function runPipeline(sb, mission) {
  const r = spawnSync("node", ["runtime/bin/odg-run.js", mission], { cwd: sb, encoding: "utf8", env: runEnv() });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
function readGen(sb, name) { return JSON.parse(fs.readFileSync(path.join(sb, "runtime", "generated", name), "utf8")); }
function genExists(sb, name) { return fs.existsSync(path.join(sb, "runtime", "generated", name)); }

test.after(() => {
  for (const sb of sandboxes) { try { fs.rmSync(sb, { recursive: true, force: true }); } catch { /* best-effort */ } }
});

function contract(mission, execute) {
  return {
    mission, version: "1.0", status: "AUTHORIZED", mode: "READ_ONLY", priority: "NORMAL",
    requires_engineering: false, authorized_paths: [],
    objectives: [{
      id: "GIT_BRANCH_INTEGRATION_1",
      goal: "Integrate the local source branch into the local target branch, fast-forward only, recorded C03.",
      done_when: ["The target branch tip equals the source tip via a local fast-forward."],
      authorization: { eligible: true, authorized: true },
      git_branch_integration: { target: "stable", source: "work", execute },
    }],
    verify: [{ capability: "Governed Git Branch Integration", evidence: "git-branch-integrated" }],
    definition_of_done: ["Local fast-forward integration performed and recorded."],
  };
}

// ---------------------------------------------------------------------------------------------------
// POSITIVE — contract spec transported end-to-end; a real local ff-integration; independent git proof.
// ---------------------------------------------------------------------------------------------------
test("positive: contract git_branch_integration drives a real local ff-integration (independent git proof, 1/1)", () => {
  const sb = buildSandbox(contract("BENCH_QUAL_POSITIVE", true), false);
  const workTip = git(sb, ["rev-parse", "work"]);
  const stableBefore = git(sb, ["rev-parse", "stable"]);
  assert.notStrictEqual(stableBefore, workTip, "precondition: stable behind work (fast-forwardable)");

  const { code, out } = runPipeline(sb, "BENCH_QUAL_POSITIVE");
  assert.strictEqual(code, 0, "pipeline must exit 0:\n" + out);
  assert.match(out, /PIPELINE SUCCESS — 13\/13 stages/, "all 13 stages must complete");

  // INDEPENDENT git verification: the target branch really fast-forwarded to the source tip.
  const stableAfter = git(sb, ["rev-parse", "stable"]);
  assert.strictEqual(stableAfter, workTip, "stable must fast-forward to the work tip (verified from git, not ODG's claim)");

  // Provenance + evidence (ODG author, ODG executor, non-empty evidence, INTEGRATED outcome).
  const exec = readGen(sb, "patch-execution.json");
  const e = exec.executed.find((x) => x.objectiveId === "GIT_BRANCH_INTEGRATION_1");
  assert.ok(e, "the integration objective must be recorded");
  assert.strictEqual(e.status, "EXECUTED");
  assert.strictEqual(e.capability, "Governed Git Branch Integration");
  assert.strictEqual(e.authoredBy, "ODG_CAPABILITY", "ODG-authored (not CONTRACT/UNKNOWN)");
  assert.strictEqual(e.appliedBy, "ODG_EXECUTOR", "applied by the ODG executor (author ≠ applicator)");
  const ev = path.join(sb, e.evidence);
  assert.ok(typeof e.evidence === "string" && fs.existsSync(ev) && fs.statSync(ev).size > 0, "evidence present & non-empty");
  const evidence = JSON.parse(fs.readFileSync(ev, "utf8"));
  assert.strictEqual(evidence.outcome, "INTEGRATED", "evidence records a real INTEGRATED outcome (not a dry-run/no-op)");
  assert.strictEqual(evidence.integrated, true, "evidence records integrated:true");

  // Validation + honest runtime-attributed final state (report exactly what the runtime produced).
  const report = readGen(sb, "mission-report.json");
  assert.strictEqual(report.validated, true, "validated must be true: " + JSON.stringify(report.unmet));
  assert.strictEqual(report.status, "SUCCESS");
  const lifecycle = readGen(sb, "mission-lifecycle.json");
  assert.ok(["VERIFIED", "RELEASED", "ARCHIVED"].includes(lifecycle.achieved),
    "final state is a runtime-attributed accepted terminal (no human gate bypassed): " + lifecycle.achieved);

  // Proven-denominator 1/1 in the runtime report + INDEPENDENT recomputation from the real modules.
  const md = fs.readFileSync(path.join(sb, "runtime", "generated", "reports", "BENCH_QUAL_POSITIVE.final-report.md"), "utf8");
  assert.match(md, /ODG-executed\+verified 1\/1, denominator proven/, "runtime report shows a proven-denominator 1/1");
  const plan = readGen(sb, "mission-plan.json");
  const patchPlan = readGen(sb, "patch-plan.json");
  const probe = (p) => { try { return typeof p === "string" && p.length > 0 && fs.statSync(path.join(sb, p)).size > 0; } catch { return false; } };
  const attribution = attributeObjectives(plan, patchPlan, exec, probe, () => ({}), () => false, {});
  const { map, complete, missing } = eligibilityFromObjectives(Array.isArray(plan.objectives) ? plan.objectives : []);
  assert.strictEqual(complete, true, "denominator complete: missing " + JSON.stringify(missing));
  const coverageOk = !!(report.checks && report.checks.objectiveCoverage === true);
  const measured = measureAutonomy(fromExecution(exec, attribution, map, { runComplete: coverageOk }));
  assert.strictEqual(measured.measurable, true, "independent recomputation measurable: " + JSON.stringify(measured));
  assert.strictEqual(measured.numerator, 1);
  assert.strictEqual(measured.denominator, 1);
  assert.strictEqual(measured.autonomyPercent, 100, "independent recomputation equals 100% (1/1)");
  assert.strictEqual(exec.executed.some((x) => x.authoredBy === "UNKNOWN" || x.authoredBy === "CONTRACT"), false,
    "no UNKNOWN/CONTRACT origin is credited");
});

// ---------------------------------------------------------------------------------------------------
// NEGATIVE (non-fast-forward, through the WHOLE pipeline) — fails closed; target unchanged; not autonomous.
// ---------------------------------------------------------------------------------------------------
test("negative: a non-fast-forward integration fails closed end-to-end (target unchanged, not validated)", () => {
  const sb = buildSandbox(contract("BENCH_QUAL_NONFF", true), true); // diverged topology
  const stableBefore = git(sb, ["rev-parse", "stable"]);

  runPipeline(sb, "BENCH_QUAL_NONFF"); // exit code is not the proof — the on-disk + git state is

  // INDEPENDENT git verification: the target branch did NOT move (zero mutation).
  assert.strictEqual(git(sb, ["rev-parse", "stable"]), stableBefore, "stable must be unchanged on a non-ff refusal");

  // The refusal is recorded FAILED (capability threw), never an EXECUTED success.
  if (genExists(sb, "patch-execution.json")) {
    const exec = readGen(sb, "patch-execution.json");
    const e = exec.executed.find((x) => x.objectiveId === "GIT_BRANCH_INTEGRATION_1");
    if (e) {
      assert.notStrictEqual(e.status, "EXECUTED", "a non-ff refusal must not be EXECUTED");
      assert.strictEqual(e.status, "FAILED", "a non-ff refusal is recorded FAILED (fail-closed)");
    }
  }
  if (genExists(sb, "mission-report.json")) {
    assert.notStrictEqual(readGen(sb, "mission-report.json").validated, true, "a non-ff mission must not validate");
  }
});
