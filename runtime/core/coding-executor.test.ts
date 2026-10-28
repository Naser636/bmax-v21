#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves coding-executor consumes a coding-resolution and honours the four routes:
// EXECUTE runs the REAL checker over in-scope files (VERIFIED iff all pass, FAILED otherwise — EXECUTE≠success until
// verified); ROUTE_UNSUPPORTED launches no executor; ABSTAIN makes no change; BLOCKED keeps the cause. Real fs on a
// temp workspace; checker runner INJECTED (zero subprocess). A real code-execution run is proven separately.
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const X = require("./coding-executor.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

function wsWith(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-codeexecutor-"));
  for (const [rel, content] of Object.entries(files)) { const abs = path.join(dir, rel); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, content); }
  return dir;
}
// Injected checker: PASS unless content contains "SYNTAX_ERR".
const okRunner = (bin, args, opts) => { const f = args[args.length - 1]; const c = fs.readFileSync(f, "utf8"); return { exitCode: /SYNTAX_ERR/.test(c) ? 1 : 0, stdout: "", stderr: "" }; };

// (1) EXECUTE + all files clean ⇒ VERIFIED, executed:true, changed:false.
{
  const ws = wsWith({ "src/a.ts": "export const a = 1;\n", "src/b.ts": "export const b = 2;\n" });
  const res = X.executeCodingResolution({ route: "EXECUTE", language: "TypeScript", plan: { writeSet: ["src/"] } }, { workspaceDir: ws, runner: okRunner, toolchainAvailable: true });
  ok("EXECUTE all-clean ⇒ VERIFIED (executed, no change)", res.status === "VERIFIED" && res.executed === true && res.changed === false && res.filesChecked === 2);
  fs.rmSync(ws, { recursive: true, force: true });
}

// (2) EXECUTE with one broken file ⇒ FAILED (EXECUTE ≠ success until verified).
{
  const ws = wsWith({ "src/a.ts": "export const a = 1;\n", "src/bad.ts": "SYNTAX_ERR\n" });
  const res = X.executeCodingResolution({ route: "EXECUTE", language: "TypeScript", plan: { writeSet: ["src/"] } }, { workspaceDir: ws, runner: okRunner, toolchainAvailable: true });
  ok("EXECUTE with a broken file ⇒ FAILED", res.status === "FAILED" && res.executed === true && res.results.some(r => r.status === "FAIL"));
  fs.rmSync(ws, { recursive: true, force: true });
}

// (3) ROUTE_UNSUPPORTED ⇒ no executor launched.
{
  const res = X.executeCodingResolution({ route: "ROUTE_UNSUPPORTED", language: "Go", reason: "no Go toolchain", nextAction: "axis-D subcontract" });
  ok("ROUTE_UNSUPPORTED ⇒ not executed, UNSUPPORTED, axis-D next action", res.executed === false && res.status === "UNSUPPORTED" && /axis-D/.test(res.nextAction));
}

// (4) ABSTAIN ⇒ no change, not executed.
{
  const res = X.executeCodingResolution({ route: "ABSTAIN", reason: "ambiguous repo" });
  ok("ABSTAIN ⇒ no change, not executed", res.executed === false && res.status === "ABSTAIN" && res.changed === false);
}

// (5) BLOCKED ⇒ keeps cause + unblock.
{
  const res = X.executeCodingResolution({ route: "BLOCKED", reason: "no authorizedPaths", unblock: "declare authorizedPaths" });
  ok("BLOCKED ⇒ keeps cause + unblock", res.executed === false && res.status === "BLOCKED" && /authorizedPaths/.test(res.unblock));
}

// (6) EXECUTE but no in-scope sources ⇒ NO_SOURCES (honest, not a false VERIFIED).
{
  const ws = wsWith({ "docs/readme.md": "# hi\n" });
  const res = X.executeCodingResolution({ route: "EXECUTE", language: "TypeScript", plan: { writeSet: ["src/"] } }, { workspaceDir: ws, runner: okRunner, toolchainAvailable: true });
  ok("EXECUTE with no in-scope sources ⇒ NO_SOURCES (not false VERIFIED)", res.status === "NO_SOURCES" && res.executed === false);
  fs.rmSync(ws, { recursive: true, force: true });
}

// (7) fail-closed.
ok("fail-closed: no route", X.executeCodingResolution({}).code === "INVALID_INPUT");
ok("fail-closed: EXECUTE without workspace", X.executeCodingResolution({ route: "EXECUTE", language: "TypeScript", plan: { writeSet: ["src/"] } }).code === "INVALID_INPUT");

// (8) inScopeSources is bounded + skips node_modules.
{
  const ws = wsWith({ "src/x.ts": "1", "src/node_modules/dep/y.ts": "1", "src/sub/z.ts": "1" });
  const found = X.inScopeSources(ws, ["src/"], [".ts"]);
  ok("inScopeSources finds src files, skips node_modules", found.some(f => f.endsWith("src/x.ts")) && found.some(f => f.endsWith("sub/z.ts")) && !found.some(f => f.includes("node_modules")));
  fs.rmSync(ws, { recursive: true, force: true });
}

console.log(`\nCODING-EXECUTOR suite — ${pass} assertions passed. (consumes coding-resolution; EXECUTE→real check VERIFIED/FAILED; ROUTE_UNSUPPORTED/ABSTAIN/BLOCKED honoured; bounded; fail-closed)`);
