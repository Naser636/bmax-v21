#!/usr/bin/env node
/*
 * LOT local-model-manager — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic, NO real provider / NO network / NO secrets. build:runtime compiles
 * runtime/core/local-model-manager.ts → runtime/dist/core/local-model-manager.js; its dep
 * ./provider-sandbox (dual-ported V62) is compiled alongside and its own deps co-located by build-dist-closure.
 *
 * PARITY SURFACE (byte-identical): command()/isAvailable()/describe() env-driven; complete() delegated to the
 * provider sandbox via an INJECTED sandboxRunner (success / refusal / non-zero) and the not-configured path.
 * No ODG_LOCAL_MODEL_CMD is ever executed for real.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/local-model-manager-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "local-model-manager.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "local-model-manager.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT local-model-manager — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/local-model-manager.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/local-model-manager.js emitted");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;

for (const x of ["isAvailable", "describe", "complete", "command"]) {
  check(typeof js[x] === "function" && typeof ts[x] === "function", `both export ${x}`);
}

const saved = process.env.ODG_LOCAL_MODEL_CMD;
try {
  // Not configured ⇒ identical availability + not-configured completion.
  delete process.env.ODG_LOCAL_MODEL_CMD;
  check(js.isAvailable() === false && ts.isAvailable() === false, "not configured ⇒ isAvailable false (both)");
  check(EQ(js.describe(), ts.describe()) && EQ(js.describe(), { available: false, command: null }), "describe() byte-identical when unconfigured");
  check(EQ(js.complete("p"), ts.complete("p")) && js.complete("p").ok === false && /no local model configured/.test(js.complete("p").reason), "complete() unconfigured ⇒ ok:false reason, byte-identical");

  // Configured ⇒ command()/describe() reflect it; complete() delegates to provider sandbox (INJECTED).
  process.env.ODG_LOCAL_MODEL_CMD = "  cat --model /m/x.gguf  ";
  check(js.command() === "cat --model /m/x.gguf" && ts.command() === js.command(), "command() trims env config (both identical)");
  check(EQ(js.describe(), ts.describe()) && js.describe().available === true, "describe() reflects configured command (both)");

  const okRunner = () => ({ launched: true, status: 0, stdout: "completion-text\n" });
  const notLaunched = () => ({ launched: false, reason: "no launch" });
  const nonZero = () => ({ launched: true, status: 9, stderr: "err" });
  check(EQ(js.complete("p", { sandboxRunner: okRunner }), ts.complete("p", { sandboxRunner: okRunner })) && js.complete("p", { sandboxRunner: okRunner }).ok === true && js.complete("p", { sandboxRunner: okRunner }).text === "completion-text", "complete() SUCCESS via injected runner ⇒ {ok,text}, byte-identical");
  check(EQ(js.complete("p", { sandboxRunner: notLaunched }), ts.complete("p", { sandboxRunner: notLaunched })) && js.complete("p", { sandboxRunner: notLaunched }).refused === true, "complete() REFUSAL (runner not launched) ⇒ refused, byte-identical (fail-closed)");
  check(EQ(js.complete("p", { sandboxRunner: nonZero }), ts.complete("p", { sandboxRunner: nonZero })) && js.complete("p", { sandboxRunner: nonZero }).ok === false, "complete() NON-ZERO exit ⇒ ok:false, byte-identical");
  // sandbox unavailable (injected spawn probe non-zero, NO sandboxRunner) ⇒ refused unsandboxed.
  check(EQ(js.complete("p", { spawn: () => ({ status: 1, stdout: "" }) }), ts.complete("p", { spawn: () => ({ status: 1, stdout: "" }) })), "complete() SANDBOX-UNAVAILABLE ⇒ refused, byte-identical");
} finally {
  if (saved === undefined) delete process.env.ODG_LOCAL_MODEL_CMD; else process.env.ODG_LOCAL_MODEL_CMD = saved;
}

console.log(failures === 0 ? "ALL PASS — LOT local-model-manager EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
