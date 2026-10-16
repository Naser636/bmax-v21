#!/usr/bin/env node
/*
 * LOT bash-command-governor — EQUIVALENCE (historical .js vs compiled .ts). Offline, FAIL-CLOSED. The
 * module's ONLY outward effect is child_process.spawnSync / a bubblewrap sandbox run — BOTH are injectable
 * seams (opts.spawn, opts.sandboxRunner), exactly the provider-sandbox pattern. This bench injects a FAKE
 * spawn and a FAKE sandboxRunner on EVERY govern path, so NO real bwrap / command / network / fs-write ever
 * runs (the repo + host are never touched). Both modules are driven with IDENTICAL inputs and compared
 * BYTE-IDENTICAL — proving the governed-command contract (argv-only, deny-by-default via action-gate,
 * dry-run default, secret boundary, observed-isolation fail-closed, predicted-vs-observed EFFECT_DIVERGENCE,
 * UNKNOWN-never-trusted) is preserved exactly.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/bash-command-governor-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "bash-command-governor.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "bash-command-governor.js");
let failures = 0;
const check = (c: boolean, l: string) => { if (c) console.log(`  PASS ${l}`); else { failures++; console.log(`  FAIL ${l}`); } };
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT bash-command-governor — EQUIVALENCE");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD) && fs.existsSync(TS_MOD), "prerequisite: .js present + dist .ts emitted");
delete require.cache[require.resolve(JS_MOD)]; delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any; const ts = require(TS_MOD) as any;
for (const x of ["govern", "parse", "analyze", "resolveIdentity", "buildAction", "detectSandbox", "sandboxRun", "OUTCOME", "SAFE_READONLY", "DANGEROUS", "DYNAMIC_CONSTRUCTS"]) check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);
check(EQ(js.OUTCOME, ts.OUTCOME) && EQ(js.SAFE_READONLY, ts.SAFE_READONLY) && EQ(js.DANGEROUS, ts.DANGEROUS), "OUTCOME + SAFE_READONLY + DANGEROUS vocab byte-identical");
check(EQ(js.DYNAMIC_CONSTRUCTS.map((c: any) => c.name), ts.DYNAMIC_CONSTRUCTS.map((c: any) => c.name)), "DYNAMIC_CONSTRUCTS names byte-identical");

// FAKE seams — pure, deterministic, NO host contact. spawn: resolves nothing (status 1) so resolveIdentity/
// detectSandbox stay inert; sandboxRunner: a canned launched run, varied per scenario via `obsWrites`/flags.
const fakeSpawn = () => ({ status: 1, stdout: "", stderr: "", output: [null, "", "", ""] });
const mkSandbox = (over: any = {}) => (argv: any, _o: any) => ({
  ran: true, launched: true, mechanism: "bubblewrap", exitCode: 0, signal: null, timedOut: false,
  stdout: "ok", stderr: "", observedEffects: { filesCreated: [], filesModified: [], filesDeleted: [], network: false },
  isolation: { network: false, envCleared: true, writableRoot: false, nonPrivileged: true, workDir: "/tmp/work", timeoutMs: 5000, launched: true },
  cleanupError: null, ...over,
});
// govern driven on BOTH modules with identical request+opts; compare byte-identical.
const gov = (req: any, opts: any) => EQ(js.govern(req, opts), ts.govern(req, opts));
const outcome = (req: any, opts: any) => js.govern(req, opts).outcome;
const SPAWN = { spawn: fakeSpawn }; // always injected so the REAL spawnSync is never reached

// (1) PARSE boundary
check(gov({ command: "" }, SPAWN) && outcome({ command: "" }, SPAWN) === "BLOCKED", "empty command ⇒ BLOCKED byte-identical");
check(gov({ command: "ls | grep x" }, SPAWN) && outcome({ command: "ls | grep x" }, SPAWN) === "HUMAN_APPROVAL_REQUIRED", "dynamic construct (pipe) ⇒ HUMAN_APPROVAL_REQUIRED byte-identical");
check(gov({ command: "echo $(whoami)" }, SPAWN) && outcome({ command: "echo $(whoami)" }, SPAWN) === "HUMAN_APPROVAL_REQUIRED", "command-substitution ⇒ HUMAN_APPROVAL_REQUIRED byte-identical");

// (2) DRY-RUN default (execute !== true): parsed + analysed + gate decision, NO execution
check(gov({ command: "ls -la" }, SPAWN) && outcome({ command: "ls -la" }, SPAWN) === "ANALYZED", "known-safe ls dry-run ⇒ ANALYZED byte-identical");
check(js.govern({ command: "ls -la" }, SPAWN).gate.decision === "ALLOW", "ls (observational READ) ⇒ gate ALLOW");
check(gov({ command: "rm -rf /tmp/x" }, SPAWN) && outcome({ command: "rm -rf /tmp/x" }, SPAWN) === "ANALYZED", "dangerous rm dry-run ⇒ ANALYZED byte-identical");
check(js.govern({ command: "rm -rf /tmp/x" }, SPAWN).gate.decision === "DENY", "rm (DELETE, no authority) ⇒ gate DENY");
check(gov({ command: "sudo whoami" }, SPAWN) && js.govern({ command: "sudo whoami" }, SPAWN).analysis.classification === "SHELL_ESCALATOR", "sudo (escalator, not in DANGEROUS) ⇒ SHELL_ESCALATOR classification byte-identical");

// (3) SECRET boundary — declared secret access never auto-runs (even dry-run, even execute)
check(gov({ command: "cat /home/u/.ssh/id_rsa", execute: true }, SPAWN) && outcome({ command: "cat /home/u/.ssh/id_rsa", execute: true }, SPAWN) === "HUMAN_APPROVAL_REQUIRED", "secret path ⇒ HUMAN_APPROVAL_REQUIRED (SECRET_BOUNDARY) byte-identical");

// (4) EXECUTE path (all via injected sandboxRunner — NO real bwrap)
const exOpts = (over: any = {}) => ({ spawn: fakeSpawn, sandboxRunner: mkSandbox(over) });
// known-safe clean run ⇒ EXECUTED/VERIFIED
check(gov({ command: "ls", execute: true }, exOpts()) && outcome({ command: "ls", execute: true }, exOpts()) === "EXECUTED", "known-safe execute (clean sandbox) ⇒ EXECUTED byte-identical");
check(js.govern({ command: "ls", execute: true }, exOpts()).verification_status === "VERIFIED", "EXECUTED ⇒ verification_status VERIFIED");
// known-safe but sandbox observed a write ⇒ EFFECT_DIVERGENCE (fail-closed, REJECTED)
const divOpts = exOpts({ observedEffects: { filesCreated: ["sneaky"], filesModified: [], filesDeleted: [], network: false } });
check(gov({ command: "ls", execute: true }, divOpts) && outcome({ command: "ls", execute: true }, divOpts) === "EFFECT_DIVERGENCE", "declared read-only but observed write ⇒ EFFECT_DIVERGENCE byte-identical");
// sandbox never launched ⇒ SANDBOX_LAUNCH_FAILED (observed-isolation fail-closed)
const noLaunch = exOpts({ launched: false, isolation: { network: false, envCleared: true, writableRoot: false, nonPrivileged: true, workDir: "/tmp/work", timeoutMs: 5000, launched: false } });
check(gov({ command: "ls", execute: true }, noLaunch) && outcome({ command: "ls", execute: true }, noLaunch) === "HUMAN_APPROVAL_REQUIRED", "sandbox not launched ⇒ HUMAN_APPROVAL_REQUIRED (SANDBOX_LAUNCH_FAILED) byte-identical");
// timed out ⇒ BLOCKED (resource boundary)
const timedOut = exOpts({ timedOut: true });
check(gov({ command: "ls", execute: true }, timedOut) && outcome({ command: "ls", execute: true }, timedOut) === "BLOCKED", "timeout ⇒ BLOCKED (resource boundary) byte-identical");
// UNKNOWN command execute ⇒ profiled only (SANDBOX_OBSERVED/EFFECT_PROFILED, never trusted)
check(gov({ command: "mysterybin", execute: true }, exOpts()) && outcome({ command: "mysterybin", execute: true }, exOpts()) === "SANDBOX_OBSERVED", "UNKNOWN command execute ⇒ SANDBOX_OBSERVED (never trusted) byte-identical");
check(js.govern({ command: "mysterybin", execute: true }, exOpts()).trust === "EFFECT_PROFILED", "UNKNOWN ⇒ trust EFFECT_PROFILED");
// dangerous execute ⇒ gate DENY ⇒ BLOCKED (never reaches sandbox)
check(gov({ command: "rm -rf /tmp/x", execute: true }, exOpts()) && outcome({ command: "rm -rf /tmp/x", execute: true }, exOpts()) === "BLOCKED", "dangerous execute ⇒ BLOCKED (gate DENY) byte-identical");
// sandbox unavailable (no runner, fake spawn resolves no bwrap) ⇒ HUMAN_APPROVAL_REQUIRED
check(gov({ command: "ls", execute: true }, SPAWN) && outcome({ command: "ls", execute: true }, SPAWN) === "HUMAN_APPROVAL_REQUIRED", "sandbox unavailable ⇒ HUMAN_APPROVAL_REQUIRED (SANDBOX_UNAVAILABLE) byte-identical");

// (5) helper parity
check(EQ(js.parse("ls -l '/a b'"), ts.parse("ls -l '/a b'")), "parse (quoted token) byte-identical");
check(EQ(js.analyze(js.parse("rm -rf /x"), SPAWN), ts.analyze(ts.parse("rm -rf /x"), SPAWN)), "analyze (dangerous) byte-identical");
check(EQ(js.buildAction(js.analyze(js.parse("ls"), SPAWN), {}), ts.buildAction(ts.analyze(ts.parse("ls"), SPAWN), {})), "buildAction byte-identical");
check(EQ(js.detectSandbox({ sandboxRunner: mkSandbox() }), ts.detectSandbox({ sandboxRunner: mkSandbox() })), "detectSandbox (injected) byte-identical");
check(EQ(js.sandboxRun(["ls"], { sandboxRunner: mkSandbox() }), ts.sandboxRun(["ls"], { sandboxRunner: mkSandbox() })), "sandboxRun (injected runner) byte-identical");

console.log(failures === 0 ? "ALL PASS — LOT bash-command-governor EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
