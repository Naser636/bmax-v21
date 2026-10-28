#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the end-to-end wiring: attachCodingResolution with opt-in execute runs the real
// coding-executor over in-scope files and records executionResult; the VE codingFidelityGate blocks EXECUTE+FAILED and
// allows EXECUTE+VERIFIED; and the DEFAULT (execute off) is unchanged (zero regression). Real fs on a temp cwd;
// checker runner INJECTED (zero subprocess).
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const I = require("./mission-coding-integration.js");
const MFV = require("./mission-fidelity-verdict.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const ALL = { JavaScript: true, TypeScript: true, Python: true };
function engCtx(mission, authorizedPaths, root) { return { version: 1, mission, requiresEngineering: true, authorizedPaths, objectives: [{ id: "o1" }], definitionOfDone: ["ok"], runtime: root ? { root } : null }; }
function tmpCwd() { const d = fs.mkdtempSync(path.join(os.tmpdir(), "odg-cxwire-")); fs.mkdirSync(path.join(d, "runtime", "generated"), { recursive: true }); return d; }
// Injected checker: PASS unless the file contains "BROKEN".
const checkRunner = (bin, args, opts) => { const f = args[args.length - 1]; const c = fs.readFileSync(f, "utf8"); return { exitCode: /BROKEN/.test(c) ? 1 : 0, stdout: "", stderr: "" }; };

// (1) execute OFF (default) ⇒ executionResult stays null, executed false (ZERO regression vs V48a behaviour).
{
  const cwd = tmpCwd(); fs.mkdirSync(path.join(cwd, "src")); fs.writeFileSync(path.join(cwd, "src", "a.js"), "const x=1;\n");
  const r = I.attachCodingResolution("M-OFF", { cwd, context: engCtx("M-OFF", ["src/"], cwd), toolchain: ALL });   // no execute
  ok("execute OFF ⇒ executionResult null, executed false, route EXECUTE", r.resolution.route === "EXECUTE" && r.resolution.executionResult === null && r.resolution.executed === false);
  fs.rmSync(cwd, { recursive: true, force: true });
}

// (2) execute ON + clean sources ⇒ executionResult VERIFIED, executed true.
{
  const cwd = tmpCwd(); fs.mkdirSync(path.join(cwd, "src")); fs.writeFileSync(path.join(cwd, "src", "a.js"), "const x = 1;\n"); fs.writeFileSync(path.join(cwd, "src", "b.js"), "const y = 2;\n");
  const r = I.attachCodingResolution("M-ON", { cwd, context: engCtx("M-ON", ["src/"], cwd), toolchain: ALL, execute: true, runner: checkRunner, toolchainAvailable: true });
  ok("execute ON + clean ⇒ executionResult VERIFIED, executed true", r.resolution.executionResult.status === "VERIFIED" && r.resolution.executed === true && r.resolution.executionResult.filesChecked === 2);
  const disk = JSON.parse(fs.readFileSync(path.join(cwd, "runtime", "generated", "coding-resolution.json"), "utf8"));
  ok("executionResult persisted to coding-resolution.json", disk.executionResult.status === "VERIFIED");
  fs.rmSync(cwd, { recursive: true, force: true });
}

// (3) execute ON + a broken source ⇒ executionResult FAILED, executed false.
{
  const cwd = tmpCwd(); fs.mkdirSync(path.join(cwd, "src")); fs.writeFileSync(path.join(cwd, "src", "a.js"), "const x = 1;\n"); fs.writeFileSync(path.join(cwd, "src", "bad.js"), "BROKEN\n");
  const r = I.attachCodingResolution("M-BAD", { cwd, context: engCtx("M-BAD", ["src/"], cwd), toolchain: ALL, execute: true, runner: checkRunner, toolchainAvailable: true });
  ok("execute ON + broken ⇒ executionResult FAILED, executed false", r.resolution.executionResult.status === "FAILED" && r.resolution.executed === false);
  fs.rmSync(cwd, { recursive: true, force: true });
}

// (4) VE codingFidelityGate: EXECUTE + executionResult FAILED ⇒ BLOCK; EXECUTE + VERIFIED ⇒ no block.
ok("gate: EXECUTE + FAILED check ⇒ block", MFV.codingFidelityGate({ codingMission: true, route: "EXECUTE", executionResult: { status: "FAILED" } }).block === true);
ok("gate: EXECUTE + BLOCKED check ⇒ block", MFV.codingFidelityGate({ codingMission: true, route: "EXECUTE", executionResult: { status: "BLOCKED" } }).block === true);
ok("gate: EXECUTE + VERIFIED check ⇒ no block", MFV.codingFidelityGate({ codingMission: true, route: "EXECUTE", executionResult: { status: "VERIFIED" }, executed: true }).block === false);
ok("gate: EXECUTE + NO executionResult ⇒ no block (unchanged)", MFV.codingFidelityGate({ codingMission: true, route: "EXECUTE" }).block === false);
ok("gate: ROUTE_UNSUPPORTED still blocks (regression check)", MFV.codingFidelityGate({ codingMission: true, route: "ROUTE_UNSUPPORTED" }).block === true);

console.log(`\nCODING-EXECUTE-WIRE suite — ${pass} assertions passed. (opt-in execute default OFF ⇒ zero regression; ON records real executionResult; VE gate blocks EXECUTE+FAILED, allows EXECUTE+VERIFIED)`);
