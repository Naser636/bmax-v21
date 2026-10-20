#!/usr/bin/env node
"use strict";
/*
 * PRESENT-STATE RECONCILIATION (CTO §2) — prove a COMPLETED mission against the ACTUAL source tree,
 * recorded DISTINCTLY from historical pipeline execution.
 *
 * Why this exists: a mission can be genuinely implemented + committed (its code shipped, its acceptance
 * tests present and passing) yet remain UNPROVEN in the mission ledger, because the ledger's proven-gate
 * (mission-ledger.recordMission) records `proven: true` ONLY from a mission-matched, `validated`
 * Validation-Engine report produced BY A PIPELINE EXECUTION of that mission. Work implemented out-of-band
 * (a governed engineering commit) never produced such a report, and cannot be re-executed in-process.
 *
 * This module does NOT weaken that gate and NEVER fabricates a mission-report. It is a SEPARATE, equally
 * default-deny verifier that:
 *   1) reads the mission's EXPLICIT `presentStateAcceptance` probe — {sources:[...], tests:[...]}. No probe,
 *      or an incomplete one, ⇒ NOT reconcilable (never an implicit pass; NL goals are never inferred).
 *   2) checks every declared source file EXISTS on disk (recording its sha256), and
 *   3) RUNS every declared acceptance test present-state and requires each to EXIT 0 (recording exit code +
 *      output hash).
 * PROVEN iff the probe is complete (>=1 source AND >=1 test) AND every source exists AND every test exits 0.
 * Otherwise NOT_PROVEN / INCOMPLETE_PROBE / NOT_RECONCILABLE (fail-closed).
 *
 * The result is persisted to runtime/generated/present-state-reconciliation.json with
 * `provenance: "present-state-reconciliation"` — a record DISTINCT from the pipeline ledger, so a consumer
 * (runtime-model) can honour the proof WITHOUT confusing it with a pipeline execution. Code exists / the
 * general suite passes are NEVER sufficient on their own: the mission's OWN declared acceptance tests must
 * pass present-state.
 *
 * Pure of clock via injected `now`; the test runner is injectable (opts.runTest) for hermetic unit tests.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cp = require("child_process");

const PROVENANCE = "present-state-reconciliation";
const RECON_FILE = path.join("runtime", "generated", "present-state-reconciliation.json");

function sha256File(p) {
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  } catch {
    return null;
  }
}

// Read a mission contract's EXPLICIT present-state acceptance probe. A mission is reconcilable ONLY when it
// DECLARES presentStateAcceptance:{sources:[...strings], tests:[...strings]} — no NL inference, no implicit
// pass. Returns null when absent/malformed (⇒ NOT_RECONCILABLE, fail-closed).
function readProbe(mission, repoRoot) {
  const file = path.join(repoRoot, "runtime", "missions", `${mission}.json`);
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
  const p = raw && raw.presentStateAcceptance;
  if (!p || !Array.isArray(p.sources) || !Array.isArray(p.tests)) return null;
  const sources = p.sources.filter((s) => typeof s === "string" && s.length > 0);
  const tests = p.tests.filter((t) => typeof t === "string" && t.length > 0);
  return { sources, tests };
}

// Default present-state test runner: a .js test is run with `node <file>`; any non-.js test (e.g. a .ts
// bench needing a loader) is NOT run here and reported exit:null ⇒ fail-closed (never a silent pass).
function defaultRunTest(testPath, repoRoot) {
  // Run .ts tests via the project's `tsx` (as `npm test` does); .js via node. The JS-era reconciler refused
  // every non-.js test, so after the TS migration every migrated mission was falsely absent/not-run ⇒
  // NOT_PROVEN (systematic false NEGATIVE). This aligns it with the canonical runner. Proven-gate unchanged:
  // a test must still EXIT 0 present-state. (Mirror of the .ts port.)
  const isTs = testPath.endsWith(".ts");
  const isJs = testPath.endsWith(".js");
  if (!isTs && !isJs) return { exit: null, output: `not run (unsupported test type, expected .ts or .js): ${testPath}` };
  let cmd, argv;
  if (isTs) {
    const tsxBin = path.join(repoRoot, "node_modules", ".bin", "tsx");
    if (!fs.existsSync(tsxBin)) return { exit: null, output: `not run (tsx not installed; cannot execute .ts test): ${testPath}` };
    cmd = tsxBin; argv = [testPath];
  } else {
    cmd = process.execPath; argv = [testPath];
  }
  const r = cp.spawnSync(cmd, argv, { cwd: repoRoot, encoding: "utf8", timeout: 120000 });
  return { exit: r.status === null ? 1 : r.status, output: (r.stdout || "") + (r.stderr || "") };
}

/*
 * Reconcile one mission against the present-state tree. DEFAULT-DENY. Returns a result record (also the
 * shape persisted into present-state-reconciliation.json). opts: {repoRoot, runTest, now, probe}.
 */
function reconcile(mission, opts) {
  opts = opts || {};
  const repoRoot = opts.repoRoot || process.cwd();
  const runTest = opts.runTest || defaultRunTest;
  const now = opts.now || (() => new Date().toISOString());
  if (!mission || typeof mission !== "string") throw new Error("present-state-reconciliation: mission (string) required");

  const probe = opts.probe || readProbe(mission, repoRoot);
  const base = { mission, provenance: PROVENANCE, reconciledAt: now() };
  if (!probe) {
    return { ...base, proven: false, verdict: "NOT_RECONCILABLE", reason: "no presentStateAcceptance probe declared (fail-closed; NL goals are never inferred)" };
  }
  if (probe.sources.length === 0 || probe.tests.length === 0) {
    return { ...base, proven: false, verdict: "INCOMPLETE_PROBE", reason: `probe must declare >=1 source AND >=1 test (got ${probe.sources.length} sources, ${probe.tests.length} tests)` };
  }

  const sources = probe.sources.map((s) => {
    const abs = path.join(repoRoot, s);
    const exists = fs.existsSync(abs);
    return { path: s, exists, sha256: exists ? sha256File(abs) : null };
  });
  const missingSources = sources.filter((s) => !s.exists).map((s) => s.path);

  const tests = probe.tests.map((t) => {
    const abs = path.join(repoRoot, t);
    if (!fs.existsSync(abs)) return { path: t, exists: false, exit: null, reason: "test file absent" };
    const r = runTest(t, repoRoot);
    return { path: t, exists: true, exit: r.exit, outputSha: crypto.createHash("sha256").update(String(r.output || "")).digest("hex").slice(0, 16) };
  });
  const failedTests = tests.filter((t) => t.exit !== 0).map((t) => `${t.path}(exit=${t.exit === null ? "absent/not-run" : t.exit})`);

  const proven = missingSources.length === 0 && failedTests.length === 0;
  return {
    ...base,
    proven,
    verdict: proven ? "PROVEN" : "NOT_PROVEN",
    reason: proven
      ? "all declared sources present + all declared acceptance tests pass present-state"
      : `missing sources: [${missingSources.join(", ")}]; failed/absent tests: [${failedTests.join(", ")}]`,
    evidence: { sources, tests },
  };
}

function readAtomic(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeAtomic(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, file);
}

/*
 * Reconcile + PERSIST. Records the result into present-state-reconciliation.json (a store DISTINCT from the
 * pipeline ledger). Idempotent per mission: the latest reconciliation for a mission REPLACES its prior entry
 * (same sha-stamped evidence ⇒ same proof; a regression ⇒ the record flips to NOT_PROVEN honestly). A
 * NOT_PROVEN result is recorded too (failures are never hidden). Returns the result.
 */
function reconcileAndRecord(mission, opts) {
  opts = opts || {};
  const repoRoot = opts.repoRoot || process.cwd();
  const file = path.join(repoRoot, RECON_FILE);
  const result = reconcile(mission, opts);

  let state = readAtomic(file);
  if (!state || typeof state !== "object" || !Array.isArray(state.reconciled)) {
    state = { schema: "present-state-reconciliation/1", provenance: PROVENANCE, generatedAt: result.reconciledAt, reconciled: [] };
  }
  state.reconciled = state.reconciled.filter((r) => r && r.mission !== mission);
  state.reconciled.push(result);
  state.generatedAt = result.reconciledAt;
  writeAtomic(file, state);
  return result;
}

// Read the set of missions PROVEN by present-state reconciliation (proven === true only). Consumed by
// runtime-model to honour the distinct proof. Fail-closed: unreadable/absent ⇒ empty set.
function reconciledProvenMissions(repoRoot) {
  const file = path.join(repoRoot || process.cwd(), RECON_FILE);
  const state = readAtomic(file);
  const list = state && Array.isArray(state.reconciled) ? state.reconciled : [];
  return list.filter((r) => r && r.proven === true && typeof r.mission === "string").map((r) => r.mission);
}

module.exports = { reconcile, reconcileAndRecord, reconciledProvenMissions, readProbe, defaultRunTest, PROVENANCE, RECON_FILE };

if (require.main === module) {
  const missions = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (missions.length === 0) {
    process.stderr.write("usage: present-state-reconciliation.js <MISSION> [<MISSION> ...]\n");
    process.exit(2);
  }
  let allProven = true;
  for (const m of missions) {
    const r = reconcileAndRecord(m);
    if (!r.proven) allProven = false;
    console.log(`${r.proven ? "PROVEN    " : "NOT-PROVEN"} ${m} — ${r.verdict}: ${r.reason}`);
  }
  process.exit(allProven ? 0 : 1);
}
