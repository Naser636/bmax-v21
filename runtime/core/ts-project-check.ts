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
// The TypeScript package dir (holds bin/tsc + lib/lib.*.d.ts). Bound read-only into the sandbox so the real
// compiler + its standard libs resolve, and NOTHING else of the host filesystem does.
const TS_PKG_DIR: string | null = TSC_PATH ? path.resolve(path.dirname(TSC_PATH), "..") : null;
// Inside the sandbox the reviewed project is always bound at this fixed path (never its host path) — so a
// malicious `/// <reference path="/host/secret">` cannot resolve, and diagnostics never echo a host path.
const SANDBOX_PROJECT = "/project";
const SYSTEM_RO = ["/usr", "/lib", "/lib64", "/bin", "/sbin"];

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function truncate(s: any, n = 4000): string { const str = String(s == null ? "" : s); return str.length > n ? str.slice(0, n) + "…[truncated]" : str; }

/** bwrap present? The confined compiler run is FAIL-CLOSED on its absence (never runs tsc unconfined). */
function bwrapPath(): string | null {
  try {
    const r = cp.spawnSync("/usr/bin/env", ["sh", "-c", "command -v bwrap"], { encoding: "utf8" });
    const p = r && r.status === 0 ? String(r.stdout || "").trim() : "";
    return p || null;
  } catch { return null; }
}

/**
 * defaultRunner: run the REAL `node <tsc> …` but CONFINED in bubblewrap so a reviewed project (untrusted input)
 * cannot read any file outside itself. SECURITY (fixes an audited sandbox-escape): plain `tsc` follows
 * `/// <reference path="…">`, `import`, tsconfig `extends/references`, etc. to ANY host path the process can read,
 * and echoes the referenced file's CONTENT verbatim into diagnostics (→ the review's `evidence`) — arbitrary host
 * file read + exfiltration. We bind ONLY: system CODE dirs (ro), the typescript package (ro), and the project at a
 * fixed /project path (ro); everything else is absent, so an out-of-project reference fails to resolve (TS6053) with
 * NO content leak. FAIL-CLOSED: if bubblewrap is unavailable we refuse (spawnError) rather than run tsc unconfined.
 * opts.cwd = the host project dir (bound → /project). No cwd (e.g. the --version probe) ⇒ no project bind.
 */
function defaultRunner(args: string[], opts: any): any {
  if (!TSC_PATH || !TS_PKG_DIR) return { spawnError: "typescript compiler not resolvable (typescript/bin/tsc absent)" };
  const bwrap = bwrapPath();
  if (!bwrap) return { spawnError: "sandbox unavailable (bubblewrap required to run the code-review compiler confined); refusing to run tsc unconfined" };

  const bw: string[] = ["--unshare-all", "--die-with-parent", "--new-session", "--clearenv",
    "--setenv", "PATH", "/usr/bin:/bin", "--setenv", "HOME", "/tmp"];
  for (const p of SYSTEM_RO) { if (fs.existsSync(p)) bw.push("--ro-bind", p, p); }
  // The compiler is invoked below as `process.execPath <tsc>`. process.execPath may live OUTSIDE SYSTEM_RO
  // (GitHub Actions /opt/hostedtoolcache, nvm, volta, a self-built node) — then the sandboxed `node` is
  // "No such file or directory" (execvp) and a LEGIT project wrongly reports BLOCKED/FAIL. Bind the node binary
  // itself read-only when it is not already under a bound system dir. (Masked locally where node is /usr/bin/node.)
  if (!SYSTEM_RO.some((d) => process.execPath === d || process.execPath.startsWith(d + "/"))) {
    bw.push("--ro-bind", process.execPath, process.execPath);
  }
  bw.push("--ro-bind", TS_PKG_DIR, TS_PKG_DIR);
  let innerArgs = args;
  if (opts && typeof opts.cwd === "string" && opts.cwd) {
    bw.push("--ro-bind", opts.cwd, SANDBOX_PROJECT);
  }
  bw.push("--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp");
  bw.push("--chdir", opts && opts.cwd ? SANDBOX_PROJECT : "/tmp");
  bw.push("--", process.execPath, TSC_PATH, ...innerArgs);

  const res = cp.spawnSync(bwrap, bw, {
    timeout: opts.timeoutMs, maxBuffer: opts.maxBytes, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
  if (res.error) { if ((res.error as any).code === "ETIMEDOUT") return { timedOut: true }; return { spawnError: (res.error as any).message || "spawn error" }; }
  return { exitCode: res.status, stdout: res.stdout || "", stderr: res.stderr || "" };
}

/** tscAvailable(runner?): is a real project compiler usable? (resolved path + a clean --version probe). */
function tscAvailable(opts: any = {}): boolean {
  const injected = typeof opts.runner === "function";
  const runner = injected ? opts.runner : defaultRunner;
  if (!injected && !TSC_PATH) return false;
  // Strict exit 0 for the real runner (res.status is null on signal-kill ⇒ NOT available); tolerate undefined/null
  // only for an injected test runner. (Fail-toward-available guard — a signal-killed probe must not read as usable.)
  try { const r = runner(["--version"], { timeoutMs: 8000, maxBytes: 1_000_000 }); return !!r && !r.spawnError && !r.timedOut && (r.exitCode === 0 || (injected && (r.exitCode === undefined || r.exitCode === null))); }
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
  // The compiler runs CONFINED with the project bound at a fixed /project path, so the tsconfig must be addressed
  // RELATIVE to the project dir and must live INSIDE it. A tsconfig outside the project cannot be confined ⇒ BLOCKED
  // (never a PASS, never an unconfined run). path.relative yielding a ".." or absolute prefix means "outside".
  const tsconfigRel = path.relative(projectDir, tsconfigAbs);
  if (tsconfigRel.startsWith("..") || path.isAbsolute(tsconfigRel)) {
    return { status: "BLOCKED", reason: `tsconfig must live inside projectDir to be checked confined (got ${tsconfig})`, tsconfig };
  }

  const r = runner(["--noEmit", "-p", tsconfigRel], { cwd: projectDir, timeoutMs: Number(input.timeoutMs) || 120000, maxBytes: 8_000_000 });
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
