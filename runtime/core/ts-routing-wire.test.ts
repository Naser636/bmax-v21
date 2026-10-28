#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the project-aware TS check is wired into the REAL execution path: the executor
// uses project-mode tsc for TypeScript+tsconfig (sound with imports), and the result is consumed by the VE fidelity
// gate. Covers: clean-with-imports⇒VERIFIED, type-error⇒FAILED, missing-symbol⇒FAILED, invalid-config⇒FAILED/BLOCKED,
// compiler-absent⇒BLOCKED, timeout⇒BLOCKED, and gate blocks any non-VERIFIED. tsRunner INJECTED (zero subprocess).
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const X = require("./coding-executor.js");
const I = require("./mission-coding-integration.js");
const MFV = require("./mission-fidelity-verdict.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

function tsWorkspace() { const d = fs.mkdtempSync(path.join(os.tmpdir(), "odg-tsroute-")); fs.writeFileSync(path.join(d, "tsconfig.json"), JSON.stringify({ compilerOptions: { noEmit: true } })); fs.mkdirSync(path.join(d, "src")); fs.writeFileSync(path.join(d, "src", "a.ts"), "export const a = 1;\n"); return d; }
const EXEC_TS = { route: "EXECUTE", language: "TypeScript", plan: { writeSet: ["src/"] } };
// tsRunner emulates `node tsc`: --version ⇒ 0; project check ⇒ per scenario.
const ver = (args) => args[0] === "--version";
const tsPass = (args) => ver(args) ? { exitCode: 0, stdout: "5.9" } : { exitCode: 0, stdout: "", stderr: "" };
const tsType = (args) => ver(args) ? { exitCode: 0 } : { exitCode: 2, stdout: "", stderr: "src/b.ts(2,7): error TS2322: Type 'string' is not assignable to type 'number'." };
const tsMissing = (args) => ver(args) ? { exitCode: 0 } : { exitCode: 2, stdout: "", stderr: "src/b.ts(1,10): error TS2305: Module '\"./a\"' has no exported member 'z'." };
const tsDown = () => ({ spawnError: "ENOENT" });
const tsTimeout = (args) => ver(args) ? { exitCode: 0 } : { timedOut: true };

// (1) EXECUTOR uses project-mode for TS+tsconfig: clean ⇒ VERIFIED (mode typescript-project).
{ const d = tsWorkspace(); const r = X.executeCodingResolution(EXEC_TS, { workspaceDir: d, tsconfig: "tsconfig.json", tsRunner: tsPass });
  ok("TS+tsconfig clean ⇒ VERIFIED via project-mode", r.status === "VERIFIED" && r.mode === "typescript-project" && r.executed === true); fs.rmSync(d, { recursive: true, force: true }); }

// (2) cross-file type error ⇒ FAILED (+errorCount), executed true.
{ const d = tsWorkspace(); const r = X.executeCodingResolution(EXEC_TS, { workspaceDir: d, tsconfig: "tsconfig.json", tsRunner: tsType });
  ok("TS type error ⇒ FAILED (project-mode, errorCount)", r.status === "FAILED" && r.errorCount === 1 && r.executed === true); fs.rmSync(d, { recursive: true, force: true }); }

// (3) missing symbol/import ⇒ FAILED.
{ const d = tsWorkspace(); const r = X.executeCodingResolution(EXEC_TS, { workspaceDir: d, tsconfig: "tsconfig.json", tsRunner: tsMissing });
  ok("TS missing symbol ⇒ FAILED", r.status === "FAILED" && r.errorCount === 1); fs.rmSync(d, { recursive: true, force: true }); }

// (4) compiler absent ⇒ BLOCKED (never VERIFIED).
{ const d = tsWorkspace(); const r = X.executeCodingResolution(EXEC_TS, { workspaceDir: d, tsconfig: "tsconfig.json", tsRunner: tsDown });
  ok("compiler absent ⇒ BLOCKED (not VERIFIED)", r.status === "BLOCKED" && r.executed === false); fs.rmSync(d, { recursive: true, force: true }); }

// (5) timeout ⇒ BLOCKED.
{ const d = tsWorkspace(); const r = X.executeCodingResolution(EXEC_TS, { workspaceDir: d, tsconfig: "tsconfig.json", tsRunner: tsTimeout });
  ok("timeout ⇒ BLOCKED", r.status === "BLOCKED"); fs.rmSync(d, { recursive: true, force: true }); }

// (6) invalid tsconfig that exists ⇒ tsc non-zero ⇒ FAILED (not PASS).
{ const d = fs.mkdtempSync(path.join(os.tmpdir(), "odg-tsroute-bad-")); fs.writeFileSync(path.join(d, "tsconfig.json"), "{ not json ");
  const r = X.executeCodingResolution(EXEC_TS, { workspaceDir: d, tsconfig: "tsconfig.json", tsRunner: (args) => ver(args) ? { exitCode: 0 } : { exitCode: 1, stderr: "error TS1005" } });
  ok("invalid tsconfig ⇒ FAILED (never PASS)", r.status === "FAILED"); fs.rmSync(d, { recursive: true, force: true }); }

// (7) FULL CHAIN via attachCodingResolution: context.tsconfig flows → executor project-mode → executionResult consumed by VE gate.
{ const d = tsWorkspace(); fs.mkdirSync(path.join(d, "runtime", "generated"), { recursive: true });
  const ctx = { version: 1, mission: "M-TSWIRE", requiresEngineering: true, authorizedPaths: ["src/"], definitionOfDone: ["ok"], runtime: { root: d }, tsconfig: "tsconfig.json" };
  const good = I.attachCodingResolution("M-TSWIRE", { cwd: d, context: ctx, toolchain: { TypeScript: true }, execute: true, tsRunner: tsPass });
  ok("chain: clean TS project ⇒ executionResult VERIFIED (mode typescript-project)", good.resolution.executionResult.status === "VERIFIED" && good.resolution.executionResult.mode === "typescript-project");
  ok("VE gate: VERIFIED ⇒ no block", MFV.codingFidelityGate(good.resolution).block === false);
  const bad = I.attachCodingResolution("M-TSWIRE", { cwd: d, context: ctx, toolchain: { TypeScript: true }, execute: true, tsRunner: tsType });
  ok("chain: TS type error ⇒ executionResult FAILED", bad.resolution.executionResult.status === "FAILED");
  ok("VE gate: EXECUTE+FAILED ⇒ BLOCK (checker result consumed by final decision)", MFV.codingFidelityGate(bad.resolution).block === true);
  fs.rmSync(d, { recursive: true, force: true }); }

console.log(`\nTS-ROUTING-WIRE suite — ${pass} assertions passed. (project-mode TS on the real exec path; clean⇒VERIFIED, errors⇒FAILED, absent/timeout/invalid⇒never PASS; VE gate consumes the result)`);
