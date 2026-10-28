#!/usr/bin/env node
/**
 * ts-project-check — V55 Priority 2: a PROJECT-AWARE TypeScript checker that respects imports, tsconfig, included
 * files, paths and real types — unlike code-execution's single-file `tsc` check (which is unsound for files WITH
 * imports). It runs the REAL compiler in PROJECT mode: `node <typescript/bin/tsc> --noEmit -p <tsconfig>` with
 * cwd = the project dir, so cross-file imports and config are honoured. Classifies:
 *   PASS         — tsc exits 0 over the project (imports + types valid).
 *   FAIL         — tsc exits non-zero WITH diagnostics (type error / missing import / symbol / bad config it parsed).
 *   BLOCKED      — compiler unresolved/unavailable, timeout, spawn error, or no tsconfig ⇒ NEVER a PASS.
 * A tool absence, timeout, or incomplete check can NEVER become PASS (fail-closed). The runner is injectable for
 * deterministic gated tests; the default runs the real bounded compiler. No new primitive; reuses the resolved tsc.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const cp = require("child_process");

let TSC_PATH: string | null = null;
try { TSC_PATH = require.resolve("typescript/bin/tsc"); } catch { TSC_PATH = null; }

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function truncate(s: any, n = 4000): string { const str = String(s == null ? "" : s); return str.length > n ? str.slice(0, n) + "…[truncated]" : str; }

/** defaultRunner: bounded spawnSync of `node <tsc> …` — argv array, cwd, timeout, output cap, minimal env, no shell. */
function defaultRunner(args: string[], opts: any): any {
  if (!TSC_PATH) return { spawnError: "typescript compiler not resolvable (typescript/bin/tsc absent)" };
  const res = cp.spawnSync(process.execPath, [TSC_PATH, ...args], {
    cwd: opts.cwd, timeout: opts.timeoutMs, maxBuffer: opts.maxBytes, encoding: "utf8",
    env: { PATH: process.env.PATH || "", HOME: process.env.HOME || "" }, stdio: ["ignore", "pipe", "pipe"],
  });
  if (res.error) { if ((res.error as any).code === "ETIMEDOUT") return { timedOut: true }; return { spawnError: (res.error as any).message || "spawn error" }; }
  return { exitCode: res.status, stdout: res.stdout || "", stderr: res.stderr || "" };
}

/** tscAvailable(runner?): is a real project compiler usable? (resolved path + a clean --version probe). */
function tscAvailable(opts: any = {}): boolean {
  const runner = typeof opts.runner === "function" ? opts.runner : defaultRunner;
  if (typeof opts.runner !== "function" && !TSC_PATH) return false;
  try { const r = runner(["--version"], { timeoutMs: 8000, maxBytes: 1_000_000 }); return !!r && !r.spawnError && !r.timedOut && (r.exitCode === 0 || r.exitCode === undefined || r.exitCode === null); }
  catch { return false; }
}

/**
 * checkTsProject({ projectDir, tsconfig?, runner?, timeoutMs? }): run the real project-mode type check. Returns
 * { status, exitCode?, diagnostics?, errorCount?, detail }. Fail-closed: anything short of a clean exit-0 over a
 * real tsconfig is NOT a PASS.
 */
function checkTsProject(input: any = {}): any {
  if (!isObj(input) || typeof input.projectDir !== "string") return { status: "BLOCKED", reason: "projectDir (string) required" };
  const projectDir = input.projectDir;
  if (!fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) return { status: "BLOCKED", reason: "projectDir must be an existing directory" };
  const runner = typeof input.runner === "function" ? input.runner : defaultRunner;

  if (!tscAvailable({ runner })) return { status: "BLOCKED", reason: "TypeScript compiler unavailable (no PASS without a real checker)" };

  const tsconfig = typeof input.tsconfig === "string" && input.tsconfig ? input.tsconfig : "tsconfig.json";
  const tsconfigAbs = path.isAbsolute(tsconfig) ? tsconfig : path.join(projectDir, tsconfig);
  if (!fs.existsSync(tsconfigAbs)) return { status: "BLOCKED", reason: `tsconfig not found at ${tsconfig} — cannot prove project validity`, tsconfig };

  const r = runner(["--noEmit", "-p", tsconfig], { cwd: projectDir, timeoutMs: Number(input.timeoutMs) || 120000, maxBytes: 8_000_000 });
  if (!r || r.spawnError) return { status: "BLOCKED", reason: `compiler spawn error: ${r && r.spawnError}` };
  if (r.timedOut) return { status: "BLOCKED", reason: "type check timed out (incomplete ⇒ not PASS)" };
  const out = truncate(String(r.stdout || "") + String(r.stderr || ""));
  if (r.exitCode === 0) return { status: "PASS", exitCode: 0, detail: "tsc --noEmit project check passed (imports + types valid)" };
  // Non-zero: a real project type/import/config error. Count TSxxxx diagnostics for the report.
  const errorCount = (out.match(/error TS\d+/g) || []).length;
  return { status: "FAIL", exitCode: r.exitCode, errorCount, diagnostics: out, detail: `tsc reported ${errorCount || "one or more"} error(s) (exit ${r.exitCode})` };
}

export { checkTsProject, tscAvailable, defaultRunner, TSC_PATH };
module.exports = { checkTsProject, tscAvailable, defaultRunner, TSC_PATH };

if (require.main === module) {
  process.stdout.write(JSON.stringify(checkTsProject({ projectDir: process.argv[2] || process.cwd(), tsconfig: process.argv[3] }), null, 2) + "\n");
}
