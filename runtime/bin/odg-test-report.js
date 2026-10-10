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
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const GEN = path.join(ROOT, "runtime", "generated");
const DECL = /##CLASS:\s*(BLOCKED_BY_ISOLATION|SKIPPED)\b[ \t]*(.*)/;

/** Pure classification from a suite's observed outcome. */
function classify({ exists, exitCode, stdout }) {
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
function runSuites(files, runner) {
  const run = typeof runner === "function" ? runner : defaultRunner;
  return files.map((file) => {
    const exists = safeExists(file);
    const r = exists ? run(file) : { exitCode: null, stdout: "" };
    const { cls, reason } = classify({ exists, exitCode: r.exitCode, stdout: r.stdout });
    return { file, exitCode: r.exitCode, cls, reason };
  });
}

function safeExists(f) {
  try { return fs.existsSync(f); } catch { return false; }
}

function defaultRunner(file) {
  const tsx = path.join(ROOT, "node_modules", ".bin", "tsx");
  const r = spawnSync(tsx, [file], { cwd: ROOT, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  return { exitCode: r.status == null ? 1 : r.status, stdout: (r.stdout || "") + (r.stderr || "") };
}

const CLASSES = ["PASS", "SKIPPED", "BLOCKED_BY_ISOLATION", "FAIL", "NOT_RUN"];

/** Aggregate results into honest counts + per-class file lists. */
function summarize(results) {
  const counts = Object.fromEntries(CLASSES.map((c) => [c, 0]));
  const byClass = Object.fromEntries(CLASSES.map((c) => [c, []]));
  for (const r of results) { counts[r.cls] += 1; byClass[r.cls].push(r.file); }
  return { total: results.length, counts, byClass };
}

/** Overall exit code: 0 ONLY if no genuine FAIL and no BLOCKED_BY_ISOLATION (blocked is never PASS). */
function overallExit(summary) {
  return summary.counts.FAIL === 0 && summary.counts.BLOCKED_BY_ISOLATION === 0 ? 0 : 1;
}

function renderReport(summary, results) {
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
    for (const r of results.filter((x) => x.cls === cls)) {
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

function defaultFiles() {
  const globs = [["src", "tests"], ["src", "runtime"], ["runtime", "core"]];
  const out = [];
  for (const [a, b] of globs) {
    const dir = path.join(ROOT, a, b);
    let names = [];
    try { names = fs.readdirSync(dir); } catch { names = []; }
    for (const n of names) if (/\.test\.(ts|js)$/.test(n)) out.push(path.join(a, b, n));
  }
  const cockpit = path.join("runtime", "bin", "odg-cockpit.test.js");
  if (safeExists(path.join(ROOT, cockpit))) out.push(cockpit);
  return out.sort();
}

function main(argv) {
  const files = argv.length > 0 ? argv : defaultFiles();
  const results = runSuites(files.map((f) => path.isAbsolute(f) ? f : path.join(ROOT, f)));
  const summary = summarize(results);
  const report = renderReport(summary, results);
  console.log(report);
  try {
    fs.mkdirSync(GEN, { recursive: true });
    fs.writeFileSync(path.join(GEN, "test-report.json"),
      JSON.stringify({ generatedAt: new Date().toISOString(), summary, results }, null, 2));
  } catch { /* evidence best-effort; never alters the verdict */ }
  return overallExit(summary);
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { classify, runSuites, summarize, overallExit, renderReport, defaultFiles, CLASSES };
