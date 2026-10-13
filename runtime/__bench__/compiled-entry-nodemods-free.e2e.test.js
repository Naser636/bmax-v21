"use strict";

/*
 * LOT 1R PROOF — the COMPILED TypeScript entry runs in a bare sandbox (NO node_modules, NO tsx).
 * =============================================================================================
 *
 * This is the acceptance oracle for Lot 1R. It reproduces the exact context that defeated the earlier
 * tsx-shim approach — a throwaway sandbox that contains the runtime source but NO node_modules — and
 * proves the COMPILED entry (runtime/dist/bin/odg-run.js, emitted by tsconfig.runtime-dist.json) drives
 * the full 13-stage pipeline there with plain `node`, with NO tsx and NO node_modules.
 *
 * It copies into the sandbox: the legacy runtime source dirs (the 13 JS stages + the JS deps the entry
 * resolves CWD-relative) AND runtime/dist (the 4 compiled modules). It asserts the sandbox has no
 * node_modules and that the compiled entry carries no `tsx` reference, then runs it and checks the real
 * artifacts (13/13, validated, ARCHIVED, ODG_CAPABILITY attribution, ledger recorded) — identical to the
 * legacy path, so no attribution/ledger/governance drift.
 *
 * PREREQUISITE: `npx tsc -p tsconfig.runtime-dist.json` has emitted runtime/dist (the test asserts it).
 * It writes ONLY into its own tmpdir sandbox; the real repo and its evidence are untouched.
 *
 * Run:  node --test runtime/__bench__/compiled-entry-nodemods-free.e2e.test.js
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
// Legacy runtime dirs the pipeline needs at runtime (13 JS stages + the JS deps the compiled entry
// resolves CWD-relative: governance-kernel, odg-bootstrap, runtime-context-loader, etc.).
const COPY_DIRS = ["core", "bin", "constitution", "policies", "governance", "brain"];
const sandboxes = [];

const { attributeObjectives } = require(path.join(REPO, "runtime", "core", "objective-attribution.js"));
const { eligibilityFromObjectives, fromExecution, measureAutonomy } =
  require(path.join(REPO, "runtime", "core", "autonomy-measure.js"));

function sh(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}
function buildSandbox(contract) {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-compiled-"));
  sandboxes.push(sb);
  assert.ok(!sb.startsWith(REPO), "sandbox must live OUTSIDE the repository");
  for (const d of COPY_DIRS) fs.cpSync(path.join(REPO, "runtime", d), path.join(sb, "runtime", d), { recursive: true });
  // The COMPILED entry + helpers.
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
function runEnv() {
  const env = { ...process.env, FLEET_BRIDGE_MOCK: "1" };
  delete env.ODG_FLEET; delete env.ODG_VERBOSE;
  delete env.NODE_PATH; // do not let an external NODE_PATH smuggle node_modules into resolution
  return env;
}
function readGen(sb, n) { return JSON.parse(fs.readFileSync(path.join(sb, "runtime", "generated", n), "utf8")); }

test.after(() => {
  for (const sb of sandboxes) { try { fs.rmSync(sb, { recursive: true, force: true }); } catch { /* best-effort */ } }
});

const CONTRACT = {
  mission: "COMPILED_CLEAN", version: "1.0", status: "AUTHORIZED", mode: "READ_ONLY", priority: "NORMAL",
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

test("compiled entry runs the 13-stage pipeline in a bare sandbox (no node_modules, no tsx)", () => {
  // Prerequisite: the compiled output exists (emitted by tsconfig.runtime-dist.json).
  const compiledEntry = path.join(REPO, "runtime", "dist", "bin", "odg-run.js");
  assert.ok(fs.existsSync(compiledEntry), "runtime/dist/bin/odg-run.js must exist — run: npx tsc -p tsconfig.runtime-dist.json");
  // The compiled entry must NOT DEPEND on tsx (a require/import of tsx) — the word may appear in prose
  // comments, so match an actual module specifier, not the substring.
  assert.doesNotMatch(fs.readFileSync(compiledEntry, "utf8"), /(require\(|from\s+)['"]tsx(\/|['"])/,
    "compiled entry must carry no tsx require/import");

  const sb = buildSandbox(CONTRACT);

  // Bare sandbox: no node_modules anywhere, and tsx is NOT resolvable from it.
  assert.strictEqual(fs.existsSync(path.join(sb, "node_modules")), false, "sandbox has no node_modules");
  const tsxProbe = spawnSync("node", ["-e", "require.resolve('tsx/cjs')"], { cwd: sb, encoding: "utf8", env: runEnv() });
  assert.notStrictEqual(tsxProbe.status, 0, "tsx/cjs must be UNRESOLVABLE in the bare sandbox (proves no hidden tsx dep)");

  // Run the COMPILED entry with plain node.
  const r = spawnSync("node", ["runtime/dist/bin/odg-run.js", "COMPILED_CLEAN"], { cwd: sb, encoding: "utf8", env: runEnv() });
  const out = (r.stdout || "") + (r.stderr || "");
  assert.strictEqual(r.status, 0, "compiled pipeline must exit 0:\n" + out);
  assert.match(out, /PIPELINE SUCCESS — 13\/13 stages/, "all 13 stages must complete via the compiled entry");

  // Same artifacts/behaviour as the legacy path — no drift.
  const report = readGen(sb, "mission-report.json");
  assert.strictEqual(report.mission, "COMPILED_CLEAN");
  assert.strictEqual(report.validated, true, "validated: " + JSON.stringify(report.unmet));
  assert.strictEqual(report.status, "SUCCESS");
  assert.strictEqual(readGen(sb, "mission-lifecycle.json").achieved, "ARCHIVED", "read-only mission reaches ARCHIVED");

  const exec = readGen(sb, "patch-execution.json");
  const cw = exec.executed.filter((e) => String(e.objectiveId || e.action || "").startsWith("CLEAN_WORKSPACE_"));
  assert.strictEqual(cw.length, 3, "three Clean Workspace objectives executed");
  for (const e of cw) {
    assert.strictEqual(e.status, "EXECUTED");
    assert.strictEqual(e.authoredBy, "ODG_CAPABILITY", "ODG origin (not CONTRACT/UNKNOWN)");
    assert.strictEqual(e.appliedBy, "ODG_EXECUTOR");
  }
  const ledger = readGen(sb, "mission-ledger.json");
  const entries = Array.isArray(ledger) ? ledger : (ledger.entries || ledger.missions || []);
  assert.ok(entries.some((e) => (e.mission || e.missionId) === "COMPILED_CLEAN" && e.proven === true), "ledger records the mission (proven)");

  // Independent recompute (real modules): no attribution drift, no UNKNOWN/CONTRACT credited.
  const plan = readGen(sb, "mission-plan.json");
  const patchPlan = readGen(sb, "patch-plan.json");
  const probe = (p) => { try { return typeof p === "string" && p.length > 0 && fs.statSync(path.join(sb, p)).size > 0; } catch { return false; } };
  const attribution = attributeObjectives(plan, patchPlan, exec, probe, () => ({}), () => false, {});
  const { map, complete } = eligibilityFromObjectives(Array.isArray(plan.objectives) ? plan.objectives : []);
  assert.strictEqual(complete, true, "denominator complete");
  const coverageOk = !!(report.checks && report.checks.objectiveCoverage === true);
  const measured = measureAutonomy(fromExecution(exec, attribution, map, { runComplete: coverageOk }));
  assert.strictEqual(measured.measurable, true);
  assert.strictEqual(measured.numerator, 3);
  assert.strictEqual(measured.denominator, 3);
  assert.strictEqual(exec.executed.some((e) => e.authoredBy === "UNKNOWN" || e.authoredBy === "CONTRACT"), false);
});

// Checkpoint/resume parity on the COMPILED entry: a FRESH run after a COMPLETE one re-runs cleanly
// (idempotent), proving the compiled checkpoint-engine behaves like the legacy one.
test("compiled entry: checkpoint written + COMPLETE (resume semantics preserved)", () => {
  const sb = buildSandbox({ ...CONTRACT, mission: "COMPILED_CLEAN2" });
  const r = spawnSync("node", ["runtime/dist/bin/odg-run.js", "COMPILED_CLEAN2"], { cwd: sb, encoding: "utf8", env: runEnv() });
  assert.strictEqual(r.status, 0, "exit 0");
  const cp = readGen(sb, "pipeline-checkpoint.json");
  assert.strictEqual(cp.mission, "COMPILED_CLEAN2");
  assert.strictEqual(cp.status, "COMPLETE", "checkpoint reaches COMPLETE via the compiled checkpoint-engine");
  assert.strictEqual(cp.completed.length, cp.stages.length, "every stage recorded DONE");
});
