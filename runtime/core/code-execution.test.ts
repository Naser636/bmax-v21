#!/usr/bin/env node
// @ts-nocheck — runs under tsx, ZERO subprocess (injected runner + toolchainAvailable override). Proves the bounded
// checker: argv-array specs (no shell), PASS/FAIL/UNSUPPORTED/BLOCKED classification, temp-path stripped from stderr,
// UNSUPPORTED when toolchain absent (not faked), fail-closed on bad input. (Real-subprocess run proven separately.)
"use strict";
const assert = require("assert");
const E = require("./code-execution.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const okRunner = () => ({ exitCode: 0, stdout: "", stderr: "" });
const failRunner = (ws) => () => ({ exitCode: 1, stdout: "", stderr: `SyntaxError at ${ws}/src.js:1` });

// (1) specs are argv ARRAYS (no shell string ⇒ no injection).
ok("every language spec produces an argv array (no shell)", Object.values(E.LANG_SPEC).every(s => Array.isArray(s.args("f")) && typeof s.bin === "string"));

// (2) unknown language ⇒ UNSUPPORTED (never faked).
ok("unknown language ⇒ UNSUPPORTED", E.runSyntaxCheck({ language: "COBOL", content: "x" }).status === "UNSUPPORTED");

// (3) toolchain absent ⇒ UNSUPPORTED (detection only, not faked).
ok("toolchain absent ⇒ UNSUPPORTED (not faked)", E.runSyntaxCheck({ language: "Python", content: "x=1", toolchainAvailable: false }).status === "UNSUPPORTED" && /not faked/.test(E.runSyntaxCheck({ language: "Python", content: "x=1", toolchainAvailable: false }).reason));

// (4) PASS on exit 0.
ok("exit 0 ⇒ PASS", E.runSyntaxCheck({ language: "JavaScript", content: "const x=1", toolchainAvailable: true, runner: okRunner }).status === "PASS");

// (5) FAIL on non-zero + stderr surfaced with temp path stripped.
const f = E.runSyntaxCheck({ language: "JavaScript", content: "const x=;", toolchainAvailable: true, runner: (bin, args, opts) => ({ exitCode: 1, stdout: "", stderr: `SyntaxError at ${opts.cwd}/src.js:1` }) });
ok("exit!=0 ⇒ FAIL + stderr (temp path stripped to <ws>)", f.status === "FAIL" && f.exitCode === 1 && /<ws>/.test(f.stderr) && !/odg-codeexec/.test(f.stderr));

// (6) timeout ⇒ BLOCKED; spawn error ⇒ BLOCKED (never PASS).
ok("timeout ⇒ BLOCKED", E.runSyntaxCheck({ language: "Python", content: "x", toolchainAvailable: true, runner: () => ({ timedOut: true }) }).status === "BLOCKED");
ok("spawn error ⇒ BLOCKED", E.runSyntaxCheck({ language: "Python", content: "x", toolchainAvailable: true, runner: () => ({ spawnError: "ENOENT" }) }).status === "BLOCKED");

// (7) bad input fail-closed.
ok("non-string content ⇒ BLOCKED", E.runSyntaxCheck({ language: "Python", content: 123 }).status === "BLOCKED");

// (8) detectToolchain uses the probe (mock): available vs error.
const tc = E.detectToolchain({ runner: (bin) => bin === "python3" ? { exitCode: 0, stdout: "Python" } : { spawnError: "ENOENT" } });
ok("detectToolchain: python available, others not (via mock probe)", tc.Python === true && tc.JavaScript === false);

console.log(`\nCODE-EXECUTION suite — ${pass} assertions passed. (argv-array; PASS/FAIL/UNSUPPORTED/BLOCKED; path-stripped stderr; not faked; fail-closed)`);
