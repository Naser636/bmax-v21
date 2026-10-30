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
// The typescript package dir (bin/tsc + lib/*.d.ts). Bound read-only into the TS checker's sandbox so the compiler +
// its standard libs resolve while the host filesystem does not (TSC_PATH lives under the repo, not /usr).
const TS_PKG_DIR: string | null = TSC_PATH ? path.resolve(path.dirname(TSC_PATH), "..") : null;
const TS_BIN = TSC_PATH ? process.execPath : "__odg_tsc_absent__";
const TS_PROBE = TSC_PATH ? [TSC_PATH, "--version"] : ["--version"];
const TS_ARGS = (f: string) => TSC_PATH ? [TSC_PATH, "--noEmit", "--skipLibCheck", f] : ["--noEmit", f];
// Rust runs CONFINED (confine:true). A bare `rustc` relies on PATH=/usr/bin:/bin inside the sandbox AND on its sysroot
// (std rlibs + codegen libs) being present. On an apt rustc the sysroot is /usr (already bound) — fine. On a rustup
// host (e.g. GitHub Actions: rustc 1.99.x) the on-PATH `rustc` is a PROXY that resolves the real toolchain via
// ~/.rustup, and the sysroot lives UNDER ~/.rustup/toolchains/<ver> — NOT bound ⇒ confined rustc can't find `std` and
// even LEGIT Rust fails to compile (a false FAIL, reproduced on CI). Resolve the sysroot once and (a) invoke the REAL
// toolchain binary <sysroot>/bin/rustc directly (no proxy ⇒ no RUSTUP_HOME dependence) and (b) bind the sysroot dir
// read-only so std + the codegen backend resolve. The sysroot is toolchain code, not host secrets — binding it does
// NOT weaken the include!/aliased-include host-read confinement (those target other paths like /etc or /tmp). Probe
// failure ⇒ RUST_SYSROOT null ⇒ fall back to bare "rustc" (and BLOCKED/UNSUPPORTED if unresolvable), never unconfined.
const RUST_SYSROOT: string | null = (() => {
  try { const r = cp.spawnSync("rustc", ["--print", "sysroot"], { encoding: "utf8", timeout: 8000 }); return r && r.status === 0 ? String(r.stdout || "").trim() || null : null; }
  catch { return null; }
})();
const RUST_BIN: string = RUST_SYSROOT && fs.existsSync(path.join(RUST_SYSROOT, "bin", "rustc")) ? path.join(RUST_SYSROOT, "bin", "rustc") : "rustc";

// Pure, NO-INSTALL Dockerfile STRUCTURAL lint — a conservative SUBSET of hadolint (structure only, NOT style/best-
// practice rules): the first instruction (ignoring comments, parser directives, blank lines and leading ARGs, which
// Docker permits before FROM) must be FROM, and every instruction keyword must be a valid Dockerfile instruction.
// In-process, deterministic, no subprocess/network ⇒ available with ZERO toolchain install (hadolint, when installed,
// remains the richer check). Returns { ok, errors }. A genuine capability, honestly scoped as "structural".
const DOCKERFILE_INSTRUCTIONS = Object.freeze(new Set(["FROM", "RUN", "CMD", "LABEL", "MAINTAINER", "EXPOSE", "ENV", "ADD", "COPY", "ENTRYPOINT", "VOLUME", "USER", "WORKDIR", "ARG", "ONBUILD", "STOPSIGNAL", "HEALTHCHECK", "SHELL"]));
function dockerfileStructuralLint(content: string): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const raw = String(content == null ? "" : content).split(/\r?\n/);
  // Join line continuations: a line ending with a trailing backslash continues onto the next physical line.
  const lines: Array<{ text: string; n: number }> = [];
  let buf = "", startN = 0;
  raw.forEach((ln, i) => {
    if (buf === "") startN = i + 1;
    const cont = /\\\s*$/.test(ln);
    buf += (buf ? " " : "") + ln.replace(/\\\s*$/, "");
    if (!cont) { lines.push({ text: buf, n: startN }); buf = ""; }
  });
  if (buf !== "") lines.push({ text: buf, n: startN });
  let sawFrom = false, sawInstruction = false;
  for (const { text, n } of lines) {
    const t = text.trim();
    if (t === "" || t.startsWith("#")) continue;                 // blank / comment / parser directive
    const first = t.split(/\s+/)[0] || "";
    const kw = first.toUpperCase();
    if (!DOCKERFILE_INSTRUCTIONS.has(kw)) { errors.push(`line ${n}: unknown Dockerfile instruction '${first}'`); sawInstruction = true; continue; }
    if (!sawFrom && kw !== "FROM" && kw !== "ARG") {
      errors.push(`line ${n}: first instruction must be FROM (got '${kw}'); only comments, parser directives and ARG may precede it`);
    }
    if (kw === "FROM") sawFrom = true;
    sawInstruction = true;
  }
  if (!sawInstruction) errors.push("empty Dockerfile: no instructions");
  else if (!sawFrom) errors.push("no FROM instruction: a Dockerfile must declare a base image");
  return { ok: errors.length === 0, errors };
}

// Supported checkers. A language is only ACTIONABLE here if its binary (and, for library-backed checkers, its module)
// is actually present — PROBED per-capability, never assumed. The Shell/SQL/YAML/JSON checkers below use tooling that
// is ALREADY installed (bash, python3 stdlib sqlite3/json, PyYAML) — i.e. a real capability expansion that needs NO
// network install. Go/build below uses the AUTHORIZED, installed Go toolchain (`go build`) run hermetically (cache/tmp
// scoped into the isolated workspace, modules + proxy OFF ⇒ no network: a non-stdlib import fails closed, never fetches).
// The remaining compiler stacks (Rust/Java/C#) stay deliberately ABSENT: they require their own authorized toolchain
// install and remain honestly UNSUPPORTED until then (never a spuriously-available decoy).
const LANG_SPEC: Readonly<Record<string, any>> = Object.freeze({
  JavaScript: { bin: "node", probeArgs: ["--version"], args: (f: string) => ["--check", f], ext: ".js" },
  // SECURITY: a single reviewed .ts with `/// <reference path="/abs">` makes tsc read that host file (the single-file
  // analogue of the F3 project-mode escape). Run CONFINED (confine:true) — binding the typescript pkg (roBinds) +
  // workspace + system dirs only — so no out-of-workspace reference resolves. Fail-closed BLOCKED if bwrap absent.
  TypeScript: { bin: TS_BIN, probeArgs: TS_PROBE, args: TS_ARGS, ext: ".ts", confine: true, roBinds: TS_PKG_DIR ? [TS_PKG_DIR] : [] },
  Python: { bin: "python3", probeArgs: ["--version"], args: (f: string) => ["-m", "py_compile", f], ext: ".py" },
  // Shell SYNTAX validation via `bash -n` (no execution of the script).
  Shell: { bin: "bash", probeArgs: ["--version"], args: (f: string) => ["-n", f], ext: ".sh" },
  // Shell LINT (static analysis) via shellcheck — stronger than bash -n; exit!=0 on any finding. Probe fails ⇒ UNSUPPORTED.
  ShellLint: { bin: "shellcheck", probeArgs: ["--version"], args: (f: string) => [f], ext: ".sh" },
  // SQL/schema validation: parse+apply the DDL against an in-memory SQLite db (stdlib; no file/network side effects).
  // SQL: SYNTAX check ONLY. Runs the script against an IN-MEMORY db with an authorizer that DENIES ATTACH/DETACH (which
  // also blocks VACUUM INTO, since it authorizes internally as ATTACH) — so a reviewed .sql can NEVER create/write a file
  // on disk. Closes a real arbitrary-file-write: "ATTACH DATABASE '<path>' AS x; CREATE TABLE x.t..." / "VACUUM INTO
  // '<path>'" in a .sql fed to the "read-only" code-review checker previously wrote that file. Legit DDL/DML still
  // validate in memory; bad syntax still fails. (No file/network side effects — now true to the contract.)
  SQL: { bin: "python3", probeArgs: ["-c", "import sqlite3"], args: (f: string) => ["-c", "import sys,sqlite3; c=sqlite3.connect(':memory:'); c.set_authorizer(lambda a,*x: sqlite3.SQLITE_DENY if a in (sqlite3.SQLITE_ATTACH, sqlite3.SQLITE_DETACH) else sqlite3.SQLITE_OK); c.executescript(open(sys.argv[1]).read())", f], ext: ".sql" },
  // YAML validation via PyYAML safe_load_all (probe fails ⇒ UNSUPPORTED if PyYAML is not installed).
  YAML: { bin: "python3", probeArgs: ["-c", "import yaml"], args: (f: string) => ["-c", "import sys,yaml; list(yaml.safe_load_all(open(sys.argv[1]).read()))", f], ext: ".yaml" },
  // JSON config validation via stdlib json (always available with python3).
  JSON: { bin: "python3", probeArgs: ["-c", "import json"], args: (f: string) => ["-c", "import sys,json; json.load(open(sys.argv[1]))", f], ext: ".json" },
  // TOML validation via stdlib tomllib (py3.11+). STDLIB-only ⇒ no install needed where python3 is present.
  TOML: { bin: "python3", probeArgs: ["-c", "import tomllib"], args: (f: string) => ["-c", "import sys,tomllib; tomllib.load(open(sys.argv[1],'rb'))", f], ext: ".toml" },
  // XML well-formedness via stdlib xml.dom.minidom (always available with python3).
  XML: { bin: "python3", probeArgs: ["-c", "import xml.dom.minidom"], args: (f: string) => ["-c", "import sys,xml.dom.minidom; xml.dom.minidom.parse(sys.argv[1])", f], ext: ".xml" },
  // INI validation via stdlib configparser (read_file RAISES on a malformed/section-less file; always available).
  INI: { bin: "python3", probeArgs: ["-c", "import configparser"], args: (f: string) => ["-c", "import sys,configparser; configparser.ConfigParser().read_file(open(sys.argv[1]))", f], ext: ".ini" },
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
      // SECURITY (fixes an audited host-file read): with cgo enabled, a reviewed .go can embed a C block with
      // `#include "/abs/host/file"`, and gcc echoes the referenced file's CONTENT into diagnostics ⇒ into the
      // code-review `evidence` field. CGO_ENABLED=0 disables cgo entirely: a file that `import "C"` is excluded
      // ("build constraints exclude all Go files") BEFORE gcc runs, so no host file is read. Pure-Go still compiles.
      CGO_ENABLED: "0",
    }),
  },
  // Rust/build: a REAL compile check via the authorized rustc toolchain — type-checks (incl. the borrow checker),
  // catching far more than a parse. HERMETIC: emit metadata only (--emit=metadata, no linker) into the isolated
  // workspace (--out-dir dir, self-cleaning); TMPDIR + CARGO/RUSTUP homes scoped INTO the workspace and
  // CARGO_NET_OFFLINE=true. Bare `rustc` performs no network I/O regardless; a non-stdlib `extern crate`/`use` FAILS
  // CLOSED ("can't find crate", ~0.08s, no fetch). NOTE: we deliberately do NOT clobber RUSTUP_HOME/CARGO_HOME — on
  // hosts where `rustc` is a rustup PROXY (e.g. CI runners), pointing those at an empty workspace dir hides the default
  // toolchain and breaks even clean code. HOME (unchanged) lets the proxy resolve ~/.rustup. Probe fails ⇒ UNSUPPORTED.
  Rust: {
    bin: RUST_BIN, probeArgs: ["--version"], ext: ".rs",
    args: (f: string) => ["--edition", "2021", "--crate-type", "lib", "--emit=metadata", "--out-dir", path.dirname(f), f],
    env: (dir: string) => ({ TMPDIR: dir, CARGO_NET_OFFLINE: "true" }),
    // Bind the resolved rust sysroot read-only so the confined real-toolchain rustc finds std + its codegen backend
    // on rustup hosts (apt sysroot=/usr is already covered by SYS_RO; the dedup in runConfined makes this a no-op there).
    roBinds: RUST_SYSROOT ? [RUST_SYSROOT] : [],
    // SECURITY: rustc's file-inclusion macros (include!/include_str!/include_bytes!) can be ALIASED
    // (`use std::include as x; x!("/abs")`), so no source-text guard is sufficient. Run rustc FILESYSTEM-CONFINED in
    // bubblewrap (only system dirs + this workspace are visible) so NO inclusion — aliased or not — can resolve a
    // host path. Fail-closed: if bubblewrap is unavailable, a Rust review is BLOCKED (never an unconfined rustc).
    confine: true,
  },
  // Java/compile: a REAL `javac` type-check — compiles to .class in the isolated workspace (-d <ws>). No classpath is
  // provided, so an external import fails CLOSED ("package ... does not exist", no network). We do NOT clobber HOME or
  // JAVA_HOME (lesson from the rustup-proxy CI breakage): javac resolves its own JDK; env stays minimal. Corpus uses
  // non-public top-level classes so the filename (src.java) need not match a public class name. Probe fails ⇒ UNSUPPORTED.
  Java: {
    bin: "javac", probeArgs: ["-version"], ext: ".java",
    args: (f: string) => ["-d", path.dirname(f), f],
  },
  // CSharp/compile: a REAL `mcs` (Mono C#) type check, compiled as a library (no Main needed) into the isolated
  // workspace. No referenced assemblies beyond the BCL ⇒ an external `using` fails CLOSED ("type or namespace not
  // found", no network). HOME/toolchain dirs NOT clobbered. Probe fails ⇒ C# honestly UNSUPPORTED (never a decoy).
  CSharp: {
    bin: "mcs", probeArgs: ["--version"], ext: ".cs",
    args: (f: string) => ["-target:library", "-out:" + path.join(path.dirname(f), "out.dll"), f],
  },
  // HTML-CSS validate via HTML Tidy: errors-only mode (warnings suppressed) ⇒ exit 0 iff the markup has no structural
  // errors, non-zero otherwise. No network; reads one local file. Probe fails ⇒ UNSUPPORTED. Language key matches the
  // broad-IT taxonomy entry ("HtmlCss") so coverage detection is consistent.
  HtmlCss: {
    bin: "tidy", probeArgs: ["--version"], ext: ".html",
    args: (f: string) => ["-q", "-e", "--show-warnings", "no", f],
  },
  // Dockerfile/lint via hadolint — ADAPTER PREPARED but hadolint is NOT in the apt repos, so the probe fails today ⇒
  // Dockerfile is honestly UNSUPPORTED (never a decoy). The wiring is ready: once hadolint is installed via the
  // checksum-verified procedure (docs/odg/deploy/HADOLINT_INSTALL.md), this adapter activates with no further code
  // change. hadolint reads one local file; no network. exit 0 clean / non-zero on lint findings.
  Dockerfile: {
    bin: "hadolint", probeArgs: ["--version"], ext: ".Dockerfile",
    args: (f: string) => ["--no-color", f],
    // NO-INSTALL in-process structural subset (always available; hadolint, when installed, is the richer check).
    structuralCheck: dockerfileStructuralLint,
  },
});

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function truncate(s: any, n = 800): string { const str = String(s || ""); return str.length > n ? str.slice(0, n) + "…[truncated]" : str; }

// Is bubblewrap present? (for opts.confine — a confined checker is fail-closed on its absence.)
function bwrapPath(): string | null {
  try { const r = cp.spawnSync("/usr/bin/env", ["sh", "-c", "command -v bwrap"], { encoding: "utf8" }); const p = r && r.status === 0 ? String(r.stdout || "").trim() : ""; return p || null; } catch { return null; }
}

/** defaultRunner: bounded spawnSync — argv array, timeout, output cap, minimal env, no shell.
 * When opts.confine is set (compiled checkers whose compiler can read arbitrary host files, e.g. rustc's inclusion
 * macros), the command is run inside bubblewrap binding ONLY system code dirs + the workspace (opts.cwd, at its real
 * path) + the toolchain's rustup/cargo homes if present — so NO path outside the workspace is readable. Env-isolated
 * like the bash governor (cleared bwrap env + --as-pid-1) to prevent a /proc/1/environ leak. Fail-closed: bwrap
 * absent ⇒ spawnError ⇒ caller BLOCKS (never an unconfined compile of reviewed input). */
function defaultRunner(bin: string, args: string[], opts: any): any {
  if (opts && opts.confine) {
    const bwrap = bwrapPath();
    if (!bwrap) return { spawnError: "sandbox unavailable (bubblewrap required to run this checker filesystem-confined); refusing an unconfined compile of reviewed input" };
    const SYS_RO = ["/usr", "/lib", "/lib64", "/bin", "/sbin"].filter((p) => { try { return fs.existsSync(p); } catch { return false; } });
    const home = process.env.HOME || "/tmp";
    // Only system code dirs + the workspace are bound. We deliberately do NOT bind ~/.rustup/~/.cargo: a system rustc
    // (under /usr) needs neither, and a rustup-managed rustc wouldn't be on the restricted PATH (/usr/bin:/bin) to run
    // anyway ⇒ fail-closed BLOCKED (never an unconfined compile). Binding ~/.cargo would needlessly expose
    // ~/.cargo/credentials.toml to a crafted include! on a rustup host — avoided.
    const setenv: string[] = [];
    const env = opts.env && typeof opts.env === "object" ? opts.env : {};
    for (const [k, v] of Object.entries(env)) { if (typeof v === "string") setenv.push("--setenv", k, v); }
    // Read-only bind set = base system dirs + spec toolchain dirs (opts.roBinds, e.g. the TypeScript package dir or the
    // rust sysroot) + the exec binary `bin` when it is an absolute path. The last matters because the confined runner
    // execs `bin` directly: for the TS checker bin === process.execPath and for Rust bin === <sysroot>/bin/rustc, either
    // of which may live OUTSIDE the system dirs (GitHub Actions hostedtoolcache / rustup) ⇒ without binding it the
    // sandboxed exec is "No such file or directory". DEDUP + ancestor-coverage: skip any candidate already covered by an
    // earlier bind (exact dup OR a bound ancestor dir) so bwrap never sees an overlapping ro-bind target (it rejects
    // those) — e.g. an apt rust sysroot of /usr, or <sysroot>/bin/rustc nested under an already-bound sysroot. None of
    // these are confidential trees (system code / toolchain), so this does not weaken the host-file-read confinement.
    const extraRo = (Array.isArray(opts.roBinds) ? opts.roBinds : []).filter((p: any) => typeof p === "string" && p);
    const candidates: string[] = [
      ...SYS_RO,
      ...extraRo,
      ...(typeof bin === "string" && path.isAbsolute(bin) ? [bin] : []),
    ].filter((p) => { try { return !!p && fs.existsSync(p); } catch { return false; } });
    const bound: string[] = [];
    const roBindArgs: string[] = [];
    for (const p of candidates) {
      if (bound.some((b) => p === b || p.startsWith((b.endsWith("/") ? b : b + "/")))) continue; // covered
      bound.push(p);
      roBindArgs.push("--ro-bind", p, p);
    }
    const bw = ["--as-pid-1", "--unshare-all", "--die-with-parent", "--new-session", "--clearenv",
      "--setenv", "PATH", "/usr/bin:/bin", "--setenv", "HOME", home,
      ...roBindArgs,
      "--dev", "/dev", "--proc", "/proc",
      "--bind", opts.cwd, opts.cwd, "--chdir", opts.cwd,
      ...setenv, "--", bin, ...args];
    const r = cp.spawnSync(bwrap, bw, { timeout: opts.timeoutMs, maxBuffer: opts.maxBytes, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { PATH: "/usr/bin:/bin" } });
    if (r.error) { if ((r.error as any).code === "ETIMEDOUT") return { timedOut: true }; return { spawnError: (r.error as any).message || "spawn error" }; }
    return { exitCode: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
  }
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
  const injected = typeof opts.runner === "function";
  const runner = injected ? opts.runner : defaultRunner;
  const out: Record<string, boolean> = {};
  for (const [lang, spec] of Object.entries(LANG_SPEC)) {
    // An in-process NO-INSTALL checker (e.g. Dockerfile structural lint) needs no toolchain ⇒ always available.
    if (typeof (spec as any).structuralCheck === "function") { out[lang] = true; continue; }
    // Require a CLEAN probe: spawned AND exit 0. A non-zero `--version` (e.g. a decoy binary) ⇒ NOT available (honest).
    // The real defaultRunner maps exitCode to spawnSync `res.status`, which is NULL when the probe is killed by a
    // signal (OOM/SIGKILL — distinct from a timeout). A signal-killed probe must NOT count as available (fail-toward-
    // available). Tolerate undefined/null ONLY for an INJECTED test runner (which may legitimately omit exitCode).
    try { const r = runner((spec as any).bin, (spec as any).probeArgs, { timeoutMs: 8000, maxBytes: 1_000_000 }); out[lang] = !!r && !r.spawnError && !r.timedOut && (r.exitCode === 0 || (injected && (r.exitCode === undefined || r.exitCode === null))); }
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
  // SECURITY (fixes an audited host-file read): Rust's file-inclusion macros (include!/include_str!/include_bytes!)
  // and the `#[path = "…"]` module attribute make rustc READ an arbitrary host file and echo its CONTENT into the
  // compiler diagnostics ⇒ into the code-review `evidence` field — an arbitrary host-file read + exfiltration via a
  // reviewed .rs (the Rust analogue of the cgo #include and the /// <reference> vectors). rustc has no flag to disable
  // them, so a reviewed single-file syntax check REFUSES them outright (they cannot resolve in a hermetic offline
  // single-file check anyway — no build.rs / OUT_DIR). Legit Rust without file inclusion is unaffected.
  if (language === "Rust" && /\binclude(?:_str|_bytes)?\s*!|#\s*\[\s*path\s*=/.test(input.content)) {
    return { status: "BLOCKED", language, reason: "refused: Rust file-inclusion (include!/include_str!/include_bytes!/#[path]) can read files outside the sandbox workspace; not permitted in the reviewed-source syntax checker" };
  }
  // NO-INSTALL in-process checker (e.g. Dockerfile structural lint): run directly — no subprocess, no toolchain,
  // no sandbox needed (pure parse of the reviewed content). Deterministic PASS/FAIL, never a decoy.
  if (typeof spec.structuralCheck === "function") {
    const res = spec.structuralCheck(input.content);
    return res && res.ok
      ? { status: "PASS", language, detail: `${language} structural lint passed (NO-INSTALL structural subset)` }
      : { status: "FAIL", language, detail: `${language} structural lint: ${(res && res.errors || []).join("; ")}`, errors: (res && res.errors) || [] };
  }
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
    const r = runner(spec.bin, spec.args(file), { cwd: dir, timeoutMs: Number(input.timeoutMs) || 20000, maxBytes: 2_000_000, confine: !!spec.confine, roBinds: Array.isArray(spec.roBinds) ? spec.roBinds : [], ...(specEnv ? { env: specEnv } : {}) });
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

// RUN_SPEC: interpreters used by runBehaviourCheck to EXECUTE a program and observe its OUTPUT (a different capability
// than runSyntaxCheck, which only compiles/type-checks). Interpreted langs only (no separate build step).
// behaviour/integration EXECUTE the supplied program, so they run CONFINED (bubblewrap --unshare-all ⇒ no network,
// cleared env, workspace bound) — making the "no network" contract TRUE rather than aspirational, and preventing a
// reviewed program from opening sockets or reading the host FS. node is invoked as process.execPath (portable: the
// confined runner ro-binds it even when node lives outside /usr, e.g. hostedtoolcache); python3 resolves on the
// sandbox PATH=/usr/bin:/bin. Fail-closed: without bubblewrap the run is BLOCKED (never an unconfined execution).
const RUN_SPEC: Readonly<Record<string, any>> = Object.freeze({
  JavaScript: { bin: process.execPath, ext: ".js", args: (f: string) => [f] },
  Python: { bin: "python3", ext: ".py", args: (f: string) => [f] },
});

/**
 * runBehaviourCheck({ language, content, expectedOutput, toolchainAvailable, runner, timeoutMs }): RUN the program in an
 * isolated temp dir and PASS iff its trimmed stdout EQUALS the trimmed expectedOutput (the ground truth, fixed in the
 * corpus — independent of the program). This measures OUTPUT CORRECTNESS (catches logic errors a compile-check misses),
 * not mere compilability. Bounded (timeout + output cap), minimal env, no network, temp cleaned. Fail-closed:
 * UNSUPPORTED when the interpreter is unknown/absent (never faked); BLOCKED on spawn error/timeout (never a silent PASS).
 */
function runBehaviourCheck(input: any = {}): any {
  const language = String(input.language || "");
  const spec = RUN_SPEC[language];
  if (!spec) return { status: "UNSUPPORTED", reason: `language '${language || "(none)"}' has no run spec in ODG`, language };
  if (typeof input.content !== "string" || typeof input.expectedOutput !== "string") return { status: "BLOCKED", reason: "content + expectedOutput (strings) required" };
  const runner = typeof input.runner === "function" ? input.runner : defaultRunner;
  const available = typeof input.toolchainAvailable === "boolean" ? input.toolchainAvailable : (detectToolchain({ runner }))[language] === true;
  if (!available) return { status: "UNSUPPORTED", reason: `interpreter for '${language}' is not available — detection only, execution not faked`, language };
  let dir: string | null = null;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-behaviour-"));
    const file = path.join(dir, `prog${spec.ext}`);
    fs.writeFileSync(file, input.content);
    const r = runner(spec.bin, spec.args(file), { cwd: dir, timeoutMs: Number(input.timeoutMs) || 20000, maxBytes: 2_000_000, confine: true, roBinds: [] });
    if (!r || r.spawnError) return { status: "BLOCKED", reason: `run spawn error: ${r && r.spawnError}`, language };
    if (r.timedOut) return { status: "BLOCKED", reason: "run timed out", language };
    const out = String(r.stdout || "").trim();
    const want = String(input.expectedOutput).trim();
    // PASS requires BOTH a clean exit (exitCode 0) AND matching output. A program that CRASHES (non-zero exit) is
    // NOT behaviourally correct even if its stdout happens to match — that would be a false success. (audit Q3c)
    return (r.exitCode === 0 && out === want)
      ? { status: "PASS", language, detail: "program exited 0 and output matches expected" }
      : { status: "FAIL", language, exitCode: r.exitCode, detail: r.exitCode !== 0 ? `program exited non-zero (${r.exitCode}) — runtime failure` : "program output does NOT match expected (logic error)" };
  } catch (e: any) {
    return { status: "BLOCKED", reason: (e && e.message) || "execution error", language };
  } finally {
    if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
  }
}

/**
 * runIntegrationCheck({ language, files, entry, expectedOutput, toolchainAvailable, runner, timeoutMs }): a MULTI-FILE
 * integration check — writes several interacting files to an isolated workspace, runs `entry`, and PASSES iff trimmed
 * stdout equals the trimmed expectedOutput. Exercises COMPONENT INTERACTION (e.g. entry imports a helper): a defect in
 * an intermediate component (that compiles/runs in isolation) surfaces only through the composition. A different
 * capability than static-single-file and single-file runtime-behaviour. Fail-closed: UNSUPPORTED when the interpreter
 * is absent; BLOCKED on bad input / spawn error / timeout (never a silent PASS). Bounded, minimal env, no network.
 */
function runIntegrationCheck(input: any = {}): any {
  const language = String(input.language || "");
  const spec = RUN_SPEC[language];                       // integration runs via the same interpreters as behaviour
  if (!spec) return { status: "UNSUPPORTED", reason: `language '${language || "(none)"}' has no run spec in ODG`, language };
  const files = Array.isArray(input.files) ? input.files : null;
  if (!files || files.length < 2 || !files.every((f: any) => f && typeof f.name === "string" && typeof f.content === "string")) return { status: "BLOCKED", reason: "integration requires ≥2 files [{name,content}]" };
  if (typeof input.entry !== "string" || !files.some((f: any) => f.name === input.entry)) return { status: "BLOCKED", reason: "entry must name one of the files" };
  if (typeof input.expectedOutput !== "string") return { status: "BLOCKED", reason: "expectedOutput (string) required" };
  const runner = typeof input.runner === "function" ? input.runner : defaultRunner;
  const available = typeof input.toolchainAvailable === "boolean" ? input.toolchainAvailable : (detectToolchain({ runner }))[language] === true;
  if (!available) return { status: "UNSUPPORTED", reason: `interpreter for '${language}' is not available — not faked`, language };
  let dir: string | null = null;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-integration-"));
    for (const f of files) {
      const p = path.join(dir, path.basename(f.name));    // basename ⇒ no path traversal out of the workspace
      fs.writeFileSync(p, f.content);
    }
    const r = runner(spec.bin, spec.args(path.join(dir, path.basename(input.entry))), { cwd: dir, timeoutMs: Number(input.timeoutMs) || 20000, maxBytes: 2_000_000, confine: true, roBinds: [] });
    if (!r || r.spawnError) return { status: "BLOCKED", reason: `run spawn error: ${r && r.spawnError}`, language };
    if (r.timedOut) return { status: "BLOCKED", reason: "run timed out", language };
    const out = String(r.stdout || "").trim();
    const want = String(input.expectedOutput).trim();
    // PASS requires a clean exit (0) AND matching composed output — a crashing composition is not integrated-correct. (audit Q3c)
    return (r.exitCode === 0 && out === want)
      ? { status: "PASS", language, detail: "integration exited 0 and output matches expected" }
      : { status: "FAIL", language, exitCode: r.exitCode, detail: r.exitCode !== 0 ? `integration exited non-zero (${r.exitCode}) — runtime failure` : "integrated output does NOT match expected (component-interaction defect)" };
  } catch (e: any) {
    return { status: "BLOCKED", reason: (e && e.message) || "execution error", language };
  } finally {
    if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
  }
}

export { LANG_SPEC, RUN_SPEC, defaultRunner, detectToolchain, runSyntaxCheck, runBehaviourCheck, runIntegrationCheck };
module.exports = { LANG_SPEC, RUN_SPEC, defaultRunner, detectToolchain, runSyntaxCheck, runBehaviourCheck, runIntegrationCheck };

if (require.main === module) {
  process.stdout.write(JSON.stringify({ toolchain: detectToolchain(), supported: Object.keys(LANG_SPEC) }, null, 2) + "\n");
}
