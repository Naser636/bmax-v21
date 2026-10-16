#!/usr/bin/env node

/*
 * Provider Sandbox (η3-B124, HARDEN-LOCAL-MODEL-SANDBOX).
 *
 * The provider-confined execution profile for an out-of-band local model binary
 * (ODG_LOCAL_MODEL_CMD). It REUSES the proven bubblewrap governor's `detectSandbox`
 * (runtime/core/bash-command-governor.js) but builds its OWN, provider-specific argv:
 *
 *   - argv-ONLY: the command string is tokenized into argv with NO shell interpretation
 *     (no |, &, ;, $(), backticks, <, >, (), newline). A dynamic/shell construct is a
 *     configuration error and is REFUSED — never handed to a shell.
 *   - MINIMAL filesystem: NEVER `--ro-bind / /`. Only read-only system CODE dirs
 *     (/usr,/lib,/lib64,/bin,/sbin — those that exist) plus an explicit model-files
 *     allowlist are bound. /etc, /home, /root, /var, /opt, /srv, /mnt, /media are NOT
 *     exposed, so host configuration and confidential data stay out of the sandbox.
 *   - NO network (--unshare-all), cleared env (--clearenv) with ONLY an explicit
 *     allowlist re-injected (default: none => no parent secret crosses the boundary),
 *     a non-privileged user namespace, a controlled tmpfs work dir, and a timeout.
 *   - FAIL-CLOSED: if bubblewrap is unavailable, if the command cannot be safely parsed,
 *     if an allowlisted path is invalid, or if the OBSERVED launch handshake (--info-fd
 *     child-pid, same mechanism as the bash governor) is absent, the call is REFUSED
 *     with a traceable reason and NOTHING runs unsandboxed. A zero exit code is NEVER
 *     trusted as proof of isolation; only an observed launch is.
 *
 * Pure/deterministic arg construction (parseCommand/buildBwrapArgs) is separated from the
 * spawn so it can be unit-tested without executing anything. `opts.sandboxRunner` injects a
 * runner for integration tests (no real binary, no network, no secrets).
 *
 * STRICT TS PORT (V62): behaviour-preserving transliteration of the historical .js. Argv parsing,
 * the confidential-prefix guard, the bwrap argv (never `--ro-bind / /`), the injected-runner seam
 * and the fail-closed `--info-fd` launch proof are byte-identical. It REQUIRES the unmodified
 * ./bash-command-governor (.js, co-located in dist by build-dist-closure); that module is NOT touched.
 */

"use strict";

import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
const bashGov: any = require("./bash-command-governor"); // reuse detectSandbox (shared isolation substrate)

// Read-only system CODE directories bound by default. Deliberately EXCLUDES /etc, /home,
// /root, /var, /opt, /srv, /mnt, /media — binding those would leak host config/secrets.
const DEFAULT_SYSTEM_RO = ["/usr", "/lib", "/lib64", "/bin", "/sbin"];
// Prefixes that must NEVER be a read-only bind target (confidentiality). A model-files or
// ro-bind allowlist entry under one of these is rejected (no whole-tree exposure).
const CONFIDENTIAL_PREFIXES = ["/etc", "/home", "/root", "/var", "/proc", "/sys", "/dev"];
// Unquoted characters that imply shell control flow / expansion. Their presence OUTSIDE a
// quote means the command is not a plain argv and is refused (never shell-interpreted).
const SHELL_METACHARS = ["|", "&", ";", "<", ">", "`", "$", "(", ")", "\n", "\r", "*", "?", "~", "{", "}"];

// Tokenize a command string into argv honoring single/double quotes, WITHOUT any shell
// semantics (no expansion, no globbing, no operators). Returns { ok, argv } or { ok:false,
// error }. Quoted metacharacters are preserved literally; unquoted metacharacters => error.
function parseCommand(cmd: any): any {
  if (typeof cmd !== "string" || !cmd.trim()) return { ok: false, error: "empty command" };
  const argv: string[] = [];
  let cur = "";
  let has = false; // current token has content (handles empty quoted "")
  let quote: string | null = null; // "'" or '"' or null
  for (let i = 0; i < cmd.length; i += 1) {
    const ch = cmd[i];
    if (quote) {
      if (ch === quote) { quote = null; }
      else { cur += ch; has = true; }
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; has = true; continue; }
    if (ch === " " || ch === "\t") { if (has) { argv.push(cur); cur = ""; has = false; } continue; }
    if (ch === "\\") { // literal-escape the next char (no shell, just de-escape)
      i += 1; if (i < cmd.length) { cur += cmd[i]; has = true; } continue;
    }
    if (SHELL_METACHARS.includes(ch)) {
      return { ok: false, error: `unquoted shell metacharacter '${ch}' — ODG_LOCAL_MODEL_CMD must be a plain binary + arguments, not a shell expression` };
    }
    cur += ch; has = true;
  }
  if (quote) return { ok: false, error: "unterminated quote" };
  if (has) argv.push(cur);
  if (!argv.length) return { ok: false, error: "no executable in command" };
  return { ok: true, argv };
}

// Validate an allowlist of absolute, existing paths that are safe to read-only bind.
function validateRoPaths(list: any, label: string): any {
  const out: string[] = [];
  for (const p of list) {
    if (typeof p !== "string" || !p) return { ok: false, error: `${label}: non-string entry` };
    if (!path.isAbsolute(p)) return { ok: false, error: `${label}: '${p}' is not an absolute path` };
    const norm = path.normalize(p);
    if (norm === "/") return { ok: false, error: `${label}: refusing to bind '/'` };
    if (CONFIDENTIAL_PREFIXES.some((pre) => norm === pre || norm.startsWith(pre + "/"))) {
      return { ok: false, error: `${label}: '${norm}' is under a confidential prefix and cannot be exposed` };
    }
    if (!fs.existsSync(norm)) return { ok: false, error: `${label}: '${norm}' does not exist` };
    out.push(norm);
  }
  return { ok: true, paths: out };
}

// Build the bubblewrap argv for a provider run. PURE: constructs the array, binds nothing.
// Throws on an invalid profile (callers surface it as a refusal). NEVER emits `--ro-bind / /`.
function buildBwrapArgs(spec: any): string[] {
  const argv = Array.isArray(spec.argv) ? spec.argv : [];
  if (!argv.length) throw new Error("buildBwrapArgs: empty argv");
  const work = spec.work || "/tmp/work";
  const envAllow = Array.isArray(spec.envAllowlist) ? spec.envAllowlist : [];

  // System code dirs: default set filtered to those that exist, or an explicit override.
  const sysRo = Array.isArray(spec.roBinds) ? spec.roBinds : DEFAULT_SYSTEM_RO;
  const sysChk = validateRoPaths(sysRo, "roBinds");
  if (!sysChk.ok) throw new Error(sysChk.error);
  const existingSys = sysChk.paths.filter((p: string) => fs.existsSync(p));

  // Model files: explicit allowlist only (may be empty). Each validated + read-only bound.
  const modelFiles = Array.isArray(spec.modelFiles) ? spec.modelFiles : [];
  const modelChk = validateRoPaths(modelFiles, "modelFiles");
  if (!modelChk.ok) throw new Error(modelChk.error);

  const setenv: string[] = [];
  for (const k of envAllow) {
    if (typeof k === "string" && typeof process.env[k] === "string") setenv.push("--setenv", k, process.env[k] as string);
  }

  const out = [
    "--info-fd", "3",
    "--unshare-all", "--die-with-parent", "--new-session", "--clearenv",
    "--setenv", "PATH", "/usr/bin:/bin", "--setenv", "HOME", work,
  ];
  for (const p of existingSys) out.push("--ro-bind", p, p);     // system CODE, read-only
  for (const p of modelChk.paths) out.push("--ro-bind", p, p);  // explicit model files, read-only
  out.push("--dev", "/dev", "--proc", "/proc", "--tmpfs", "/tmp");
  out.push("--bind", spec.realWork || work, work, "--chdir", work);
  out.push(...setenv, "--", ...argv);
  return out;
}

// Execute the local model binary inside the provider sandbox. Fail-closed throughout.
// opts: { command, roBinds, modelFiles, envAllowlist, timeoutMs, sandboxRunner, spawn }.
function runProvider(prompt: any, opts: any): any {
  const options = opts || {};
  const sandbox = bashGov.detectSandbox(options);
  if (!sandbox.available) {
    return { ok: false, refused: true, launched: false, reason: "sandbox unavailable (bubblewrap required); refusing unsandboxed execution" };
  }
  const parsed = parseCommand(options.command);
  if (!parsed.ok) {
    return { ok: false, refused: true, launched: false, reason: `invalid ODG_LOCAL_MODEL_CMD: ${parsed.error}` };
  }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "odg-prov-"));
  let bwrapArgs;
  try {
    bwrapArgs = buildBwrapArgs({
      argv: parsed.argv,
      roBinds: options.roBinds,
      modelFiles: options.modelFiles,
      envAllowlist: options.envAllowlist,
      work: "/tmp/work",
      realWork: work,
    });
  } catch (e: any) {
    try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* best-effort */ }
    return { ok: false, refused: true, launched: false, reason: `invalid sandbox profile: ${String(e.message || e)}` };
  }

  // Injected runner (tests): no real binary, no network, no secrets. It receives the EXACT
  // bwrap argv so a test can assert isolation flags, then returns { launched, status, stdout }.
  if (typeof options.sandboxRunner === "function") {
    try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* best-effort */ }
    const r = options.sandboxRunner(bwrapArgs, { input: String(prompt == null ? "" : prompt), argvInner: parsed.argv }) || {};
    if (!r.launched) return { ok: false, refused: true, launched: false, reason: r.reason || "sandbox did not launch (injected runner)" };
    if (typeof r.status === "number" && r.status !== 0) return { ok: false, refused: false, launched: true, reason: `local model exited ${r.status}`, stderr: String(r.stderr || "").trim() };
    return { ok: true, launched: true, text: String(r.stdout || "").replace(/\n$/, ""), isolation: { network: false, envCleared: true, wholeFsExposed: false } };
  }

  const spawn = options.spawn || spawnSync;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 15000;
  const res = spawn("bwrap", bwrapArgs, {
    input: String(prompt == null ? "" : prompt),
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: (options.maxBuffer) || 8 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe", "pipe"],
  });
  // OBSERVED launch proof via --info-fd (same mechanism the bash governor uses): a non-empty
  // payload carrying a child-pid proves bubblewrap built the namespaces and exec'd the child.
  const infoRaw = res && Array.isArray(res.output) && typeof res.output[3] === "string" ? res.output[3] : "";
  let launched = false;
  try { launched = !!(infoRaw && JSON.parse(infoRaw)["child-pid"]); } catch { launched = false; }
  try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* best-effort */ }

  if (!launched) {
    return { ok: false, refused: true, launched: false, reason: "sandbox did not launch (no --info-fd handshake); refusing to trust unsandboxed output", stderr: String(res.stderr || "").trim() };
  }
  if (res.error) return { ok: false, refused: false, launched: true, reason: String(res.error.message || res.error) };
  if (typeof res.status === "number" && res.status !== 0) {
    return { ok: false, refused: false, launched: true, reason: `local model exited ${res.status}`, stderr: String(res.stderr || "").trim() };
  }
  return {
    ok: true,
    launched: true,
    text: String(res.stdout || "").replace(/\n$/, ""),
    isolation: { network: false, envCleared: true, wholeFsExposed: false, nonPrivileged: true },
  };
}

module.exports = {
  parseCommand,
  buildBwrapArgs,
  runProvider,
  DEFAULT_SYSTEM_RO,
  CONFIDENTIAL_PREFIXES,
};

// Module-scope marker (adds NO export): forces TypeScript MODULE scope (no global-script collisions).
export {};
