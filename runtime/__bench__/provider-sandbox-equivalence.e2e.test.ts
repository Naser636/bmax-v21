#!/usr/bin/env node
/*
 * LOT provider-sandbox — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic, NO real provider / NO network / NO secrets / NO real bwrap. build:runtime compiles
 * runtime/core/provider-sandbox.ts → runtime/dist/core/provider-sandbox.js; its only internal dep
 * (./bash-command-governor, unmodified .js) is co-located into dist by build-dist-closure.
 *
 * PARITY SURFACE (byte-identical .js vs compiled .ts):
 *   - parseCommand: valid argv, quoted-metachar preserved, UNQUOTED-metachar refused, unterminated quote, empty.
 *   - buildBwrapArgs: PURE argv — isolation flags present (--unshare-all/--clearenv/--info-fd), NEVER `--ro-bind / /`,
 *     confidential-prefix (/etc) model file THROWS on both.
 *   - runProvider via an INJECTED sandboxRunner (detectSandbox reports available on an injected runner):
 *     success (launched→ok), refusal (runner not launched), non-zero exit, invalid profile (/etc model) refused,
 *     unparseable command refused — result objects compared BYTE-IDENTICAL. No real binary is ever executed.
 *   - DEFAULT_SYSTEM_RO / CONFIDENTIAL_PREFIXES exports identical.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/provider-sandbox-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "provider-sandbox.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "provider-sandbox.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT provider-sandbox — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/provider-sandbox.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/provider-sandbox.js emitted");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;

for (const x of ["parseCommand", "buildBwrapArgs", "runProvider", "DEFAULT_SYSTEM_RO", "CONFIDENTIAL_PREFIXES"]) {
  check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);
}
check(EQ(js.DEFAULT_SYSTEM_RO, ts.DEFAULT_SYSTEM_RO) && EQ(js.CONFIDENTIAL_PREFIXES, ts.CONFIDENTIAL_PREFIXES), "DEFAULT_SYSTEM_RO + CONFIDENTIAL_PREFIXES byte-identical");

// ── parseCommand parity ──────────────────────────────────────────────────────────────────────────
const cmds = [
  "llama --model /m/x.gguf -p hello",
  "bin 'a b' \"c d\"",          // quoted tokens with spaces
  "echo 'a|b;c'",               // metachars INSIDE quotes ⇒ literal, OK
  "foo | bar",                  // unquoted pipe ⇒ refused
  "foo $(bar)",                 // unquoted expansion ⇒ refused
  "'unterminated",              // unterminated quote ⇒ refused
  "   ",                        // empty ⇒ refused
  "a\\ b",                      // escaped space ⇒ single token "a b"
];
for (const c of cmds) check(EQ(js.parseCommand(c), ts.parseCommand(c)), `parseCommand parity: ${JSON.stringify(c).slice(0, 34)}`);
check(js.parseCommand("foo | bar").ok === false && /metacharacter/.test(js.parseCommand("foo | bar").error), "parseCommand refuses an unquoted shell metacharacter (fail-closed)");

// ── buildBwrapArgs parity (PURE; /usr exists on the host, deterministic) ──────────────────────────
{
  const spec = { argv: ["llama", "-p", "x"], roBinds: ["/usr"], modelFiles: [], envAllowlist: [], work: "/tmp/work", realWork: "/tmp/realwork" };
  const ja = js.buildBwrapArgs(spec), ta = ts.buildBwrapArgs(spec);
  check(EQ(ja, ta), "buildBwrapArgs byte-identical argv");
  for (const flag of ["--unshare-all", "--clearenv", "--info-fd", "--die-with-parent"]) {
    check(ja.includes(flag) && ta.includes(flag), `buildBwrapArgs carries ${flag} (isolation preserved)`);
  }
  // CRITICAL invariant: never a whole-root read-only bind.
  const rootBind = (a: string[]) => a.some((_, i) => a[i] === "--ro-bind" && a[i + 1] === "/" && a[i + 2] === "/");
  check(!rootBind(ja) && !rootBind(ta), "buildBwrapArgs NEVER emits `--ro-bind / /` (no whole-fs exposure)");
  // confidential-prefix model file throws on BOTH.
  let ej = false, et = false;
  try { js.buildBwrapArgs({ argv: ["x"], modelFiles: ["/etc/shadow"] }); } catch { ej = true; }
  try { ts.buildBwrapArgs({ argv: ["x"], modelFiles: ["/etc/shadow"] }); } catch { et = true; }
  check(ej === true && et === true, "buildBwrapArgs throws on a confidential-prefix model file (/etc) — both");
}

// ── runProvider parity via INJECTED sandboxRunner (no real binary / network / secrets) ────────────
const okRunner = () => ({ launched: true, status: 0, stdout: "hello\n" });
const notLaunched = () => ({ launched: false, reason: "no launch" });
const nonZero = () => ({ launched: true, status: 7, stderr: "boom" });

check(EQ(js.runProvider("p", { command: "cat", sandboxRunner: okRunner }), ts.runProvider("p", { command: "cat", sandboxRunner: okRunner })), "runProvider SUCCESS parity (injected runner launched, status 0)");
check(js.runProvider("p", { command: "cat", sandboxRunner: okRunner }).ok === true, "runProvider SUCCESS ⇒ ok:true, text trimmed");
check(EQ(js.runProvider("p", { command: "cat", sandboxRunner: notLaunched }), ts.runProvider("p", { command: "cat", sandboxRunner: notLaunched })), "runProvider REFUSAL parity (runner not launched ⇒ refused, fail-closed)");
check(EQ(js.runProvider("p", { command: "cat", sandboxRunner: nonZero }), ts.runProvider("p", { command: "cat", sandboxRunner: nonZero })), "runProvider NON-ZERO exit parity (ok:false, not refused)");
// invalid profile (confidential model file) with sandbox available (injected) ⇒ refused before any run.
check(EQ(js.runProvider("p", { command: "cat", modelFiles: ["/etc/shadow"], sandboxRunner: okRunner }), ts.runProvider("p", { command: "cat", modelFiles: ["/etc/shadow"], sandboxRunner: okRunner })), "runProvider INVALID-PROFILE parity (confidential model file ⇒ refused)");
check(js.runProvider("p", { command: "cat", modelFiles: ["/etc/shadow"], sandboxRunner: okRunner }).refused === true, "runProvider refuses a confidential-prefix model file before running");
// unparseable command ⇒ refused.
check(EQ(js.runProvider("p", { command: "foo | bar", sandboxRunner: okRunner }), ts.runProvider("p", { command: "foo | bar", sandboxRunner: okRunner })), "runProvider UNPARSEABLE-COMMAND parity (⇒ refused)");
// sandbox unavailable (injected spawn probe returns non-zero, NO sandboxRunner) ⇒ refused unsandboxed.
check(EQ(js.runProvider("p", { command: "cat", spawn: () => ({ status: 1, stdout: "" }) }), ts.runProvider("p", { command: "cat", spawn: () => ({ status: 1, stdout: "" }) })), "runProvider SANDBOX-UNAVAILABLE parity (refuses unsandboxed execution)");

console.log(failures === 0 ? "ALL PASS — LOT provider-sandbox EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
