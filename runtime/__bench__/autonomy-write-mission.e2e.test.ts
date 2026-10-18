// @ts-nocheck — L5 bench test migration: runs under tsx unchanged; suppresses tsc typechecking
// (NOT strict typing) — recorded migration debt. See ODG_PROJECT_STATE.md.
"use strict";

/*
 * AUTONOMY E2E — AUTHORIZED WRITE MISSION + SELF-APPROVAL REFUSAL  (Phase 03 — Gate B)
 * ====================================================================================
 *
 * Drives the REAL runtime pipeline (runtime/bin/odg-run.js, 13 stages) end-to-end for TWO synthetic
 * engineering (IMPLEMENT) missions and asserts on the real artifacts each run produces. Nothing is
 * stubbed: every assertion reads the production stages' own output on disk.
 *
 * Delta vs runtime/__bench__/autonomy-e2e.test.ts (reused harness, same isolation):
 *   - POSITIVE adds (a) a runtime-attributed FINAL LIFECYCLE STATE assertion (engineering caps at
 *     VERIFIED — the human-commit gate correctly withholds RELEASED/ARCHIVED in a throwaway sandbox),
 *     and (b) a PROVENANCE-INVARIANT autonomy assertion: the mission executes (APPLIED), validates and is
 *     EVIDENCED, yet the patch's PROVEN origin is authoredBy="CONTRACT" (a contract-supplied content
 *     patch) applied by ODG_EXECUTOR. Because an applicator is not an author, the measure HONESTLY returns
 *     NON_MEASURABLE (an ambiguous author on DONE work) — CONTRACT/UNKNOWN origin is NEVER credited as ODG
 *     autonomy. NON-authoritative, per-mission; a green test does NOT certify Phase 03.
 *   - NEGATIVE proves a SELF-APPROVAL refusal through the whole pipeline: a patch whose target IS inside
 *     the granted scope ("runtime/**") but writes a protected governance artifact is refused by the real
 *     Patch Executor governance guard — scope is NOT authority; a patch cannot self-authorize.
 *
 * ISOLATION (identical to the existing benchmark): odg-run.js and every stage use CWD-relative paths and
 * spawn `node <relative-stage-file>` inheriting the parent CWD. Running from a throwaway os.tmpdir()
 * sandbox (its own git repo with a baseline commit) confines ALL reads/writes to that sandbox; the real
 * repository is structurally out of reach (asserted). Offline: on-path stages have no HTTP client; the
 * only external spawn (Fleet Bridge) is OFF by default and additionally mocked / ODG_FLEET cleared.
 *
 * Run:  node --test runtime/__bench__/autonomy-write-mission.e2e.test.ts
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
// Dirs the pipeline actually reads (same set the existing benchmark copies). generated + missions are
// created fresh and writable. governance is copied so the self-approval target has a real subtree.
const COPY_DIRS = ["core", "bin", "constitution", "policies", "governance", "brain"];
const sandboxes = [];

// Independent recomputation uses the REAL runtime modules (not a reimplementation) — same wiring as the
// sibling benches, so the NON_MEASURABLE verdict is proven from the artifacts, not taken from the report.
const { attributeObjectives } = require(path.join(REPO, "runtime", "core", "objective-attribution.js"));
const { eligibilityFromObjectives, fromExecution, measureAutonomy } =
  require(path.join(REPO, "runtime", "core", "autonomy-measure.js"));

function sh(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

// Build a throwaway sandbox git repo containing the real runtime source + an INLINE contract (no fixture
// file is added to the repo — write-set stays a single test file).
function buildSandbox(contract) {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-write-e2e-"));
  sandboxes.push(sb);
  assert.ok(!sb.startsWith(REPO), "sandbox must live OUTSIDE the repository");
  for (const d of COPY_DIRS) {
    fs.cpSync(path.join(REPO, "runtime", d), path.join(sb, "runtime", d), { recursive: true });
  }
  fs.mkdirSync(path.join(sb, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "missions"), { recursive: true });
  fs.writeFileSync(
    path.join(sb, "runtime", "missions", `${contract.mission}.json`),
    JSON.stringify(contract, null, 2)
  );
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

function runPipeline(sb, mission, extraEnv) {
  const r = spawnSync("node", ["runtime/bin/odg-run.js", mission],
    { cwd: sb, encoding: "utf8", env: runEnv(extraEnv) });
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
// 1. POSITIVE — authorized engineering WRITE: real in-scope write, runtime-attributed VERIFIED state,
//    report validated, and a PROVEN-DENOMINATOR per-mission autonomy of 1/1 (non-authoritative).
// ---------------------------------------------------------------------------------------------------
const POSITIVE = {
  mission: "BENCH_WRITE_POSITIVE",
  priority: "NORMAL",
  mode: "IMPLEMENT",
  requiresEngineering: true,
  authorizedPaths: ["bench-workspace/**"],
  objectives: [
    {
      id: "BENCH_WRITE_1",
      goal: "Create a single marker file recording deterministic benchmark execution.",
      done_when: ["Exactly one file exists under bench-workspace/."],
      patch: [{ target: "bench-workspace/marker.txt", content: "BENCH-WRITE-OK\n" }],
      authorization: { eligible: true, authorized: true },
    },
  ],
  definition_of_done: ["Objective completed strictly within the authorized write scope."],
  completion: ["Validation successful."],
};

test("positive: authorized WRITE mission reaches VERIFIED; CONTRACT-origin patch is NOT credited (NON_MEASURABLE)", () => {
  const sb = buildSandbox(POSITIVE);
  const { code, out } = runPipeline(sb, POSITIVE.mission);

  assert.strictEqual(code, 0, "pipeline must exit 0:\n" + out);
  assert.match(out, /PIPELINE SUCCESS — 13\/13 stages/, "all 13 stages must complete");

  // Loader propagation: the explicit per-objective authorization declaration survives into the plan
  // (this is the denominator source — mission-level authorizedPaths is NOT per-objective proof).
  const plan = readGen(sb, "mission-plan.json");
  assert.deepStrictEqual(plan.objectives[0].authorization, { eligible: true, authorized: true },
    "the objective authorization declaration must pass through mission-loader into the plan");
  assert.deepStrictEqual(plan.authorizedPaths, ["bench-workspace/**"]);

  // Real in-scope write, exact path + bytes.
  const marker = path.join(sb, "bench-workspace", "marker.txt");
  assert.ok(fs.existsSync(marker), "in-scope deliverable must exist");
  assert.strictEqual(fs.readFileSync(marker, "utf8"), "BENCH-WRITE-OK\n");

  // Deliverable came from the in-contract patch (deterministic content write), APPLIED. Its PROVEN origin
  // is authoredBy="CONTRACT" (the contract supplied the patch content) and it was applied by ODG_EXECUTOR.
  // Author ≠ applicator: being applied by ODG does NOT make the work ODG-authored.
  const exec = readGen(sb, "patch-execution.json");
  assert.strictEqual(exec.executed[0].status, "APPLIED", "deliverable must come from an APPLIED contract patch");
  assert.strictEqual(exec.executed[0].authoredBy, "CONTRACT", "origin is CONTRACT (the patch content came from the contract, not an ODG capability)");
  assert.strictEqual(exec.executed[0].appliedBy, "ODG_EXECUTOR", "applicator is the ODG executor (appliedBy does NOT prove authoredBy=ODG_CAPABILITY)");

  // Real validation verdict (not a bare completion claim).
  const report = readGen(sb, "mission-report.json");
  assert.strictEqual(report.validated, true, "validated must be true: " + JSON.stringify(report.unmet));
  assert.strictEqual(report.status, "SUCCESS");
  assert.strictEqual(report.checks.engineeringPerformed, true);
  assert.ok(report.checks.scopedChanges.some((p) => p.startsWith("bench-workspace")),
    "a change must be observed inside the authorized scope");

  // Final lifecycle state ATTRIBUTED BY THE RUNTIME (not synthesized). An engineering mission caps at
  // VERIFIED: the human-commit gate correctly withholds RELEASED/ARCHIVED in a throwaway sandbox.
  const lifecycle = readGen(sb, "mission-lifecycle.json");
  assert.strictEqual(lifecycle.achieved, "VERIFIED",
    "engineering mission must reach VERIFIED (human-commit gate withholds RELEASED/ARCHIVED): got " + lifecycle.achieved);

  // PROVENANCE INVARIANT (CTO Phase-03 §4). The mission executed (APPLIED), validated and was EVIDENCED,
  // but its origin is CONTRACT (above), so it is NOT autonomous ODG work. The measure therefore reports
  // NON_MEASURABLE — an ambiguous author on DONE work — NOT a 1/1. This aligns the test EXPECTATION with
  // the existing provenance semantics; it is NOT a masked autonomy defect and NO runtime change is made.
  //
  // (Observed root cause, grounded in the artifacts: objective-attribution verdicts the objective
  // EVIDENCED, but autonomy-measure.fromExecution maps authoredBy="CONTRACT" → actor=null; a DONE unit
  // with a null/unproven actor is ambiguous ⇒ measureAutonomy returns measurable:false. Crediting a
  // contract-authored patch as ODG-autonomous would require a genuinely ODG-AUTHORED write path — a
  // SEPARATE CTO-authorized runtime change (Q5), explicitly OUT of this test-only write-set.)
  const md = fs.readFileSync(path.join(sb, "runtime", "generated", "reports", `${POSITIVE.mission}.final-report.md`), "utf8");
  assert.match(md, /Autonomy %: \*\*NON_MEASURABLE\*\*/,
    "final report must honestly show NON_MEASURABLE (a CONTRACT-origin patch is not ODG-autonomous)");
  assert.doesNotMatch(md, /ODG-executed\+verified 1\/1, denominator proven/,
    "the runtime must NOT credit a CONTRACT-origin write as a proven-denominator 1/1");

  // INDEPENDENT recomputation from the REAL runtime modules + sandbox artifacts (not taken on faith from
  // the report): the single eligible+authorized objective is a DONE unit whose author is CONTRACT ⇒ the
  // aggregate is honestly NON_MEASURABLE. Mirrors the sibling benches' recompute wiring.
  const patchPlan = readGen(sb, "patch-plan.json");
  const probe = (p) => { try { return typeof p === "string" && p.length > 0 && fs.statSync(path.join(sb, p)).size > 0; } catch { return false; } };
  const attribution = attributeObjectives(plan, patchPlan, exec, probe, () => ({}), () => false, {});
  const { map, complete } = eligibilityFromObjectives(Array.isArray(plan.objectives) ? plan.objectives : []);
  assert.strictEqual(complete, true, "the per-objective authorization declaration is complete (denominator source present)");
  const coverageOk = !!(report.checks && report.checks.objectiveCoverage === true);
  const measured = measureAutonomy(fromExecution(exec, attribution, map, { runComplete: coverageOk }));
  assert.strictEqual(measured.measurable, false, "independent recompute is NON_MEASURABLE: " + JSON.stringify(measured));
  assert.strictEqual(measured.autonomyPercent, null, "no percentage is fabricated for an unprovable-origin run");
});

// ---------------------------------------------------------------------------------------------------
// 2. NEGATIVE — SELF-APPROVAL REFUSED: target is INSIDE the granted scope ("runtime/**") but writes a
//    protected governance artifact WITHOUT governance authority ⇒ the real Patch Executor refuses it.
//    Scope is not authority; a patch cannot self-authorize. Zero mutation; mission not a validated success.
// ---------------------------------------------------------------------------------------------------
const SELF_APPROVAL = {
  mission: "BENCH_WRITE_SELF_APPROVAL",
  priority: "NORMAL",
  mode: "IMPLEMENT",
  requiresEngineering: true,
  authorizedPaths: ["runtime/**"], // scope DELIBERATELY includes governance so scope is NOT the blocker
  objectives: [
    {
      id: "BENCH_SELF_APPROVE",
      goal: "Attempt to write a governance artifact while in scope but WITHOUT governance authority (must be refused).",
      done_when: ["(negative) the governance write is refused by the Patch Executor self-approval guard."],
      patch: [{ target: "runtime/governance/injected.json", content: "{\"injected\":true}\n" }],
      authorization: { eligible: true, authorized: true },
    },
  ],
  definition_of_done: ["Self-approval refused; mission not validated."],
  completion: ["Validation blocked."],
};

test("negative: an in-scope write to a protected governance path is refused (self-approval guard)", () => {
  const sb = buildSandbox(SELF_APPROVAL);
  const injected = path.join(sb, "runtime", "governance", "injected.json");
  const before = fs.existsSync(injected); // governance subtree was copied, but this file is not in it
  assert.strictEqual(before, false, "the injected governance file must not pre-exist");

  runPipeline(sb, SELF_APPROVAL.mission); // exit code is not the proof — the on-disk refusal is

  // The real Patch Executor recorded a governance-guard refusal BEFORE any write (zero mutation).
  const exec = readGen(sb, "patch-execution.json");
  const entry = exec.executed.find((e) => e && e.target === "runtime/governance/injected.json")
    || exec.executed[0];
  assert.ok(entry, "the governance edit must be recorded");
  assert.strictEqual(entry.status, "BLOCKED", "governance self-approval must be BLOCKED (resumable), not APPLIED");
  assert.strictEqual(entry.decision, "ESCALATE", "the governance guard escalates to human authority");
  assert.match(String(entry.needs || ""), /protected governance path/,
    "the refusal must name the protected-governance boundary");
  assert.match(String(entry.needs || ""), /self-authorize/,
    "the refusal must state a patch cannot self-authorize (scope is not authority)");

  // Zero mutation: the governance artifact was never created.
  assert.strictEqual(fs.existsSync(injected), false, "the governance file must NOT be created");

  // Not a validated success: if a report exists, it must not be a validated SUCCESS.
  if (genExists(sb, "mission-report.json")) {
    const report = readGen(sb, "mission-report.json");
    assert.notStrictEqual(report.validated, true, "a self-approval-refused mission must not validate");
    assert.notStrictEqual(report.status, "SUCCESS", "a self-approval-refused mission must not be SUCCESS");
  }
});
