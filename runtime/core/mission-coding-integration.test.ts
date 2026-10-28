#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Tests the C-08 real-path hook: a canonical MissionContext (injected or from a temp
// cwd) → resolveCodingMission → persisted coding-resolution.json, preserving EXECUTE/ROUTE_UNSUPPORTED/ABSTAIN/BLOCKED
// and NEVER marking execution; bounded read-only scan of authorizedPaths derives real repo signals; non-engineering
// missions are not coding-routed; fail-closed on missing context. Real fs on a temp cwd; zero subprocess.
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const I = require("./mission-coding-integration.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const ALL = { JavaScript: true, TypeScript: true, Python: true };
function engCtx(mission, authorizedPaths, root) {
  return { version: 1, mission, requiresEngineering: true, authorizedPaths, objectives: [{ id: "o1", goal: "x" }], definitionOfDone: ["tsc passes"], runtime: root ? { root } : null };
}
function tmpCwd() { const d = fs.mkdtempSync(path.join(os.tmpdir(), "odg-c08-")); fs.mkdirSync(path.join(d, "runtime", "generated"), { recursive: true }); return d; }

// (1) EXECUTE: injected TS repo signals + authorizedPaths ⇒ persisted resolution, executed:false.
{
  const cwd = tmpCwd();
  const r = I.attachCodingResolution("M-TS", { cwd, context: engCtx("M-TS", ["src/"]), repoSignals: { files: ["src/a.ts"], manifests: { "package.json": {} } }, toolchain: ALL });
  ok("EXECUTE persisted + executed:false", r.ok && r.resolution.route === "EXECUTE" && r.resolution.executed === false && r.resolution.persisted === true);
  const disk = JSON.parse(fs.readFileSync(path.join(cwd, "runtime", "generated", "coding-resolution.json"), "utf8"));
  ok("coding-resolution.json on disk carries route+fidelityContract", disk.route === "EXECUTE" && Array.isArray(disk.fidelityContract.requiredOutcomes) && disk.executed === false);
  fs.rmSync(cwd, { recursive: true, force: true });
}

// (2) ROUTE_UNSUPPORTED (Go) and ABSTAIN (unknown) preserved; BLOCKED when no authorizedPaths — none marked executed.
{
  const cwd = tmpCwd();
  const go = I.attachCodingResolution("M-GO", { cwd, context: engCtx("M-GO", ["src/"]), repoSignals: { files: ["main.go"], manifests: { "go.mod": {} } }, toolchain: ALL });
  ok("Go ⇒ ROUTE_UNSUPPORTED, not executed", go.resolution.route === "ROUTE_UNSUPPORTED" && go.resolution.executed === false);
  const ab = I.attachCodingResolution("M-UNK", { cwd, context: engCtx("M-UNK", ["src/"]), repoSignals: { files: ["README"], manifests: {} }, toolchain: ALL });
  ok("unknown ⇒ ABSTAIN, not executed", ab.resolution.route === "ABSTAIN" && ab.resolution.executed === false);
  const bl = I.attachCodingResolution("M-NOPATH", { cwd, context: engCtx("M-NOPATH", []), repoSignals: { files: ["src/a.ts"], manifests: { "package.json": {} } }, toolchain: ALL });
  ok("no authorizedPaths ⇒ BLOCKED, not executed", bl.resolution.route === "BLOCKED" && bl.resolution.executed === false);
  fs.rmSync(cwd, { recursive: true, force: true });
}

// (3) non-engineering mission ⇒ NOT_A_CODING_MISSION (not coding-routed).
{
  const cwd = tmpCwd();
  const r = I.attachCodingResolution("M-RO", { cwd, context: { mission: "M-RO", requiresEngineering: false, authorizedPaths: [] } });
  ok("read-only mission ⇒ NOT_A_CODING_MISSION", r.ok && r.resolution.route === "NOT_A_CODING_MISSION" && r.resolution.codingMission === false);
  fs.rmSync(cwd, { recursive: true, force: true });
}

// (4) BOUNDED SCAN derives real repo signals from authorizedPaths (no injected signals).
{
  const cwd = tmpCwd();
  fs.mkdirSync(path.join(cwd, "svc"), { recursive: true });
  fs.writeFileSync(path.join(cwd, "svc", "app.ts"), "export const x = 1;\n");
  fs.writeFileSync(path.join(cwd, "svc", "util.ts"), "export const y = 2;\n");
  fs.writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ name: "t" }));
  const sig = I.scanRepoSignals(cwd, ["svc/"]);
  ok("scan finds the .ts files + root package.json manifest", sig.files.some(f => f.endsWith("svc/app.ts")) && "package.json" in sig.manifests && sig.scannedCount >= 2);
  const r = I.attachCodingResolution("M-SCAN", { cwd, context: engCtx("M-SCAN", ["svc/"], cwd), toolchain: ALL });
  ok("scanned signals drive EXECUTE (TypeScript)", r.resolution.route === "EXECUTE" && r.resolution.language === "TypeScript" && r.resolution.signalsScanned >= 2);
  fs.rmSync(cwd, { recursive: true, force: true });
}

// (5) scan is bounded + guarded: ignores node_modules/.git; missing authorizedPath ⇒ no throw.
{
  const cwd = tmpCwd();
  fs.mkdirSync(path.join(cwd, "src", "node_modules", "dep"), { recursive: true });
  fs.writeFileSync(path.join(cwd, "src", "node_modules", "dep", "x.js"), "1");
  fs.writeFileSync(path.join(cwd, "src", "real.js"), "1");
  const sig = I.scanRepoSignals(cwd, ["src/", "does/not/exist/"]);
  ok("scan skips node_modules, tolerates missing paths", sig.files.some(f => f.endsWith("src/real.js")) && !sig.files.some(f => f.includes("node_modules")));
  fs.rmSync(cwd, { recursive: true, force: true });
}

// (6) fail-closed: no context file + none injected ⇒ NO_CONTEXT (no crash, no fabrication).
{
  const cwd = tmpCwd();
  ok("missing mission-context.json ⇒ NO_CONTEXT", I.attachCodingResolution("M-NONE", { cwd }).code === "NO_CONTEXT");
  fs.rmSync(cwd, { recursive: true, force: true });
}

// (7) reads the canonical artifact from disk when not injected (proves the real-path contract).
{
  const cwd = tmpCwd();
  fs.writeFileSync(path.join(cwd, "runtime", "generated", "mission-context.json"), JSON.stringify(engCtx("M-DISK", ["src/"], cwd)));
  fs.mkdirSync(path.join(cwd, "src"), { recursive: true }); fs.writeFileSync(path.join(cwd, "src", "a.py"), "x=1\n");
  const r = I.attachCodingResolution("M-DISK", { cwd, toolchain: ALL });
  ok("reads mission-context.json from disk ⇒ resolves (Python EXECUTE)", r.ok && r.resolution.route === "EXECUTE" && r.resolution.language === "Python");
  fs.rmSync(cwd, { recursive: true, force: true });
}

console.log(`\nMISSION-CODING-INTEGRATION suite — ${pass} assertions passed. (real-path hook: context→resolve→persist; EXECUTE/ROUTE_UNSUPPORTED/ABSTAIN/BLOCKED preserved, never executed; bounded guarded scan; fail-closed)`);
