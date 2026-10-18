#!/usr/bin/env node
/*
 * PRESENT-STATE RECONCILIATION (TS port — compiles to runtime/dist/core/present-state-reconciliation.js,
 * the sibling the compiled dist/core/runtime-model.js requires). Behavioural parity with the JS rollback
 * port runtime/core/present-state-reconciliation.js (CTO Priority-1 L2 migration, dual-port).
 *
 * Prove a COMPLETED mission against the ACTUAL source tree, recorded DISTINCTLY from historical pipeline
 * execution. DEFAULT-DENY: PROVEN only when the mission declares a complete presentStateAcceptance probe
 * {sources[],tests[]}, every declared source exists (sha256 recorded), and every declared acceptance test
 * EXITS 0 present-state (exit code + output hash recorded). Does NOT weaken the mission-ledger proven-gate
 * and NEVER fabricates a mission-report. Pure of clock via injected `now`; test runner injectable.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cp = require("child_process");

const PROVENANCE = "present-state-reconciliation";
const RECON_FILE = path.join("runtime", "generated", "present-state-reconciliation.json");

function sha256File(p: string): string | null {
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  } catch {
    return null;
  }
}

function readProbe(mission: string, repoRoot: string): { sources: string[]; tests: string[] } | null {
  const file = path.join(repoRoot, "runtime", "missions", `${mission}.json`);
  let raw: any;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
  const p = raw && raw.presentStateAcceptance;
  if (!p || !Array.isArray(p.sources) || !Array.isArray(p.tests)) return null;
  const sources = p.sources.filter((s: any) => typeof s === "string" && s.length > 0);
  const tests = p.tests.filter((t: any) => typeof t === "string" && t.length > 0);
  return { sources, tests };
}

function defaultRunTest(testPath: string, repoRoot: string): { exit: number | null; output: string } {
  if (!testPath.endsWith(".js")) return { exit: null, output: `not run (non-.js test not executable by the reconciler): ${testPath}` };
  const r = cp.spawnSync(process.execPath, [testPath], { cwd: repoRoot, encoding: "utf8", timeout: 120000 });
  return { exit: r.status === null ? 1 : r.status, output: (r.stdout || "") + (r.stderr || "") };
}

function reconcile(mission: string, opts?: any): any {
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

  const sources = probe.sources.map((s: string) => {
    const abs = path.join(repoRoot, s);
    const exists = fs.existsSync(abs);
    return { path: s, exists, sha256: exists ? sha256File(abs) : null };
  });
  const missingSources = sources.filter((s: any) => !s.exists).map((s: any) => s.path);

  const tests = probe.tests.map((t: string) => {
    const abs = path.join(repoRoot, t);
    if (!fs.existsSync(abs)) return { path: t, exists: false, exit: null, reason: "test file absent" };
    const r = runTest(t, repoRoot);
    return { path: t, exists: true, exit: r.exit, outputSha: crypto.createHash("sha256").update(String(r.output || "")).digest("hex").slice(0, 16) };
  });
  const failedTests = tests.filter((t: any) => t.exit !== 0).map((t: any) => `${t.path}(exit=${t.exit === null ? "absent/not-run" : t.exit})`);

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

function readAtomic(file: string): any {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeAtomic(file: string, state: any): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, file);
}

function reconcileAndRecord(mission: string, opts?: any): any {
  opts = opts || {};
  const repoRoot = opts.repoRoot || process.cwd();
  const file = path.join(repoRoot, RECON_FILE);
  const result = reconcile(mission, opts);

  let state = readAtomic(file);
  if (!state || typeof state !== "object" || !Array.isArray(state.reconciled)) {
    state = { schema: "present-state-reconciliation/1", provenance: PROVENANCE, generatedAt: result.reconciledAt, reconciled: [] };
  }
  state.reconciled = state.reconciled.filter((r: any) => r && r.mission !== mission);
  state.reconciled.push(result);
  state.generatedAt = result.reconciledAt;
  writeAtomic(file, state);
  return result;
}

function reconciledProvenMissions(repoRoot?: string): string[] {
  const file = path.join(repoRoot || process.cwd(), RECON_FILE);
  const state = readAtomic(file);
  const list = state && Array.isArray(state.reconciled) ? state.reconciled : [];
  return list.filter((r: any) => r && r.proven === true && typeof r.mission === "string").map((r: any) => r.mission);
}

module.exports = { reconcile, reconcileAndRecord, reconciledProvenMissions, readProbe, PROVENANCE, RECON_FILE };

if (require.main === module) {
  const missions = process.argv.slice(2).filter((a: string) => !a.startsWith("--"));
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

// Module-scope marker (adds NO runtime export): forces TypeScript MODULE scope so these helpers are
// module-local and do NOT collide with the JS rollback port (present-state-reconciliation.js) under the
// repo-wide tsc program (TS2451). Same discipline as runtime-model.ts / log-slug.ts.
export {};
