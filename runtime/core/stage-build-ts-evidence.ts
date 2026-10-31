#!/usr/bin/env node
/**
 * Build/TS Evidence stage (P0-C#3 part 2, forensic Option D). Produces FRESH, THIS-MISSION build + TypeScript
 * evidence AFTER the Patch Executor and BEFORE the Validation Engine, so the engineering build/TS gate is judged
 * on real post-patch evidence instead of an absent/stale runtime-verify.json (the C#3 fail-open).
 *
 * It WRITES runtime/generated/runtime-verify.json stamped with THIS mission; it does NOT judge/halt — a red build
 * is recorded as `build:false` and the Validation Engine's existing Build-Recovery path handles it (unchanged). So
 * this stage exits 0 whenever it produced the evidence artifact (RC-1 in stage-effect confirms the write); its only
 * failure mode is an inability to write the artifact.
 *
 * DELIBERATELY build + TypeScript ONLY — NOT gitClean. At this pipeline point the mission's deliverable is
 * applied-but-UNCOMMITTED (the commit/gitClean check lives downstream at the S4 / Mission-Lifecycle gate), so the
 * tree is legitimately dirty here and a gitClean check would wrongly fail. Spawned as `node <dist>/stage-build-ts-
 * evidence.js <mission>` by odg-run; reads the mission from argv or mission-plan.json. Compiled-dist, require-based.
 *
 * SCOPE (p0c3-stage-scope-readonly): build + tsc run ONLY for ENGINEERING missions — the exact predicate the
 * Validation Engine uses (plan.requiresEngineering === true || authorizedPaths.length > 0 — write-set-derived; see isEngineeringMission).
 * For NON-engineering / read-only / AUDIT missions the VE never consults build/typescript, so this stage SKIPS the
 * expensive build/tsc (restoring read-only missions' pre-C#3 zero-build, deterministic, untouched behaviour — a red
 * tree no longer perturbs them) while STILL writing the mission-stamped RC-1 artifact (with an honest skip marker,
 * never a fabricated green). The absent-verify BLOCK for engineering missions is therefore unchanged.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const GENERATED_DIR = path.join("runtime", "generated");
const VERIFY_PATH = path.join(GENERATED_DIR, "runtime-verify.json");

function readJsonSafe(p: string): any { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }

function readPlan(): any {
  return readJsonSafe(path.join(GENERATED_DIR, "mission-plan.json"));
}

/** Resolve THIS mission: the odg-run spawn passes it as argv[2]; fall back to mission-plan.json's mission. */
function resolveMission(plan?: any): string | null {
  const arg = process.argv[2];
  if (typeof arg === "string" && arg.length > 0) return arg;
  const p = plan === undefined ? readPlan() : plan;
  return p && typeof p.mission === "string" ? p.mission : null;
}

/**
 * Engineering-mission predicate — a BYTE-FOR-BYTE mirror of the Validation Engine's own gate
 * (runtime/core/validation-engine.ts:101-102):
 *   const authorizedPaths = Array.isArray(plan.authorizedPaths) ? plan.authorizedPaths : [];
 *   const isEngineering   = plan.requiresEngineering === true || authorizedPaths.length > 0;  // WRITE-SET-DERIVED (OR)
 * These two definitions MUST stay identical: the VE short-circuits both engineeringOk and
 * verifyEvidenceOk to TRUE when !isEngineering, so for a non-engineering mission the VE never
 * consults build/typescript. If this stage skipped under a DIFFERENT (looser) predicate than the
 * VE's, a mission the VE still treats as engineering would reach validation with no this-run
 * build/TS evidence ⇒ the C#3 absent-verify BLOCK would (correctly) fire — i.e. a false block.
 * Keeping the predicate identical guarantees: VE-engineering ⇒ real build/TS evidence produced;
 * VE-non-engineering ⇒ skipped (no evidence needed, none consulted).
 */
function isEngineeringMission(plan: any): boolean {
  const authorizedPaths = Array.isArray(plan && plan.authorizedPaths) ? plan.authorizedPaths : [];
  // WRITE-SET-DERIVED (OR) — byte-identical to validation-engine.ts:102. A mission is engineering if it declares the
  // flag OR holds a write-set. Pinned identical to the VE so stage-skips ⟺ VE-non-engineering (no window where the
  // stage skips build evidence that the VE then demands). Changed from AND to OR to close the flag-trusting fail-open.
  return !!(plan && plan.requiresEngineering === true) || authorizedPaths.length > 0;
}

// Real build/tsc executors — mirror odg-verify's commands exactly; NO gitClean here (applied-but-uncommitted is
// legitimate at this pipeline point). Each returns a boolean verdict and never throws. Injectable via runBuildTsEvidence
// opts so the stage is hermetically testable (prove skip ⇒ never invoked, engineering ⇒ invoked) WITHOUT a real build.
function defaultBuild(): boolean { try { cp.execSync("npm run build", { stdio: "ignore" }); return true; } catch { return false; } }
function defaultTsc(): boolean { try { cp.execSync("npx tsc --noEmit", { stdio: "ignore" }); return true; } catch { return false; } }

function runBuildTsEvidence(opts?: { buildFn?: () => boolean; tscFn?: () => boolean }): any {
  const plan = readPlan();
  const mission = resolveMission(plan);
  // PRESERVE any fields a prior odg-verify wrote (e.g. gitClean/documentationProofPresent) so we only refresh the
  // post-patch build/TS verdict + mission stamp; never fabricate gitClean here (left to whatever produced it, or absent).
  const prior = readJsonSafe(VERIFY_PATH) || {};
  const engineering = isEngineeringMission(plan);
  let verify: any;
  if (!engineering) {
    // READ-ONLY / AUDIT / non-engineering mission (p0c3-stage-scope-readonly): do NOT run `npm run build` + `tsc`
    // (pure ~38s latency + perturbation for a mission that engineers nothing). STILL write the mission-stamped RC-1
    // artifact (stage-effect requires the declared output).
    //
    // The build/TS verdict for a non-engineering mission is NOT-APPLICABLE. We MUST encode it as build:true /
    // typescript:true — NOT because a build ran, but because the Validation Engine folds buildOk/typescriptOk into
    // its UNCONDITIONAL validated AND-chain (validation-engine.ts:346) and defaults them TRUE only when NO verify is
    // present (:176-177 `verify ? verify.build===true : true`). Writing a present verify WITHOUT build:true would
    // flip buildOk=false ⇒ (a) BLOCK every read-only mission and (b) fire an expensive build-recovery (:187) — both
    // regressions. true here therefore reproduces the HISTORICAL read-only semantics (no-verify ⇒ gate passes) and
    // keeps a red repo from blocking a read-only mission (directive §4.A). The companion markers make it unambiguous
    // that NO build executed: a build never ran, the gate is satisfied by non-applicability.
    verify = { ...prior, generatedAt: new Date().toISOString(), build: true, typescript: true, buildExecuted: false, skipped: true, skipReason: "non-engineering (read-only/AUDIT) mission — build/TS not run; gate N/A (satisfied by non-applicability)", mission, producedBy: "stage-build-ts-evidence" };
  } else {
    const buildFn = (opts && opts.buildFn) || defaultBuild;
    const tscFn = (opts && opts.tscFn) || defaultTsc;
    const build = buildFn();
    const typescript = tscFn();
    verify = { ...prior, generatedAt: new Date().toISOString(), build, typescript, mission, producedBy: "stage-build-ts-evidence" };
    // runtime/generated/runtime-verify.json persists across missions in the shared workspace. If a PRIOR
    // read-only run left skip markers, they must NOT leak into THIS engineering artifact (they would read as a
    // self-contradiction, e.g. build:false alongside skipped:true). A real engineering build DID run here, so
    // drop any inherited non-engineering markers.
    delete (verify as any).skipped;
    delete (verify as any).buildExecuted;
    delete (verify as any).skipReason;
  }
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  fs.writeFileSync(VERIFY_PATH, JSON.stringify(verify, null, 2));
  return verify;
}

module.exports = { runBuildTsEvidence, resolveMission, isEngineeringMission, defaultBuild, defaultTsc, VERIFY_PATH };
export {};

if (require.main === module) {
  const v = runBuildTsEvidence();
  if (v.skipped) console.log(`Build/TS Evidence : SKIPPED (non-engineering/read-only) mission=${v.mission} — artifact stamped, build/tsc not run`);
  else console.log(`Build/TS Evidence : build=${v.build} typescript=${v.typescript} mission=${v.mission} (post-patch, this-run)`);
  // Always exit 0 when the artifact was produced — the Validation Engine judges build/tsc + runs recovery on red.
  process.exit(0);
}
