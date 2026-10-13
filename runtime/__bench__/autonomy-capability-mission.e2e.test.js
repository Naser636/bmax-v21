"use strict";

/*
 * AUTONOMY E2E — ODG_CAPABILITY PROVENANCE  (Phase 03 — Gate B)
 * ============================================================
 *
 * Drives the REAL runtime pipeline (runtime/bin/odg-run.js, 13 stages) end-to-end for a synthetic
 * READ-ONLY mission whose three objectives (CLEAN_WORKSPACE_1..3) resolve to the REAL, registered ODG
 * capability executor "Clean Workspace" (capability-executors.js). That executor FORMULATES its own
 * content (a deterministic git-ignored-artifact scan) and writes a non-empty evidence JSON under
 * runtime/generated/ — so the work is genuinely ODG-authored, recorded status "EXECUTED" with
 * authoredBy "ODG_CAPABILITY". This is the SAME path MEASURE_DEMO_CLEAN used to measure 3/3.
 *
 * WHAT THIS PROVES (separately verified):
 *   - ODG provenance: every executed objective carries authoredBy "ODG_CAPABILITY" (NOT CONTRACT/UNKNOWN).
 *   - Execution + evidence: status EXECUTED, a present & non-empty evidence artifact per objective.
 *   - Explicit, complete denominator: each objective declares authorization {eligible,authorized}.
 *   - Per-mission autonomy 3/3, cross-checked by an INDEPENDENT recomputation from the real runtime
 *     modules (objective-attribution + autonomy-measure) against the sandbox artifacts, and matched to
 *     the runtime's own final report.
 *   - No autonomy credit is ever given to an UNKNOWN/CONTRACT origin.
 *
 * WHAT THIS DOES NOT PROVE (honest limits):
 *   - This is a READ-ONLY audit: "Clean Workspace" writes EVIDENCE under runtime/generated/, NOT a
 *     business deliverable inside an authorized write scope. This benchmark makes NO claim of an in-scope
 *     WRITE, NO global-autonomy-rate claim, and NO Phase-03 closure.
 *   - The NEGATIVE self-approval refusal is NOT duplicated here (that would fork an existing mechanism).
 *     It remains proven separately by runtime/__bench__/autonomy-write-mission.e2e.test.js.
 *
 * ISOLATION (reused, identical to the sibling benchmarks): a throwaway os.tmpdir() git repo, outside the
 * real repo (asserted), CWD-relative pipeline, offline (FLEET_BRIDGE_MOCK=1, ODG_FLEET cleared); the
 * "Clean Workspace" capability uses only git + a local fs scan (no network, no provider).
 *
 * Run:  node --test runtime/__bench__/autonomy-capability-mission.e2e.test.js
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

// Independent recomputation uses the REAL runtime modules (not a reimplementation).
const { attributeObjectives } = require(path.join(REPO, "runtime", "core", "objective-attribution.js"));
const { eligibilityFromObjectives, fromExecution, measureAutonomy } =
  require(path.join(REPO, "runtime", "core", "autonomy-measure.js"));

function sh(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

function buildSandbox(contract) {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-cap-e2e-"));
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

function runEnv() {
  const env = { ...process.env, FLEET_BRIDGE_MOCK: "1" };
  delete env.ODG_FLEET;
  delete env.ODG_VERBOSE;
  return env;
}

function runPipeline(sb, mission) {
  const r = spawnSync("node", ["runtime/bin/odg-run.js", mission],
    { cwd: sb, encoding: "utf8", env: runEnv() });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

function readGen(sb, name) {
  return JSON.parse(fs.readFileSync(path.join(sb, "runtime", "generated", name), "utf8"));
}

test.after(() => {
  for (const sb of sandboxes) {
    try { fs.rmSync(sb, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

// A faithful inline clone of the MEASURE_DEMO_CLEAN contract: READ-ONLY, three Clean Workspace
// objectives, each with an explicit per-objective authorization declaration (the denominator source).
const CONTRACT = {
  mission: "BENCH_CAP_PROVENANCE",
  version: "1.0",
  status: "AUTHORIZED",
  mode: "READ_ONLY",
  priority: "NORMAL",
  requires_engineering: false,
  authorized_paths: [],
  objectives: [
    {
      id: "CLEAN_WORKSPACE_1",
      goal: "Enumerate the transient git-ignored runtime workspace artifacts under runtime/ (read-only scan).",
      done_when: ["A deterministic scan lists every candidate path under runtime/ that is safe to remove."],
      authorization: { eligible: true, authorized: true },
    },
    {
      id: "CLEAN_WORKSPACE_2",
      goal: "Confirm each candidate is covered by the gitignore/backup/archive policy so no tracked or required artifact is listed.",
      done_when: ["Every candidate is git-ignored or already archived; no tracked or required artifact is listed."],
      authorization: { eligible: true, authorized: true },
    },
    {
      id: "CLEAN_WORKSPACE_3",
      goal: "Produce read-only evidence of the cleaned workspace state without deleting any tracked or required artifact.",
      done_when: ["Evidence generated.", "Report generated."],
      authorization: { eligible: true, authorized: true },
    },
  ],
  verify: [{ capability: "Clean Workspace", evidence: "clean-workspace-scanned" }],
  definition_of_done: ["Evidence generated", "Report generated"],
};

test("ODG_CAPABILITY provenance: Clean Workspace mission measures 3/3 from genuinely ODG-authored evidence", () => {
  const sb = buildSandbox(CONTRACT);

  // Isolation confirmed: outputs confined to the sandbox (which is outside the repo).
  assert.ok(!sb.startsWith(REPO), "sandbox is outside the real repository");

  const { code, out } = runPipeline(sb, CONTRACT.mission);
  assert.strictEqual(code, 0, "pipeline must exit 0:\n" + out);
  assert.match(out, /PIPELINE SUCCESS — 13\/13 stages/, "all 13 stages must complete");

  // Runtime-attributed final state (READ-ONLY missions reach the terminal ARCHIVED via the ledger).
  const lifecycle = readGen(sb, "mission-lifecycle.json");
  assert.strictEqual(lifecycle.achieved, "ARCHIVED",
    "a read-only mission's governance state is runtime-attributed ARCHIVED: got " + lifecycle.achieved);

  const report = readGen(sb, "mission-report.json");
  assert.strictEqual(report.validated, true, "validated must be true: " + JSON.stringify(report.unmet));
  assert.strictEqual(report.status, "SUCCESS");

  // Provenance: every executed objective was run by the ODG capability (NOT CONTRACT/UNKNOWN), EXECUTED,
  // with a present & non-empty evidence artifact.
  const exec = readGen(sb, "patch-execution.json");
  const cwEntries = exec.executed.filter((e) => typeof e.objectiveId === "string" && e.objectiveId.startsWith("CLEAN_WORKSPACE_"));
  assert.strictEqual(cwEntries.length, 3, "exactly three Clean Workspace objectives executed");
  for (const e of cwEntries) {
    assert.strictEqual(e.status, "EXECUTED", `${e.objectiveId} must be EXECUTED (real capability run)`);
    assert.strictEqual(e.capability, "Clean Workspace", `${e.objectiveId} ran the Clean Workspace capability`);
    assert.strictEqual(e.authoredBy, "ODG_CAPABILITY", `${e.objectiveId} is ODG-authored (not CONTRACT/UNKNOWN)`);
    assert.notStrictEqual(e.authoredBy, "UNKNOWN");
    assert.notStrictEqual(e.authoredBy, "CONTRACT");
    assert.ok(typeof e.evidence === "string" && e.evidence.length > 0, `${e.objectiveId} records an evidence path`);
    const ev = path.join(sb, e.evidence);
    assert.ok(fs.existsSync(ev) && fs.statSync(ev).size > 0, `${e.objectiveId} evidence present & non-empty: ${e.evidence}`);
  }

  // Runtime's own report shows the proven-denominator 3/3.
  const md = fs.readFileSync(path.join(sb, "runtime", "generated", "reports", `${CONTRACT.mission}.final-report.md`), "utf8");
  assert.match(md, /ODG-executed\+verified 3\/3, denominator proven/, "final report must show a proven-denominator 3/3");

  // INDEPENDENT recomputation from the real runtime modules + sandbox artifacts (mirrors final-report's
  // wiring) — the measurement is not taken on faith from the report alone.
  const plan = readGen(sb, "mission-plan.json");
  const patchPlan = readGen(sb, "patch-plan.json");
  const probe = (p) => { try { return typeof p === "string" && p.length > 0 && fs.statSync(path.join(sb, p)).size > 0; } catch { return false; } };
  const attribution = attributeObjectives(plan, patchPlan, exec, probe, () => ({}), () => false, {});
  const { map, complete, missing } = eligibilityFromObjectives(Array.isArray(plan.objectives) ? plan.objectives : []);
  assert.strictEqual(complete, true, "denominator must be complete (explicit per-objective authorization): missing " + JSON.stringify(missing));
  const coverageOk = !!(report.checks && report.checks.objectiveCoverage === true);
  const measured = measureAutonomy(fromExecution(exec, attribution, map, { runComplete: coverageOk }));
  assert.strictEqual(measured.measurable, true, "independent recomputation must be measurable: " + JSON.stringify(measured));
  assert.strictEqual(measured.denominator, 3, "denominator = 3 eligible+authorized objectives");
  assert.strictEqual(measured.numerator, 3, "numerator = 3 ODG-executed+verified objectives");
  assert.strictEqual(measured.autonomyPercent, 100, "independent recomputation must equal 100% (3/3)");

  // Concordance: the independent recomputation agrees with the runtime's own report.
  assert.match(md, new RegExp(`${measured.numerator}\\/${measured.denominator}, denominator proven`),
    "the runtime report and the independent recomputation must agree on numerator/denominator");

  // Hard honesty: no UNKNOWN/CONTRACT origin is ever credited as ODG autonomy.
  const unknownOrigin = exec.executed.some((e) => e.authoredBy === "UNKNOWN" || e.authoredBy === "CONTRACT");
  assert.strictEqual(unknownOrigin, false, "no executed objective carries an UNKNOWN/CONTRACT origin in this scenario");
});
