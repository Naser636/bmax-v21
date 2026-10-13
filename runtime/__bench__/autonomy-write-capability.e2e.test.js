"use strict";

/*
 * AUTONOMY E2E — ODG-FORMULATED IN-SCOPE WRITE  (Phase 03 — Gate B)
 * ================================================================
 *
 * Drives the REAL runtime pipeline (runtime/bin/odg-run.js, 13 stages) for an engineering mission whose
 * objective resolves to the new ODG capability "ODG Synthetic Deliverable" (capability-executors.js).
 * That capability FORMULATES deterministic content itself from authorized plan data and writes ONE file
 * strictly inside the mission's authorized_paths, after PRE-WRITE confinement (traversal + symlink
 * defense). This is a genuine ODG-authored, in-scope WRITE — not a contract-supplied patch.
 *
 * PROVES (separately): ODG provenance (authoredBy ODG_CAPABILITY), distinct applicator (ODG_EXECUTOR),
 * a real in-scope deliverable, a non-empty evidence artifact, the runtime-attributed final state
 * (engineering caps at VERIFIED — human-commit gate withholds RELEASED/ARCHIVED, NOT bypassed), and a
 * per-mission autonomy of 1/1 cross-checked by an INDEPENDENT recomputation.
 *
 * NEGATIVE: an invalid (empty) authorized scope makes the capability REFUSE before any write — the
 * mission does not validate and no deliverable appears. The self-approval governance refusal is NOT
 * duplicated here; it remains proven by runtime/__bench__/autonomy-write-mission.e2e.test.js.
 *
 * NOT a global-autonomy-rate claim and NOT a Phase-03 closure.
 *
 * ISOLATION (reused harness): throwaway os.tmpdir() git repo outside the real repo (asserted), offline
 * (FLEET_BRIDGE_MOCK=1, ODG_FLEET cleared); the capability uses only fs + a pure scope check (no network).
 *
 * Run:  node --test runtime/__bench__/autonomy-write-capability.e2e.test.js
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

function sh(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

function buildSandbox(contract) {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-wcap-e2e-"));
  sandboxes.push(sb);
  assert.ok(!sb.startsWith(REPO), "sandbox must live OUTSIDE the repository");
  for (const d of COPY_DIRS) {
    fs.cpSync(path.join(REPO, "runtime", d), path.join(sb, "runtime", d), { recursive: true });
  }
  fs.mkdirSync(path.join(sb, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "missions"), { recursive: true });
  fs.writeFileSync(path.join(sb, "runtime", "missions", `${contract.mission}.json`), JSON.stringify(contract, null, 2));
  fs.writeFileSync(path.join(sb, ".gitignore"), "runtime/generated/\nnode_modules/\n");
  sh("git", ["init", "-q"], sb);
  sh("git", ["-c", "user.email=bench@local", "-c", "user.name=bench", "add", "-A"], sb);
  sh("git", ["-c", "user.email=bench@local", "-c", "user.name=bench", "commit", "-q", "-m", "baseline"], sb);
  return sb;
}

function runEnv() {
  const env = { ...process.env, FLEET_BRIDGE_MOCK: "1" };
  delete env.ODG_FLEET;
  delete env.ODG_VERBOSE;
  return env;
}
function runPipeline(sb, mission) {
  const r = spawnSync("node", ["runtime/bin/odg-run.js", mission], { cwd: sb, encoding: "utf8", env: runEnv() });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
function readGen(sb, name) { return JSON.parse(fs.readFileSync(path.join(sb, "runtime", "generated", name), "utf8")); }
function genExists(sb, name) { return fs.existsSync(path.join(sb, "runtime", "generated", name)); }

test.after(() => {
  for (const sb of sandboxes) {
    try { fs.rmSync(sb, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

function contract(mission, authorizedPaths) {
  return {
    mission, version: "1.0", status: "AUTHORIZED", mode: "IMPLEMENT",
    priority: "NORMAL", requires_engineering: true, authorized_paths: authorizedPaths,
    objectives: [{
      id: "ODG_WRITE_1",
      goal: "ODG formulates and writes a deterministic synthetic manifest inside the authorized scope.",
      done_when: ["A single ODG-authored file exists inside the authorized scope."],
      authorization: { eligible: true, authorized: true },
    }],
    definition_of_done: ["ODG-authored deliverable written strictly within the authorized scope."],
    completion: ["Validation successful."],
  };
}

// ---------------------------------------------------------------------------------------------------
// POSITIVE — ODG-authored in-scope write, VERIFIED, proven-denominator 1/1 (independently recomputed).
// ---------------------------------------------------------------------------------------------------
test("positive: ODG capability writes in-scope, VERIFIED, autonomy 1/1 recomputed independently", () => {
  const sb = buildSandbox(contract("BENCH_WCAP_POSITIVE", ["bench-workspace/**"]));
  const { code, out } = runPipeline(sb, "BENCH_WCAP_POSITIVE");

  assert.strictEqual(code, 0, "pipeline must exit 0:\n" + out);
  assert.match(out, /PIPELINE SUCCESS — 13\/13 stages/, "all 13 stages must complete");

  // Real ODG-authored in-scope deliverable with the ODG-formulated content.
  const deliverable = path.join(sb, "bench-workspace", "odg-synthetic-manifest.txt");
  assert.ok(fs.existsSync(deliverable), "the in-scope deliverable must exist");
  assert.match(fs.readFileSync(deliverable, "utf8"), /generator=ODG_CAPABILITY/, "content is ODG-formulated");

  // Provenance: EXECUTED by the ODG capability, ODG_CAPABILITY author, ODG_EXECUTOR applicator, non-empty evidence.
  const exec = readGen(sb, "patch-execution.json");
  const e = exec.executed.find((x) => x.objectiveId === "ODG_WRITE_1");
  assert.ok(e, "the ODG_WRITE_1 objective must be recorded");
  assert.strictEqual(e.status, "EXECUTED");
  assert.strictEqual(e.capability, "ODG Synthetic Deliverable");
  assert.strictEqual(e.authoredBy, "ODG_CAPABILITY", "origin is genuinely ODG (not CONTRACT/UNKNOWN)");
  assert.strictEqual(e.appliedBy, "ODG_EXECUTOR", "applicator is the ODG executor (author ≠ applicator kept distinct)");
  assert.ok(typeof e.evidence === "string" && e.evidence.length > 0, "evidence path recorded");
  const ev = path.join(sb, e.evidence);
  assert.ok(fs.existsSync(ev) && fs.statSync(ev).size > 0, "evidence present & non-empty");

  // Validation + runtime-attributed final state (engineering caps at VERIFIED; RELEASED/ARCHIVED withheld).
  const report = readGen(sb, "mission-report.json");
  assert.strictEqual(report.validated, true, "validated must be true: " + JSON.stringify(report.unmet));
  assert.strictEqual(report.status, "SUCCESS");
  assert.strictEqual(report.checks.engineeringPerformed, true);
  assert.ok(report.checks.scopedChanges.some((p) => p.startsWith("bench-workspace")), "in-scope change observed");
  const lifecycle = readGen(sb, "mission-lifecycle.json");
  assert.strictEqual(lifecycle.achieved, "VERIFIED", "engineering mission reaches VERIFIED (not ARCHIVED): " + lifecycle.achieved);

  // Runtime report shows proven-denominator 1/1.
  const md = fs.readFileSync(path.join(sb, "runtime", "generated", "reports", "BENCH_WCAP_POSITIVE.final-report.md"), "utf8");
  assert.match(md, /ODG-executed\+verified 1\/1, denominator proven/, "final report shows a proven-denominator 1/1");

  // INDEPENDENT recomputation from the real runtime modules + sandbox artifacts (mirrors final-report).
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
  assert.match(md, new RegExp(`${measured.numerator}\\/${measured.denominator}, denominator proven`), "report and recomputation agree");

  // No UNKNOWN/CONTRACT origin is ever credited.
  assert.strictEqual(exec.executed.some((x) => x.authoredBy === "UNKNOWN" || x.authoredBy === "CONTRACT"), false);
});

// ---------------------------------------------------------------------------------------------------
// NEGATIVE — invalid (empty) authorized scope ⇒ capability refuses BEFORE any write; no deliverable.
// ---------------------------------------------------------------------------------------------------
test("negative: empty authorized scope ⇒ capability refuses before any write, mission not validated", () => {
  const sb = buildSandbox(contract("BENCH_WCAP_NOSCOPE", []));
  runPipeline(sb, "BENCH_WCAP_NOSCOPE"); // exit code is not the proof — the on-disk refusal is

  // No deliverable anywhere (zero mutation under an invalid scope).
  assert.strictEqual(fs.existsSync(path.join(sb, "bench-workspace", "odg-synthetic-manifest.txt")), false,
    "no deliverable must be written under an empty scope");

  // The capability refusal is recorded as a failure, never an APPLIED/EXECUTED success.
  if (genExists(sb, "patch-execution.json")) {
    const exec = readGen(sb, "patch-execution.json");
    const e = exec.executed.find((x) => x.objectiveId === "ODG_WRITE_1");
    if (e) {
      assert.notStrictEqual(e.status, "EXECUTED", "a refused write must not be EXECUTED");
      assert.notStrictEqual(e.status, "APPLIED", "a refused write must not be APPLIED");
    }
  }
  // Not a validated success.
  if (genExists(sb, "mission-report.json")) {
    const report = readGen(sb, "mission-report.json");
    assert.notStrictEqual(report.validated, true, "a refused-write mission must not validate");
  }
});

// ---------------------------------------------------------------------------------------------------
// NEGATIVE (Q6) — a scope subsuming runtime/governance does NOT authorize a governance write. The shared
// protected-governance guard (now reused by the capability branch) refuses BEFORE any write; no
// governance deliverable appears and the mission is not a validated success.
// ---------------------------------------------------------------------------------------------------
test("negative(Q6): a governance-subsuming scope is refused before any write by the shared guard", () => {
  const sb = buildSandbox(contract("BENCH_WCAP_GOV", ["runtime/governance/**"])); // NO allowProtectedGovernance
  runPipeline(sb, "BENCH_WCAP_GOV");

  // Zero mutation of the protected governance subtree.
  assert.strictEqual(fs.existsSync(path.join(sb, "runtime", "governance", "odg-synthetic-manifest.txt")), false,
    "no governance deliverable must be written without explicit elevated authorization");

  // The refusal is recorded, never an EXECUTED/APPLIED success.
  if (genExists(sb, "patch-execution.json")) {
    const exec = readGen(sb, "patch-execution.json");
    const e = exec.executed.find((x) => x.objectiveId === "ODG_WRITE_1");
    if (e) {
      assert.notStrictEqual(e.status, "EXECUTED", "a governance write must not be EXECUTED");
      assert.notStrictEqual(e.status, "APPLIED", "a governance write must not be APPLIED");
    }
  }
  if (genExists(sb, "mission-report.json")) {
    const report = readGen(sb, "mission-report.json");
    assert.notStrictEqual(report.validated, true, "a governance-refused mission must not validate");
  }
});
