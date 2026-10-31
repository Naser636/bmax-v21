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
 */
"use strict";

const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const GENERATED_DIR = path.join("runtime", "generated");
const VERIFY_PATH = path.join(GENERATED_DIR, "runtime-verify.json");

function readJsonSafe(p: string): any { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }

/** Resolve THIS mission: the odg-run spawn passes it as argv[2]; fall back to mission-plan.json's mission. */
function resolveMission(): string | null {
  const arg = process.argv[2];
  if (typeof arg === "string" && arg.length > 0) return arg;
  const plan = readJsonSafe(path.join(GENERATED_DIR, "mission-plan.json"));
  return plan && typeof plan.mission === "string" ? plan.mission : null;
}

function runBuildTsEvidence(): any {
  const mission = resolveMission();
  // build/TS ONLY — mirror odg-verify's commands exactly; NO gitClean here (applied-but-uncommitted is legitimate).
  let build = true, typescript = true;
  try { cp.execSync("npm run build", { stdio: "ignore" }); } catch { build = false; }
  try { cp.execSync("npx tsc --noEmit", { stdio: "ignore" }); } catch { typescript = false; }
  // PRESERVE any fields a prior odg-verify wrote (e.g. gitClean/documentationProofPresent) so we only refresh the
  // post-patch build/TS verdict + mission stamp; never fabricate gitClean here (left to whatever produced it, or absent).
  const prior = readJsonSafe(VERIFY_PATH) || {};
  const verify = { ...prior, generatedAt: new Date().toISOString(), build, typescript, mission, producedBy: "stage-build-ts-evidence" };
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  fs.writeFileSync(VERIFY_PATH, JSON.stringify(verify, null, 2));
  return verify;
}

module.exports = { runBuildTsEvidence, resolveMission, VERIFY_PATH };
export {};

if (require.main === module) {
  const v = runBuildTsEvidence();
  console.log(`Build/TS Evidence : build=${v.build} typescript=${v.typescript} mission=${v.mission} (post-patch, this-run)`);
  // Always exit 0 when the artifact was produced — the Validation Engine judges build/tsc + runs recovery on red.
  process.exit(0);
}
