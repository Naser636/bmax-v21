#!/usr/bin/env node
/**
 * code-execution — V45 Lot B: a BOUNDED, isolated, multi-language toolchain-check capability. It runs a REAL compiler/
 * syntax checker (node --check, tsc --noEmit, python3 -m py_compile) on a supplied file in an ISOLATED temp workspace
 * and classifies PASS / FAIL / UNSUPPORTED / BLOCKED. This is a genuine executable VERIFICATION path across languages
 * (a real expansion beyond TS/JS to Python) — NOT a code-synthesis/repair agent (ODG does not fabricate fixes).
 *
 * SAFETY (mandate): argv arrays only (no shell string ⇒ no injection); isolated mkdtemp workspace; connect timeout +
 * output byte cap; minimal env (no inherited secrets beyond PATH/HOME); no network use; temp cleaned up. The command
 * runner is INJECTABLE (opts.runner) so gated tests are deterministic with ZERO subprocess; the default runs the real
 * bounded tool. UNSUPPORTED when the language is unknown or its toolchain is absent (never faked). Fail-closed.
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

// Resolve the REAL TypeScript compiler (node_modules/typescript/bin/tsc). `npx tsc` is NOT used: in a minimal-env
// isolated workspace it can resolve to an unrelated decoy `tsc` package that exits non-zero on everything (a real
// false-FAIL defect caught by code-check-eval). When the real compiler is unresolvable we point at a definitely-
// absent binary so the toolchain probe fails ⇒ TypeScript is honestly UNSUPPORTED (never a spuriously-available decoy).
let TSC_PATH: string | null = null;
try { TSC_PATH = require.resolve("typescript/bin/tsc"); } catch { TSC_PATH = null; }
const TS_BIN = TSC_PATH ? process.execPath : "__odg_tsc_absent__";
const TS_PROBE = TSC_PATH ? [TSC_PATH, "--version"] : ["--version"];
const TS_ARGS = (f: string) => TSC_PATH ? [TSC_PATH, "--noEmit", "--skipLibCheck", f] : ["--noEmit", f];

// Supported checkers. A language is only ACTIONABLE here if its binary (and, for library-backed checkers, its module)
// is actually present — PROBED per-capability, never assumed. The Shell/SQL/YAML/JSON checkers below use tooling that
// is ALREADY installed (bash, python3 stdlib sqlite3/json, PyYAML) — i.e. a real capability expansion that needs NO
// network install. Go/build below uses the AUTHORIZED, installed Go toolchain (`go build`) run hermetically (cache/tmp
// scoped into the isolated workspace, modules + proxy OFF ⇒ no network: a non-stdlib import fails closed, never fetches).
// The remaining compiler stacks (Rust/Java/C#) stay deliberately ABSENT: they require their own authorized toolchain
// install and remain honestly UNSUPPORTED until then (never a spuriously-available decoy).
const LANG_SPEC: Readonly<Record<string, any>> = Object.freeze({
  JavaScript: { bin: "node", probeArgs: ["--version"], args: (f: string) => ["--check", f], ext: ".js" },
  TypeScript: { bin: TS_BIN, probeArgs: TS_PROBE, args: TS_ARGS, ext: ".ts" },
  Python: { bin: "python3", probeArgs: ["--version"], args: (f: string) => ["-m", "py_compile", f], ext: ".py" },
  // Shell SYNTAX validation via `bash -n` (no execution of the script).
  Shell: { bin: "bash", probeArgs: ["--version"], args: (f: string) => ["-n", f], ext: ".sh" },
  // Shell LINT (static analysis) via shellcheck — stronger than bash -n; exit!=0 on any finding. Probe fails ⇒ UNSUPPORTED.
  ShellLint: { bin: "shellcheck", probeArgs: ["--version"], args: (f: string) => [f], ext: ".sh" },
  // SQL/schema validation: parse+apply the DDL against an in-memory SQLite db (stdlib; no file/network side effects).
  SQL: { bin: "python3", probeArgs: ["-c", "import sqlite3"], args: (f: string) => ["-c", "import sys,sqlite3; sqlite3.connect(':memory:').executescript(open(sys.argv[1]).read())", f], ext: ".sql" },
  // YAML validation via PyYAML safe_load_all (probe fails ⇒ UNSUPPORTED if PyYAML is not installed).
  YAML: { bin: "python3", probeArgs: ["-c", "import yaml"], args: (f: string) => ["-c", "import sys,yaml; list(yaml.safe_load_all(open(sys.argv[1]).read()))", f], ext: ".yaml" },
  // JSON config validation via stdlib json (always available with python3).
  JSON: { bin: "python3", probeArgs: ["-c", "import json"], args: (f: string) => ["-c", "import sys,json; json.load(open(sys.argv[1]))", f], ext: ".json" },
  // Go/build: a REAL compile check via the authorized Go toolchain — stronger than a syntax parse (catches type errors,
  // undefined refs). Run HERMETICALLY: GOCACHE/GOPATH/GOTMPDIR scoped INTO the isolated workspace (self-cleaning), and
  // GO111MODULE=off + GOPROXY=off + GOTOOLCHAIN=local so a non-stdlib import fails CLOSED (no network, no download, no
  // auto-toolchain fetch). Output is discarded (-o os.devNull). Probe fails ⇒ Go honestly UNSUPPORTED (never a decoy).
  Go: {
    bin: "go", probeArgs: ["version"], ext: ".go",
    args: (f: string) => ["build", "-o", os.devNull, f],
    env: (dir: string) => ({
      GOCACHE: path.join(dir, ".gocache"), GOPATH: path.join(dir, ".gopath"), GOTMPDIR: dir,
      GO111MODULE: "off", GOPROXY: "off", GOFLAGS: "-mod=mod", GOTOOLCHAIN: "local",
    }),
  },
});

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function truncate(s: any, n = 800): string { const str = String(s || ""); return str.length > n ? str.slice(0, n) + "…[truncated]" : str; }

/** defaultRunner: bounded spawnSync — argv array, timeout, output cap, minimal env, no shell. */
function defaultRunner(bin: string, args: string[], opts: any): any {
  const res = cp.spawnSync(bin, args, {
    cwd: opts.cwd, timeout: opts.timeoutMs, maxBuffer: opts.maxBytes, encoding: "utf8",
    // Minimal base env (no inherited secrets); a checker spec may add bounded, hermetic vars (e.g. Go's offline
    // cache/proxy settings) via opts.env — never PATH/HOME-overriding beyond what the spec explicitly sets.
    env: { PATH: process.env.PATH || "", HOME: process.env.HOME || "", ...(opts.env && typeof opts.env === "object" ? opts.env : {}) }, stdio: ["ignore", "pipe", "pipe"],
  });
  if (res.error) { if ((res.error as any).code === "ETIMEDOUT") return { timedOut: true }; return { spawnError: (res.error as any).message || "spawn error" }; }
  return { exitCode: res.status, stdout: res.stdout || "", stderr: res.stderr || "" };
}

/** detectToolchain(opts?): which supported languages have an available binary. probe injectable (tests). */
function detectToolchain(opts: any = {}): Record<string, boolean> {
  const runner = typeof opts.runner === "function" ? opts.runner : defaultRunner;
  const out: Record<string, boolean> = {};
  for (const [lang, spec] of Object.entries(LANG_SPEC)) {
    // Require a CLEAN probe: spawned AND exit 0. A non-zero `--version` (e.g. a decoy binary) ⇒ NOT available (honest).
    try { const r = runner((spec as any).bin, (spec as any).probeArgs, { timeoutMs: 8000, maxBytes: 1_000_000 }); out[lang] = !!r && !r.spawnError && !r.timedOut && (r.exitCode === 0 || r.exitCode === undefined || r.exitCode === null); }
    catch { out[lang] = false; }
  }
  return out;
}

/**
 * runSyntaxCheck({ language, filename, content, runner, toolchainAvailable }): run the REAL checker in an isolated temp
 * dir. Returns { status, exitCode?, stderr?, detail }. UNSUPPORTED (unknown lang / toolchain absent) ⇒ never faked.
 */
function runSyntaxCheck(input: any = {}): any {
  const language = String(input.language || "");
  const spec = LANG_SPEC[language];
  if (!spec) return { status: "UNSUPPORTED", reason: `language '${language || "(none)"}' has no verified checker in ODG`, language };
  if (typeof input.content !== "string") return { status: "BLOCKED", reason: "file content (string) required" };
  const runner = typeof input.runner === "function" ? input.runner : defaultRunner;
  // Toolchain availability: explicit override (tests) OR probe.
  const available = typeof input.toolchainAvailable === "boolean" ? input.toolchainAvailable : (detectToolchain({ runner }))[language] === true;
  if (!available) return { status: "UNSUPPORTED", reason: `toolchain for '${language}' is not available in this runtime — detection only, execution not faked`, language };

  let dir: string | null = null;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-codeexec-"));
    const file = path.join(dir, (typeof input.filename === "string" && input.filename) ? path.basename(input.filename) : `src${spec.ext}`);
    fs.writeFileSync(file, input.content);
    // A spec may declare hermetic env scoped to THIS workspace dir (e.g. Go's offline cache/proxy) — computed per run.
    const specEnv = typeof spec.env === "function" ? spec.env(dir) : (spec.env && typeof spec.env === "object" ? spec.env : undefined);
    const r = runner(spec.bin, spec.args(file), { cwd: dir, timeoutMs: Number(input.timeoutMs) || 20000, maxBytes: 2_000_000, ...(specEnv ? { env: specEnv } : {}) });
    if (!r || r.spawnError) return { status: "BLOCKED", reason: `toolchain spawn error: ${r && r.spawnError}`, language };
    if (r.timedOut) return { status: "BLOCKED", reason: "check timed out", language };
    const exitCode = r.exitCode;
    const stderr = truncate(String(r.stderr || "").split(String(dir)).join("<ws>"));   // strip the temp path
    return exitCode === 0
      ? { status: "PASS", exitCode, language, detail: `${spec.bin} check passed` }
      : { status: "FAIL", exitCode, language, stderr, detail: `${spec.bin} reported an error (exit ${exitCode})` };
  } catch (e: any) {
    return { status: "BLOCKED", reason: (e && e.message) || "execution error", language };
  } finally {
    if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
  }
}

export { LANG_SPEC, defaultRunner, detectToolchain, runSyntaxCheck };
module.exports = { LANG_SPEC, defaultRunner, detectToolchain, runSyntaxCheck };

if (require.main === module) {
  process.stdout.write(JSON.stringify({ toolchain: detectToolchain(), supported: Object.keys(LANG_SPEC) }, null, 2) + "\n");
}
