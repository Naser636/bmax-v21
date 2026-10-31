#!/usr/bin/env node
// @ts-nocheck — behavioural test for the Build/TS Evidence pipeline stage (runs under tsx; suppresses tsc typecheck only).

/*
 * Build/TS Evidence stage — p0c3-stage-scope-readonly.
 *
 * Proves the stage runs build/tsc ONLY for ENGINEERING missions (the EXACT Validation Engine predicate
 * `plan.requiresEngineering === true && authorizedPaths.length > 0`) and SKIPS the expensive build/tsc for
 * non-engineering / read-only / AUDIT missions, while ALWAYS writing the mission-stamped RC-1 artifact.
 * Hermetic: runs in a throwaway cwd with injected build/tsc spies — never a real `npm run build` / `tsc`,
 * no network. The real pipeline + Validation Engine integration is covered by
 * validation-engine-engineering-proof.test.ts (read-only + engineering cases).
 *
 * Run: node runtime/core/stage-build-ts-evidence.test.js
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const S = require("./stage-build-ts-evidence.js");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

console.log("Build/TS Evidence stage — scope (engineering vs read-only)");

// --- isEngineeringMission: EXACT mirror of validation-engine.ts:101-102 — boundary cases ----------
ok("predicate: requiresEngineering true + authorizedPaths non-empty ⇒ engineering", S.isEngineeringMission({ requiresEngineering: true, authorizedPaths: ["runtime/app"] }) === true);
ok("predicate: requiresEngineering false ⇒ NOT engineering (read-only)", S.isEngineeringMission({ requiresEngineering: false, authorizedPaths: ["runtime/app"] }) === false);
ok("predicate: requiresEngineering true but authorizedPaths EMPTY ⇒ NOT engineering", S.isEngineeringMission({ requiresEngineering: true, authorizedPaths: [] }) === false);
ok("predicate: requiresEngineering missing ⇒ NOT engineering", S.isEngineeringMission({ authorizedPaths: ["x"] }) === false);
ok("predicate: requiresEngineering truthy-but-not-===true (1) ⇒ NOT engineering (strict ===true, matches VE)", S.isEngineeringMission({ requiresEngineering: 1, authorizedPaths: ["x"] }) === false);
ok("predicate: authorizedPaths not an array ⇒ NOT engineering", S.isEngineeringMission({ requiresEngineering: true, authorizedPaths: "runtime/app" }) === false);
ok("predicate: null / undefined plan ⇒ NOT engineering (no throw)", S.isEngineeringMission(null) === false && S.isEngineeringMission(undefined) === false);

// --- runBuildTsEvidence behaviour in a throwaway cwd with injected spies --------------------------
const REAL_CWD = process.cwd();
function inTempCwd(plan, opts, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-bts-"));
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  if (plan !== undefined) fs.writeFileSync(path.join(dir, "runtime", "generated", "mission-plan.json"), JSON.stringify(plan));
  if (opts && opts.priorVerify) fs.writeFileSync(path.join(dir, "runtime", "generated", "runtime-verify.json"), JSON.stringify(opts.priorVerify));
  const savedArgv = process.argv[2];
  if (opts && "argv2" in opts) process.argv[2] = opts.argv2; else process.argv[2] = undefined;
  process.chdir(dir);
  let out;
  try { out = fn(); } finally {
    process.chdir(REAL_CWD);
    process.argv[2] = savedArgv;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
  return out;
}

// 1. NON-engineering (requiresEngineering false): build/tsc spies must NOT be called; artifact written with a
//    skip marker + mission stamp and NO build/typescript keys (their ABSENCE proves the build branch wasn't taken).
{
  const spy = { build: 0, tsc: 0 };
  const res = inTempCwd({ mission: "RO1", requiresEngineering: false, authorizedPaths: ["runtime/app"] }, {}, () =>
    S.runBuildTsEvidence({ buildFn: () => { spy.build++; return true; }, tscFn: () => { spy.tsc++; return true; } }));
  ok("read-only: build spy NEVER called (no `npm run build`)", spy.build === 0);
  ok("read-only: tsc spy NEVER called (no `tsc`)", spy.tsc === 0);
  ok("read-only: artifact marks skipped:true + honest skipReason + buildExecuted:false (no build actually ran)", res.skipped === true && /N\/A/.test(res.skipReason || "") && res.buildExecuted === false);
  ok("read-only: build/typescript encoded TRUE = gate N/A (preserves historical no-verify pass; VE would not block, no recovery)", res.build === true && res.typescript === true);
  ok("read-only: mission identity stamped from plan", res.mission === "RO1");
}

// 2. RED build in the repo does NOT block a non-engineering mission: even if the injected build would report false,
//    it is never invoked for read-only, so the mission is unaffected (deterministic). Artifact still produced (RC-1).
{
  const spy = { build: 0 };
  let artifactExisted = false;
  const res = inTempCwd({ mission: "RO2", requiresEngineering: false, authorizedPaths: ["runtime/app"] }, {}, () => {
    const r = S.runBuildTsEvidence({ buildFn: () => { spy.build++; return false; /* red */ }, tscFn: () => false });
    artifactExisted = fs.existsSync(path.join("runtime", "generated", "runtime-verify.json"));
    return r;
  });
  ok("read-only + red build available: build still NEVER invoked (mission not perturbed)", spy.build === 0);
  ok("read-only: RC-1 artifact present on disk (stage-effect satisfied)", artifactExisted === true);
  ok("read-only: NOT marked build:false (a red repo never blocks a read-only mission; buildExecuted:false records honesty)", res.build === true && res.buildExecuted === false);
}

// 3. ENGINEERING (requiresEngineering true + non-empty authorizedPaths): build/tsc spies ARE called; artifact
//    carries build + typescript verdicts + mission. Behaviour unchanged from C#3.
{
  const spy = { build: 0, tsc: 0 };
  const res = inTempCwd({ mission: "ENG1", requiresEngineering: true, authorizedPaths: ["runtime/app"] }, {}, () =>
    S.runBuildTsEvidence({ buildFn: () => { spy.build++; return true; }, tscFn: () => { spy.tsc++; return true; } }));
  ok("engineering: build spy called exactly once", spy.build === 1);
  ok("engineering: tsc spy called exactly once", spy.tsc === 1);
  ok("engineering: artifact carries build:true + typescript:true + mission", res.build === true && res.typescript === true && res.mission === "ENG1");
  ok("engineering: NOT marked skipped", res.skipped !== true);
}

// 4. ENGINEERING with a RED build: the stage records build:false and does NOT throw; artifact still written (the VE's
//    existing Build-Recovery path judges it downstream — unchanged).
{
  const res = inTempCwd({ mission: "ENG2", requiresEngineering: true, authorizedPaths: ["runtime/app"] }, {}, () =>
    S.runBuildTsEvidence({ buildFn: () => false, tscFn: () => true }));
  ok("engineering red build: build:false recorded (honest), typescript:true, artifact still produced", res.build === false && res.typescript === true && !res.skipped);
}

// 5. BOUNDARY: requiresEngineering true but authorizedPaths EMPTY ⇒ treated non-engineering ⇒ SKIP (spies not called).
{
  const spy = { build: 0 };
  const res = inTempCwd({ mission: "B1", requiresEngineering: true, authorizedPaths: [] }, {}, () =>
    S.runBuildTsEvidence({ buildFn: () => { spy.build++; return true; }, tscFn: () => true }));
  ok("boundary: requiresEngineering true + empty authorizedPaths ⇒ skipped (predicate matches VE)", res.skipped === true && spy.build === 0);
}

// 6. MISSION IDENTITY: argv[2] overrides the plan's mission (odg-run passes the mission as argv[2]).
{
  const res = inTempCwd({ mission: "PLAN_MISSION", requiresEngineering: false, authorizedPaths: ["x"] }, { argv2: "ARGV_MISSION" }, () =>
    S.runBuildTsEvidence({ buildFn: () => true, tscFn: () => true }));
  ok("identity: argv[2] mission wins over plan.mission", res.mission === "ARGV_MISSION");
}

// 7. PRESERVE prior fields: a prior odg-verify's gitClean is carried forward (never clobbered) in the engineering branch.
{
  const res = inTempCwd({ mission: "ENG3", requiresEngineering: true, authorizedPaths: ["runtime/app"] }, { priorVerify: { gitClean: true, documentationProofPresent: true } }, () =>
    S.runBuildTsEvidence({ buildFn: () => true, tscFn: () => true }));
  ok("preserve: prior gitClean/documentationProofPresent carried forward alongside fresh build/TS", res.gitClean === true && res.documentationProofPresent === true && res.build === true);
}

console.log(`\nBuild/TS Evidence stage scope — ${passed} assertions passed.`);
