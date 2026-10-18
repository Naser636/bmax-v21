// @ts-nocheck — L5 bench test migration: runs under tsx unchanged; suppresses tsc typechecking
// (NOT strict typing) — recorded migration debt. See ODG_PROJECT_STATE.md.
"use strict";

/*
 * AUTONOMY END-TO-END BENCHMARK  (AUTONOMY-E2E-BENCHMARK — Gate B)
 * ===============================================================
 *
 * Exercises the REAL runtime pipeline (runtime/bin/odg-run.js and its 13 stages) end-to-end for an
 * authorized engineering mission, and asserts on the real evidence artifacts it produces. Nothing here
 * simulates or stubs a stage: every assertion is grounded in the output of the production stage code.
 *
 * ISOLATION (why this never touches the shared repo).
 *   odg-run.js and every stage resolve their inputs/outputs with CWD-relative paths
 *   (pipeline-builder.js reads "runtime/core/<stage>.js" and writes "runtime/generated/..."; odg-run.js
 *   spawns `node <relative-stage-file>` which inherits the parent CWD; checkpoint-engine / scope-observer
 *   call git in the CWD). Running the pipeline from a throwaway sandbox directory therefore confines
 *   ALL reads and writes to that sandbox. The sandbox lives under os.tmpdir() — never under the repo —
 *   and the scope/engineering gate needs a git working tree, so each sandbox is its own throwaway git
 *   repo with a baseline commit. The real repository is structurally out of reach.
 *
 * OFFLINE / NO PROVIDER.
 *   The on-path stages contain no HTTP client (verified: zero fetch/http/axios requires). The only
 *   external-agent spawn is Fleet Bridge, OFF by default; runs here additionally clear ODG_FLEET and set
 *   FLEET_BRIDGE_MOCK=1. The deliverable is produced by the mission's OWN in-contract patch (deterministic
 *   content write by patch-executor), not by any provider — asserted as observable evidence below.
 *
 * Run:  node --test runtime/__bench__/autonomy-e2e.test.ts
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawn } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const FIXTURES = path.join(__dirname, "fixtures");
// Dirs the pipeline actually reads (confirmed by tracing every stage). Copied read-only into each
// sandbox; runtime/generated + runtime/missions are created fresh and writable.
const COPY_DIRS = ["core", "bin", "constitution", "policies", "governance", "brain"];
const sandboxes = [];

function sh(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

// Build a throwaway sandbox git repo containing the real runtime source + a fixture contract.
function buildSandbox(contractName) {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-e2e-"));
  sandboxes.push(sb);
  assert.ok(!sb.startsWith(REPO), "sandbox must live outside the repository");
  for (const d of COPY_DIRS) {
    fs.cpSync(path.join(REPO, "runtime", d), path.join(sb, "runtime", d), { recursive: true });
  }
  fs.mkdirSync(path.join(sb, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "missions"), { recursive: true });
  if (contractName) {
    fs.copyFileSync(
      path.join(FIXTURES, `${contractName}.json`),
      path.join(sb, "runtime", "missions", `${contractName}.json`)
    );
  }
  fs.writeFileSync(path.join(sb, ".gitignore"), "runtime/generated/\nnode_modules/\n");
  sh("git", ["init", "-q"], sb);
  sh("git", ["-c", "user.email=bench@local", "-c", "user.name=bench", "add", "-A"], sb);
  sh("git", ["-c", "user.email=bench@local", "-c", "user.name=bench", "commit", "-q", "-m", "baseline"], sb);
  return sb;
}

function runEnv(extra) {
  const env = { ...process.env, FLEET_BRIDGE_MOCK: "1", ...(extra || {}) };
  delete env.ODG_FLEET;
  delete env.ODG_VERBOSE;
  return env;
}

// Run odg-run.js to completion inside the sandbox. Returns { code, out }.
function runPipeline(sb, mission, extraEnv) {
  const r = require("child_process").spawnSync(
    "node",
    ["runtime/bin/odg-run.js", mission],
    { cwd: sb, encoding: "utf8", env: runEnv(extraEnv) }
  );
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

function readGen(sb, name) {
  return JSON.parse(fs.readFileSync(path.join(sb, "runtime", "generated", name), "utf8"));
}
function genExists(sb, name) {
  return fs.existsSync(path.join(sb, "runtime", "generated", name));
}

test.after(() => {
  for (const sb of sandboxes) {
    try { fs.rmSync(sb, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

// ---------------------------------------------------------------------------------------------------
// 1. POSITIVE — objective understood, planned, executed in scope, really validated, COMPLETE.
// ---------------------------------------------------------------------------------------------------
test("positive: authorized engineering mission runs E2E and validates on real evidence", () => {
  const sb = buildSandbox("BENCH_E2E_POSITIVE");
  const { code, out } = runPipeline(sb, "BENCH_E2E_POSITIVE");

  assert.strictEqual(code, 0, "pipeline must exit 0:\n" + out);
  assert.match(out, /PIPELINE SUCCESS — 13\/13 stages/, "all 13 stages must complete");

  // Objective understood + planned: plan carries the contract's objective and authorized scope.
  const plan = readGen(sb, "mission-plan.json");
  assert.strictEqual(plan.objectives.length, 1);
  assert.deepStrictEqual(plan.authorizedPaths, ["bench-workspace/**"]);

  // Real validation verdict (not a bare completion claim).
  const report = readGen(sb, "mission-report.json");
  assert.strictEqual(report.validated, true, "validated must be true: " + JSON.stringify(report.unmet));
  assert.strictEqual(report.status, "SUCCESS");
  assert.strictEqual(report.checks.engineeringPerformed, true);
  assert.ok(report.checks.scopedChanges.some((p) => p.startsWith("bench-workspace")),
    "a change must be observed inside the authorized scope");

  // Write limited to the authorized scope: the marker exists with the contract's bytes.
  const marker = path.join(sb, "bench-workspace", "marker.txt");
  assert.ok(fs.existsSync(marker), "in-scope deliverable must exist");
  assert.strictEqual(fs.readFileSync(marker, "utf8"), "BENCH-OK\n");

  // Final report + COMPLETE checkpoint.
  assert.ok(fs.existsSync(path.join(sb, "runtime", "generated", "reports", "BENCH_E2E_POSITIVE.final-report.md")),
    "final report must be generated");
  const cp = readGen(sb, "pipeline-checkpoint.json");
  assert.strictEqual(cp.status, "COMPLETE");
  assert.strictEqual(cp.progress, "13/13");
});

// ---------------------------------------------------------------------------------------------------
// 2. NO PROVIDER / NO NETWORK — observable proof, not merely an env flag.
// ---------------------------------------------------------------------------------------------------
test("no provider/network: deliverable comes from the contract patch; no provider or fleet artifact", () => {
  const sb = buildSandbox("BENCH_E2E_POSITIVE");
  const { code } = runPipeline(sb, "BENCH_E2E_POSITIVE");
  assert.strictEqual(code, 0);

  // Observable: the deliverable was produced by the in-contract patch (deterministic content write),
  // NOT by any provider/capability/fleet route.
  const exec = readGen(sb, "patch-execution.json");
  assert.strictEqual(exec.executed.length, 1);
  assert.strictEqual(exec.executed[0].status, "APPLIED", "deliverable must come from an APPLIED contract patch");
  assert.strictEqual(exec.executed[0].files[0].mode, "content");

  // No provider was authorized and no fleet (external agent) artifact was produced.
  assert.ok(!genExists(sb, "provider-authorization.json"), "no provider authorization must be written");
  const genFiles = fs.readdirSync(path.join(sb, "runtime", "generated"));
  assert.ok(!genFiles.some((f) => f.startsWith("fleet-")), "no fleet artifact: " + genFiles.join(","));
});

// ---------------------------------------------------------------------------------------------------
// 3. OUT-OF-SCOPE WRITE — refused; mission not validated; zero mutation.
// ---------------------------------------------------------------------------------------------------
test("out-of-scope write is refused and the mission is not validated", () => {
  const sb = buildSandbox("BENCH_E2E_OUT_OF_SCOPE");
  const { code } = runPipeline(sb, "BENCH_E2E_OUT_OF_SCOPE");

  assert.notStrictEqual(code, 0, "pipeline must halt with a non-zero exit");
  const exec = readGen(sb, "patch-execution.json");
  const failed = exec.executed.find((e) => e.status === "FAILED");
  assert.ok(failed, "the out-of-scope edit must be recorded FAILED");
  assert.match(failed.error, /outside authorized_paths/, "failure must name the scope violation");

  const report = readGen(sb, "mission-report.json");
  assert.strictEqual(report.validated, false, "an out-of-scope mission must not validate");

  // Zero mutation: the executor refuses before any write.
  assert.ok(!fs.existsSync(path.join(sb, "escape-zone", "evil.txt")), "the out-of-scope file must NOT exist");
});

// ---------------------------------------------------------------------------------------------------
// 4. MANDATORY STAGE OMITTED — explicit HALT, no false success.
//    Contract-On-Demand is disabled so a missing contract is a genuine, unrecoverable blocker.
// ---------------------------------------------------------------------------------------------------
test("a mandatory stage that cannot produce its output halts the pipeline (no false success)", () => {
  const sb = buildSandbox(null); // no contract placed
  const { code, out } = runPipeline(sb, "NO_SUCH_MISSION", { ODG_CONTRACT_ON_DEMAND: "0" });

  assert.notStrictEqual(code, 0, "missing mandatory stage output must halt the pipeline");
  assert.match(out, /BLOCKED: no mission contract/, "Mission Loader must block explicitly");

  // Downstream stages (including Validation) never ran ⇒ no verdict artifact, so nothing can be
  // mistaken for success.
  assert.ok(!genExists(sb, "mission-report.json"), "no validation verdict must be produced");
  assert.ok(!genExists(sb, "patch-execution.json"));

  const cp = readGen(sb, "pipeline-checkpoint.json");
  assert.strictEqual(cp.status, "FAILED");
  const failedStage = cp.stages.find((s) => s.status === "FAILED");
  assert.strictEqual(failedStage && failedStage.name, "Mission Loader");
});

// ---------------------------------------------------------------------------------------------------
// 5. RESUME AFTER SIGKILL — a real interruption; already-DONE stages are not re-run.
//    A genuine SIGKILL (uncatchable) is sent mid-pipeline; the next run resumes past the proven prefix.
//    If the run cannot be interrupted mid-pipeline, the test FAILS loudly rather than faking resume.
// ---------------------------------------------------------------------------------------------------
test("resume after SIGKILL skips already-completed stages and still completes", async () => {
  const sb = buildSandbox("BENCH_E2E_POSITIVE");
  const cpPath = path.join(sb, "runtime", "generated", "pipeline-checkpoint.json");

  const child = spawn("node", ["runtime/bin/odg-run.js", "BENCH_E2E_POSITIVE"],
    { cwd: sb, env: runEnv(), stdio: "ignore" });

  // Poll the durable checkpoint; SIGKILL once we are mid-pipeline (>=2 done, <13).
  const deadline = Date.now() + 15000;
  let completedAtKill = -1;
  while (Date.now() < deadline) {
    let n = 0;
    try { n = JSON.parse(fs.readFileSync(cpPath, "utf8")).completed.length; } catch { /* not yet */ }
    if (n >= 2 && n < 13) { completedAtKill = n; break; }
    if (n >= 13) break; // ran to completion before we could interrupt
    await new Promise((r) => setTimeout(r, 15));
  }
  child.kill("SIGKILL");
  await new Promise((r) => child.on("exit", r));

  assert.ok(completedAtKill >= 2 && completedAtKill < 13,
    `could not interrupt mid-pipeline (completed=${completedAtKill}); resume not safely testable`);

  // Post-kill: the durable checkpoint has a proven-DONE prefix and is not COMPLETE.
  const after = JSON.parse(fs.readFileSync(cpPath, "utf8"));
  assert.notStrictEqual(after.status, "COMPLETE");
  assert.ok(after.completed.length >= 2 && after.completed.length < 13);

  // Resume run: must announce RESUMING and finish without re-executing the proven prefix.
  const resumed = runPipeline(sb, "BENCH_E2E_POSITIVE");
  assert.strictEqual(resumed.code, 0, "resume must succeed:\n" + resumed.out);
  assert.match(resumed.out, /RESUMING : \d+\/13 stage\(s\) already complete/);
  assert.match(resumed.out, /PIPELINE SUCCESS — 13\/13 stages/);

  const cp = JSON.parse(fs.readFileSync(cpPath, "utf8"));
  assert.strictEqual(cp.status, "COMPLETE");
  assert.ok(fs.existsSync(path.join(sb, "bench-workspace", "marker.txt")));
});

// ---------------------------------------------------------------------------------------------------
// 6. RC-1 EFFECT GATE (real production module) — a stage that exits 0 without its declared artifact
//    can never be marked DONE. Exercises the real runtime/core/stage-effect.js used by odg-run.js.
// ---------------------------------------------------------------------------------------------------
test("RC-1: real stage-effect gate rejects a declared stage with no artifact", () => {
  const stageEffect = require(path.join(REPO, "runtime", "core", "stage-effect.js"));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-rc1-"));
  sandboxes.push(dir);

  // Declared stage, artifact absent ⇒ NOT ok (would HALT in odg-run.js).
  assert.strictEqual(stageEffect.stageEffectOk("Mission Loader", dir), false);
  // Declared stage, empty artifact ⇒ still NOT ok (non-empty required).
  fs.writeFileSync(path.join(dir, "mission-plan.json"), "");
  assert.strictEqual(stageEffect.stageEffectOk("Mission Loader", dir), false);
  // Declared stage, non-empty artifact ⇒ ok.
  fs.writeFileSync(path.join(dir, "mission-plan.json"), "{}");
  assert.strictEqual(stageEffect.stageEffectOk("Mission Loader", dir), true);
  // Undeclared/non-blocking stage ⇒ unconstrained (historical exit-0 ⇒ DONE preserved).
  assert.strictEqual(stageEffect.stageEffectOk("Final Report", dir), true);
});
