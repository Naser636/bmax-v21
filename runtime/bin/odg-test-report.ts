#!/usr/bin/env node
/**
 * odg test-report — verification-results classifier (honest, no hiding).
 *
 * The official `npm test` runner collapses every suite into a single 0/1 exit code, losing per-suite
 * results and any distinction between a genuine failure and an environment-blocked one. This tool runs
 * the SAME suite list, records each suite's REAL exit code, and classifies it — WITHOUT ever converting
 * a blocked/failed suite into PASS and WITHOUT broadening exclusions to obtain a green exit.
 *
 * Classes (per suite):
 *   PASS                 — exit 0, no self-declared skip
 *   SKIPPED              — exit 0 AND the suite printed "##CLASS: SKIPPED [reason]"
 *   BLOCKED_BY_ISOLATION — the suite printed "##CLASS: BLOCKED_BY_ISOLATION [reason]" (any exit) — an
 *                          environment capability (e.g. nested bubblewrap) is unavailable. DISCLOSED,
 *                          NEVER counted as PASS.
 *   FAIL                 — exit non-zero with no blocked/skip declaration — a genuine failure.
 *   NOT_RUN              — the suite file does not exist.
 *
 * A self-declaration is a convention a suite OPTS INTO (printing `##CLASS: <CLASS> <reason>`); suites
 * that do not declare are classified purely by exit code. Overall exit is 0 ONLY when there are zero
 * FAIL and zero BLOCKED_BY_ISOLATION — a blocked suite can never silently green the gate.
 *
 * This tool only spawns the test runner (`tsx`) per suite; it opens no network and writes only the
 * gitignored evidence artifact runtime/generated/test-report.json.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync, spawn } = require("child_process");

const ROOT = process.cwd(); // repo root (wrapper cwd) — robust from any dist depth (was __dirname → wrong under dist/bin)
const GEN = path.join(ROOT, "runtime", "generated");
const DECL = /##CLASS:\s*(BLOCKED_BY_ISOLATION|SKIPPED)\b[ \t]*(.*)/;

/** Pure classification from a suite's observed outcome. */
function classify({ exists, exitCode, stdout }: any): any {
  if (!exists) return { cls: "NOT_RUN", reason: "suite file not found" };
  const m = typeof stdout === "string" ? stdout.match(DECL) : null;
  if (m && m[1] === "BLOCKED_BY_ISOLATION") return { cls: "BLOCKED_BY_ISOLATION", reason: (m[2] || "").trim() };
  if (exitCode === 0) {
    if (m && m[1] === "SKIPPED") return { cls: "SKIPPED", reason: (m[2] || "").trim() };
    return { cls: "PASS", reason: "" };
  }
  return { cls: "FAIL", reason: `exit ${exitCode}` };
}

/** Run each suite through an injected runner (default: tsx child process). Never throws per-suite. */
function runSuites(files: any, runner?: any): any {
  const run = typeof runner === "function" ? runner : defaultRunner;
  return files.map((file: any) => {
    const exists = safeExists(file);
    const r = exists ? run(file) : { exitCode: null, stdout: "" };
    const { cls, reason } = classify({ exists, exitCode: r.exitCode, stdout: r.stdout });
    return { file, exitCode: r.exitCode, cls, reason };
  });
}

function safeExists(f: any): boolean {
  try { return fs.existsSync(f); } catch { return false; }
}

function defaultRunner(file: any): any {
  const tsx = path.join(ROOT, "node_modules", ".bin", "tsx");
  const r = spawnSync(tsx, [file], { cwd: ROOT, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  return { exitCode: r.status == null ? 1 : r.status, stdout: (r.stdout || "") + (r.stderr || "") };
}

const CLASSES = ["PASS", "SKIPPED", "BLOCKED_BY_ISOLATION", "FAIL", "NOT_RUN"];

/** Aggregate results into honest counts + per-class file lists. */
function summarize(results: any): any {
  const counts: any = Object.fromEntries(CLASSES.map((c) => [c, 0]));
  const byClass: any = Object.fromEntries(CLASSES.map((c) => [c, []]));
  for (const r of results) { counts[r.cls] += 1; byClass[r.cls].push(r.file); }
  return { total: results.length, counts, byClass };
}

/** Overall exit code: 0 ONLY if no genuine FAIL and no BLOCKED_BY_ISOLATION (blocked is never PASS). */
function overallExit(summary: any): number {
  return summary.counts.FAIL === 0 && summary.counts.BLOCKED_BY_ISOLATION === 0 ? 0 : 1;
}

function renderReport(summary: any, results: any): string {
  const c = summary.counts;
  const L = [];
  const rule = "======================================================================";
  L.push(rule);
  L.push("  ODG TEST-REPORT — classified verification results");
  L.push(rule);
  L.push(`TOTAL ${summary.total} · PASS ${c.PASS} · FAIL ${c.FAIL} · BLOCKED_BY_ISOLATION ${c.BLOCKED_BY_ISOLATION} · SKIPPED ${c.SKIPPED} · NOT_RUN ${c.NOT_RUN}`);
  for (const cls of ["FAIL", "BLOCKED_BY_ISOLATION", "SKIPPED", "NOT_RUN"]) {
    if (summary.byClass[cls].length === 0) continue;
    L.push(`${cls}:`);
    for (const r of results.filter((x: any) => x.cls === cls)) {
      L.push(`  - ${r.file}${r.reason ? "  (" + r.reason + ")" : ""}`);
    }
  }
  L.push(rule);
  L.push(overallExit(summary) === 0
    ? "VERDICT: all suites PASS/SKIPPED — no genuine failure, nothing blocked."
    : "VERDICT: not green — genuine FAIL and/or BLOCKED_BY_ISOLATION present (disclosed above). Blocked ≠ pass.");
  L.push(rule);
  return L.join("\n");
}

function defaultFiles(): any {
  const globs = [["src", "tests"], ["src", "runtime"], ["runtime", "core"]];
  const out: any[] = [];
  for (const [a, b] of globs) {
    const dir = path.join(ROOT, a, b);
    let names = [];
    try { names = fs.readdirSync(dir); } catch { names = []; }
    for (const n of names) if (/\.test\.(ts|js)$/.test(n)) out.push(path.join(a, b, n));
  }
  const cockpit = path.join("runtime", "bin", "odg-cockpit.test.ts");
  if (safeExists(path.join(ROOT, cockpit))) out.push(cockpit);
  return out.sort();
}

/*
 * OPT-IN PARALLEL SCHEDULING (ODG_TEST_WORKERS>1) — HYPER-SPEED, same proof.
 *
 * The classification, the per-suite semantics and the persisted-artifact ORDER are IDENTICAL to the
 * sequential runSuites — only the scheduling differs. Default (unset / 1) runs the untouched sequential
 * path, so CI and every existing caller are byte-identical until the knob is explicitly turned up.
 *
 * Safety is BY CONSTRUCTION, not by hope:
 *   - suiteIsHazard() flags any suite whose source can touch GLOBAL mutable state shared across suites —
 *     it changes the process cwd (process.chdir ⇒ the code under test then writes repo-relative paths),
 *     binds a port (.listen), or mutates a repo-relative "runtime/..." path by literal. Conservative:
 *     an unreadable or unrecognised suite stays hazardous (serial).
 *   - HAZARD suites run strictly one-at-a-time in phase 1 (exactly today's execution), so a cwd-mutating
 *     or repo-writing suite is NEVER concurrent with anything.
 *   - Hermetic suites run in phase 2 with bounded concurrency, each in its OWN TMPDIR, so os.tmpdir()
 *     fixed-name temp files cannot collide; and because hermetic suites never mutate repo-relative state
 *     they cannot race each other nor produce state a phase-1 suite consumes. Phases never overlap.
 *   - Worker count is clamped to the CPU count; results are re-sorted to the ORIGINAL input index.
 * The opt-in path is accepted only after proving its classification equals the sequential gate's.
 */
const HAZARD_RE = /process\.chdir\(|\.listen\(|(?:writeFileSync|appendFileSync|mkdirSync|rmSync|rmdirSync|renameSync|writeSync|copyFileSync|createWriteStream|openSync)\(\s*[`'"]runtime\//;
// Explicit allowlist for suites that touch repo-relative GLOBAL state the HAZARD_RE heuristic cannot see — e.g. a
// write whose path is COMPUTED (path.join(REPO,"runtime",...)) rather than a literal "runtime/..." string argument.
// Such a suite must still run serially (phase 1), never in the hermetic parallel pool. Keyed by basename.
const HAZARD_ALLOWLIST = new Set<string>([
  "consequential-executor-gate.test.ts",
  // These three write/delete/restore the SAME real file runtime/generated/external-research-acquisition.json via a
  // COMPUTED path (path.join("runtime","generated",...)) that HAZARD_RE (literal "runtime/" only) cannot see. In the
  // phase-2 parallel pool they race each other (REPRODUCED: concurrent runs crash — incl. a safety-authorization test
  // misfiring on a sibling's artifact). Declared hazardous ⇒ serial phase-1, like consequential-executor-gate.
  // (external-research-live is incidentally serialized today by a .listen() in HAZARD_RE, but allowlisted here so the
  // serialization is INTENTIONAL and survives a refactor that drops the server.)
  "runtime-executor.external-research.test.ts",
  "runtime-executor.safe-probe-authorization.test.ts",
  "external-research-live.test.ts",
  // Same class again (found by a later frontier recon): these write/delete/restore REAL shared runtime/generated
  // artifacts via a COMPUTED path HAZARD_RE can't see — objective-evidence → runtime-verify.json; local-mission-
  // runner-ledger → mission-report.json + the real mission ledger; controlled-mission-live snapshots/restores FIVE
  // (mission-report, mission-ledger, mission-lifecycle, runtime-verify, pipeline-checkpoint) and appends to the real
  // ledger twice. In a parallel pool they race each other and any other suite reaching the same artifacts (the
  // mission-ledger read-modify-write is itself unlocked ⇒ lost-update, a bounded ephemeral-evidence loss gated today
  // only by the one-active-mission governance discipline, NOT a code-level lock — see the register follow-on). NOT in
  // CI's curated test:report set, and `npm test` is a SEQUENTIAL bash loop; the real exposure is a DEFAULT-GLOB
  // `odg-test-report --run` (no explicit files) with ODG_TEST_WORKERS>1, where defaultFiles() scans src/runtime/*.test.ts
  // and these 3 would land in the parallel pool. Declared hazardous so they ALWAYS serialize (phase-1), never parallel.
  "objective-evidence.test.ts",
  "local-mission-runner-ledger.test.ts",
  "controlled-mission-live.test.ts",
  // DIFFERENT rationale (not shared-state): a RESOURCE-HEAVY real-compiler suite. It runs real `go build` + `rustc`
  // + confined `tsc` compiles end-to-end (~65s wall, 0 skips when the toolchains are present, e.g. on CI). Each
  // confined compile is bounded at 20s (runSyntaxCheck timeoutMs). In the phase-2 parallel pool on a constrained
  // runner (GitHub Actions = 2–4 cores, workers clamped to that), the concurrent suites starve its compiles of CPU
  // and a cold confined `tsc`/`rustc` breaches 20s ⇒ timedOut ⇒ BLOCKED ⇒ the "legit single file still PASSes"
  // assertion (which REQUIRES a definitive PASS) flips to a false FAIL. REPRODUCED: green standalone/serial, red only
  // under parallel contention. Serialize it (phase-1) so each compile gets the whole runner — the compiles are the
  // real security control (cgo/include host-read closure), so they must run, not be skipped.
  "code-execution.test.ts",
]);
function suiteIsHazard(absFile: string): boolean {
  if (HAZARD_ALLOWLIST.has(path.basename(absFile))) return true; // declared-hazardous (computed repo-relative writes)
  let src = "";
  try { src = fs.readFileSync(absFile, "utf8"); } catch { return true; } // unreadable ⇒ serial (safe)
  return HAZARD_RE.test(src);
}

// Each parallel suite spawns a tsx process that may itself spawn compiler/checker subprocesses (go/rustc/javac/python).
// Default per-worker memory budget (MB) — overridable via ODG_TEST_WORKER_MEM_MB for tuning.
function perWorkerMb(): number { const m = parseInt(process.env.ODG_TEST_WORKER_MEM_MB || "", 10); return Number.isFinite(m) && m > 0 ? m : 900; }

/**
 * computeWorkers(requested, cpus, freeMb, perMb): PURE worker-count policy. Caps the requested count by BOTH the
 * measured cores AND available memory (freeMb / perMb) — the memory cap prevents the OOM-class flakiness observed
 * when heavy subprocess suites (validation-engine/reality-gate/compilers) run too concurrently. Never below 1.
 * Returns { workers, capped, reason }. A non-positive/non-finite request ⇒ serial (1).
 */
function computeWorkers(requested: number, cpus: number, freeMb: number, perMb: number): any {
  if (!Number.isFinite(requested) || requested <= 1) return { workers: 1, capped: false, reason: "serial (requested <= 1)" };
  const cpuCap = Math.max(1, Number.isFinite(cpus) ? cpus : 1);
  const memCap = Number.isFinite(freeMb) && freeMb > 0 && perMb > 0 ? Math.max(1, Math.floor(freeMb / perMb)) : Infinity;
  const workers = Math.max(1, Math.min(requested, cpuCap, memCap));
  const capped = workers < requested;
  return { workers, capped, reason: capped ? `requested ${requested} capped to ${workers} (cpuCap=${cpuCap}, memCap=${memCap === Infinity ? "n/a" : memCap} @ ${perMb}MB/worker) — avoiding memory-pressure flakiness` : "no cap" };
}

function parseWorkers(v: any): number {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 1) return 1;
  let cpus = 1; try { cpus = os.cpus().length || 1; } catch { cpus = 1; }
  let freeMb = Infinity; try { freeMb = os.freemem() / (1024 * 1024); } catch { freeMb = Infinity; }
  const r = computeWorkers(n, cpus, freeMb, perWorkerMb());
  if (r.capped) { try { process.stderr.write(`[odg-test-report] ${r.reason}\n`); } catch { /* ignore */ } }
  return r.workers;   // memory-aware + core-aware; never oversubscribe
}

/** Spawn one suite asynchronously in an isolated TMPDIR; resolves to the SAME shape as defaultRunner. */
function spawnSuiteAsync(file: string): Promise<any> {
  return new Promise((resolve) => {
    const tsx = path.join(ROOT, "node_modules", ".bin", "tsx");
    let tmp = "";
    try { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "odg-suite-")); } catch { tmp = ""; }
    const env = Object.assign({}, process.env);
    if (tmp) { env.TMPDIR = tmp; env.TMP = tmp; env.TEMP = tmp; }
    const cleanup = () => { if (tmp) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ } } };
    let out = "";
    const MAX = 8 * 1024 * 1024; // mirror defaultRunner maxBuffer
    const onData = (b: any) => { if (out.length < MAX) out += b.toString(); };
    let child: any;
    try { child = spawn(tsx, [file], { cwd: ROOT, env }); }
    catch { cleanup(); resolve({ exitCode: 1, stdout: "" }); return; }
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("close", (code: any) => { cleanup(); resolve({ exitCode: code == null ? 1 : code, stdout: out }); });
    child.on("error", () => { cleanup(); resolve({ exitCode: 1, stdout: out }); });
  });
}

/**
 * Parallel classified runner. Returns results in ORIGINAL input order; identical classification to runSuites.
 * `runner` is an injectable async suite-runner (default: real tsx child via spawnSuiteAsync) — the unit test
 * injects a deterministic one, exactly as runSuites accepts an injected sync runner.
 */
async function runSuitesParallel(files: string[], workers: number, runner?: any): Promise<any[]> {
  const run = typeof runner === "function" ? runner : spawnSuiteAsync;
  const indexed = files.map((file, i) => ({ file, i, exists: safeExists(file), hazard: true }));
  for (const e of indexed) e.hazard = e.exists ? suiteIsHazard(e.file) : true;
  const results: any[] = new Array(indexed.length);
  const record = (e: any, r: any) => {
    const { cls, reason } = classify({ exists: e.exists, exitCode: r.exitCode, stdout: r.stdout });
    results[e.i] = { file: e.file, exitCode: r.exitCode, cls, reason };
  };
  // phase 1 — hazardous suites, strictly sequential (never concurrent with anything).
  for (const e of indexed.filter((x) => x.hazard)) {
    const r = e.exists ? await run(e.file) : { exitCode: null, stdout: "" };
    record(e, r);
  }
  // phase 2 — hermetic suites, bounded concurrency, isolated TMPDIR each.
  const pool = indexed.filter((x) => !x.hazard);
  let next = 0;
  const worker = async () => { while (next < pool.length) { const e = pool[next++]; record(e, e.exists ? await run(e.file) : { exitCode: null, stdout: "" }); } };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(workers, pool.length || 1)) }, () => worker()));
  return results;
}

const REPORT_PATH = path.join(GEN, "test-report.json");

/** Load the persisted artifact (read-only). Returns {ok,report,path} or {ok:false,code,path}. */
function loadReport(file?: any): any {
  const p = file || REPORT_PATH;
  if (!safeExists(p)) return { ok: false, code: "ABSENT", path: p };
  let data;
  try { data = JSON.parse(fs.readFileSync(p, "utf8")); } catch { return { ok: false, code: "INVALID_JSON", path: p }; }
  if (!data || typeof data !== "object" || !data.summary || typeof data.summary !== "object" ||
      !Array.isArray(data.results) || typeof data.generatedAt !== "string") {
    return { ok: false, code: "INVALID_SHAPE", path: p };
  }
  return { ok: true, report: data, path: p };
}

/** Objective staleness: any tested suite's source file is newer than the report's generatedAt. */
function stalenessOf(report: any): any {
  const genMs = Date.parse(report.generatedAt);
  if (!Number.isFinite(genMs)) return { stale: true, reason: "unparseable generatedAt", newer: [] };
  const newer = [];
  for (const r of report.results) {
    const f: any = r && r.file; if (typeof f !== "string") continue;
    const abs = path.isAbsolute(f) ? f : path.join(ROOT, f);
    try { if (fs.statSync(abs).mtimeMs > genMs) newer.push(f); } catch { /* missing source not a staleness signal here */ }
  }
  return { stale: newer.length > 0, newer };
}

/*
 * Read-only artifact view (no suite run). Exit: 2 = absent/invalid; 1 = present-but-not-green OR stale;
 * 0 = present, valid, green, not stale. A stale/absent/non-green report is NEVER presented as valid proof.
 */
function renderShow(load: any, nowMs: any): any {
  const rule = "=".repeat(78);
  if (!load.ok) {
    return { exit: 2, text: [rule, "ODG TEST-REPORT (read-only artifact view)", rule,
      `NO VALID REPORT: ${load.code} at ${load.path}`,
      "An absent/invalid report is NOT valid proof. Generate one with: odg test-report --run [<suite>...]",
      rule].join("\n") };
  }
  const rep = load.report, s = rep.summary, c = s.counts || {};
  const stale = stalenessOf(rep);
  const greenRecorded = overallExit(s) === 0;
  const L = [rule, "ODG TEST-REPORT (read-only artifact view)", rule];
  L.push(`provenance : ${load.path}`);
  L.push(`generatedAt: ${rep.generatedAt}`);
  if (Number.isFinite(nowMs)) L.push(`age        : ${Math.round((nowMs - Date.parse(rep.generatedAt)) / 60000)} min`);
  L.push(`suites     : total=${s.total} PASS=${c.PASS || 0} FAIL=${c.FAIL || 0} BLOCKED=${c.BLOCKED_BY_ISOLATION || 0} SKIPPED=${c.SKIPPED || 0} NOT_RUN=${c.NOT_RUN || 0}`);
  L.push(`recorded   : ${greenRecorded ? "GREEN (no FAIL, nothing blocked)" : "NOT GREEN (FAIL and/or BLOCKED present)"}`);
  if (stale.stale) L.push(`STALE      : ${stale.newer && stale.newer.length ? stale.newer.length + " tested source(s) newer than the report — re-run before trusting" : (stale.reason || "stale")}`);
  L.push(rule);
  return { exit: (!greenRecorded || stale.stale) ? 1 : 0, text: L.join("\n") };
}

/** Run the classifier on an explicit suite list and persist the artifact. Parallel iff ODG_TEST_WORKERS>1. */
async function runAndWrite(files: any): Promise<number> {
  const abs = files.map((f: any) => path.isAbsolute(f) ? f : path.join(ROOT, f));
  const workers = parseWorkers(process.env.ODG_TEST_WORKERS);
  const results = workers > 1 ? await runSuitesParallel(abs, workers) : runSuites(abs);
  const summary = summarize(results);
  console.log(renderReport(summary, results));
  try {
    fs.mkdirSync(GEN, { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), summary, results }, null, 2));
  } catch { /* evidence best-effort; never alters the verdict */ }
  return overallExit(summary);
}

/*
 * CLI modes: no args | --show → read-only artifact view (NEVER runs a suite — safe default for the
 * dispatcher). `--run [<suite>...]` → classify the given suites (or the default set) and persist.
 * An explicit suite list with no mode flag also runs (back-compat with `npm run test:report`).
 */
async function main(argv: any): Promise<number> {
  const mode = argv[0];
  if (argv.length === 0 || mode === "--show") { const o = renderShow(loadReport(), Date.now()); console.log(o.text); return o.exit; }
  if (mode === "--run") { const f = argv.slice(1); return await runAndWrite(f.length > 0 ? f : defaultFiles()); }
  return await runAndWrite(argv);
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}

module.exports = { classify, runSuites, suiteIsHazard, parseWorkers, computeWorkers, runSuitesParallel, summarize, overallExit, renderReport, defaultFiles, loadReport, stalenessOf, renderShow, runAndWrite, main, CLASSES };

export {};
