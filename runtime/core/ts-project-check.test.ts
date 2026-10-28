#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Validates the project-aware TS checker's classification with an INJECTED runner
// (zero subprocess): exit 0 ⇒ PASS; non-zero with TS diagnostics ⇒ FAIL (+errorCount); tsc unavailable/timeout/
// spawn-error/missing-tsconfig ⇒ BLOCKED (NEVER PASS). A real tsc project run is proven separately.
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const T = require("./ts-project-check.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

function proj(withTsconfig = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-tsproj-"));
  if (withTsconfig) fs.writeFileSync(path.join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { noEmit: true, strict: true } }));
  return dir;
}
const versionOK = (args) => args[0] === "--version";
// runner factories keyed on the project-check invocation (args = ["--noEmit","-p","tsconfig.json"]).
const passRunner = (args) => versionOK(args) ? { exitCode: 0, stdout: "Version 5.9" } : { exitCode: 0, stdout: "", stderr: "" };
const failRunner = (args) => versionOK(args) ? { exitCode: 0, stdout: "5.9" } : { exitCode: 2, stdout: "", stderr: "src/a.ts(3,7): error TS2322: Type 'string' is not assignable to type 'number'.\nsrc/b.ts(1,10): error TS2305: Module has no exported member 'x'." };
const noTsc = (args) => ({ spawnError: "ENOENT" });
const timeoutRunner = (args) => versionOK(args) ? { exitCode: 0 } : { timedOut: true };

// (1) clean project ⇒ PASS.
{ const d = proj(); ok("exit 0 over project ⇒ PASS", T.checkTsProject({ projectDir: d, runner: passRunner }).status === "PASS"); fs.rmSync(d, { recursive: true, force: true }); }

// (2) type error / missing import ⇒ FAIL with errorCount from real diagnostics.
{ const d = proj(); const r = T.checkTsProject({ projectDir: d, runner: failRunner });
  ok("non-zero + TS diagnostics ⇒ FAIL", r.status === "FAIL" && r.exitCode === 2 && r.errorCount === 2 && /TS2322/.test(r.diagnostics)); fs.rmSync(d, { recursive: true, force: true }); }

// (3) tsc unavailable ⇒ BLOCKED (never PASS).
{ const d = proj(); ok("compiler unavailable ⇒ BLOCKED", T.checkTsProject({ projectDir: d, runner: noTsc }).status === "BLOCKED"); fs.rmSync(d, { recursive: true, force: true }); }

// (4) timeout ⇒ BLOCKED (incomplete ≠ PASS).
{ const d = proj(); ok("timeout ⇒ BLOCKED", T.checkTsProject({ projectDir: d, runner: timeoutRunner }).status === "BLOCKED"); fs.rmSync(d, { recursive: true, force: true }); }

// (5) missing tsconfig ⇒ BLOCKED (cannot prove project validity).
{ const d = proj(false); ok("no tsconfig ⇒ BLOCKED (not PASS)", /tsconfig not found|BLOCKED/.test(JSON.stringify(T.checkTsProject({ projectDir: d, runner: passRunner }))) && T.checkTsProject({ projectDir: d, runner: passRunner }).status === "BLOCKED"); fs.rmSync(d, { recursive: true, force: true }); }

// (6) tscAvailable gates on a clean exit-0 version probe (a decoy exiting non-zero ⇒ unavailable).
ok("tscAvailable true on clean probe", T.tscAvailable({ runner: () => ({ exitCode: 0, stdout: "5.9" }) }) === true);
ok("tscAvailable false on non-zero probe (decoy)", T.tscAvailable({ runner: () => ({ exitCode: 1 }) }) === false);

// (7) fail-closed on bad input.
ok("fail-closed: no projectDir", T.checkTsProject({}).status === "BLOCKED");
ok("fail-closed: nonexistent projectDir", T.checkTsProject({ projectDir: "/no/such/dir/x" }).status === "BLOCKED");

console.log(`\nTS-PROJECT-CHECK suite — ${pass} assertions passed. (project-mode tsc: PASS exit0 / FAIL diagnostics / BLOCKED unavailable|timeout|no-tsconfig; never a false PASS)`);
