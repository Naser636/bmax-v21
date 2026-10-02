/*
 * Phase 0 certification test (wired into `npm test`).
 *
 * Encodes the 8 falsifiable criteria from docs/audit/phase-0/current/PHASE_0_CARNET.md
 * (A1-A4 = ROOT CAUSE #1, B1-B4 = ROOT CAUSE #2). Originally authored as the read-only
 * P0-CURRENT-011 harness in a scratchpad; now wired here as a permanent regression guard
 * so the certified behaviour cannot silently regress. Read-only: imports production modules
 * and reads contracts/sources WITHOUT writing any artifact (keeps the worktree clean).
 *
 * Run directly: node_modules/.bin/tsx src/runtime/phase0-certification.test.ts
 *
 *   A1 objectives are a function of the requested mission (per-mission source).
 *   A2 plan signature is a function of the mission (C2 regression witness: must differ).
 *   A3 semantic plan fields exist (actions/dependencies/postconditions/verificationRequirements).
 *   A4 plan carries a dependency/edge structure.
 *   B1 SUCCESS requires every objective executed.
 *   B2 SUCCESS requires every required verification/postcondition to pass.
 *   B3 absent/failed/invalid proof each blocks SUCCESS.
 *   B4 exactly one guarded SUCCESS writer (no unconditional literal).
 */

import fs from "node:fs";
import { MissionLoader } from "./mission-loader";
import { MissionOrchestrator } from "./mission-orchestrator";
import { RuntimeReporter } from "./runtime-reporter";
import { createMissionIntent } from "./mission-intent";

const SRC = "src/runtime";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) {
    console.log(`  PASS ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}

const stripSig = (plan: any) =>
  JSON.stringify({
    objectives: plan.objectives,
    steps: (plan.steps ?? []).map((s: any) => ({ id: s.id, name: s.name, status: s.status })),
    dependencies: plan.dependencies ?? null,
    actions: plan.actions ?? null,
    postconditions: plan.postconditions ?? null,
    verification: plan.verificationRequirements ?? null,
  });

// Two semantically OPPOSITE missions that MUST produce different objectives/plans.
const M1 = { id: "ADD_OAUTH_LOGIN", name: "Add OAuth login" };
const M2 = { id: "WIPE_AND_MIGRATE_DB", name: "Delete all caches and migrate DB" };

console.log("PHASE 0 CERTIFICATION — 8 falsifiable criteria (A1-A4 / B1-B4)");

// ---------- ROOT CAUSE #1 ----------

// A1 — objectives are a function of the requested mission (real per-mission source).
{
  const loader = new MissionLoader();
  const o1 = loader.load(M1.id, M1.name).brain.objectives;
  const o2 = loader.load(M2.id, M2.name).brain.objectives;
  const differ = JSON.stringify(o1) !== JSON.stringify(o2);
  // A mission WITH a contract must yield that contract's OWN objectives, and two
  // different contracts must yield different objectives.
  const c1 = loader.load("M0000", "M0000").brain.objectives;
  const c2 = loader.load("RUNTIME_SELF_AUDIT", "RUNTIME_SELF_AUDIT").brain.objectives;
  let contractObjectives: string[] = [];
  try {
    const raw = JSON.parse(fs.readFileSync(`${"runtime/missions"}/M0000.json`, "utf8")).objectives;
    contractObjectives = (Array.isArray(raw) ? raw : []).map((o: any) =>
      o && typeof o === "object" ? o.goal : String(o),
    );
  } catch { /* leave empty */ }
  const contractMatch = JSON.stringify(c1) === JSON.stringify(contractObjectives);
  const contractsDiffer = JSON.stringify(c1) !== JSON.stringify(c2);
  check(differ && contractMatch && contractsDiffer, "A1 objectives are a function of the mission");
}

// A2 — plan signature (label-stripped) is a function of the mission. This is the C2 witness.
let plan1: any, plan2: any;
{
  const orch = new MissionOrchestrator();
  plan1 = orch.buildPlan(M1.id, M1.name, createMissionIntent(M1.id));
  plan2 = orch.buildPlan(M2.id, M2.name, createMissionIntent(M2.id));
  check(stripSig(plan1) !== stripSig(plan2), "A2 plan signature differs for different missions (C2 witness)");
}

// A3 — semantic plan fields EXIST on an objective step.
{
  const step = (plan1.steps ?? []).find((s: any) => /^OBJECTIVE_/.test(s.id)) ?? plan1.steps?.[0] ?? {};
  const need = ["actions", "dependencies", "postconditions", "verificationRequirements"];
  check(need.every((k) => k in step), "A3 semantic plan fields exist (actions/deps/postconditions/verification)");
}

// A4 — plan carries a dependency/edge structure.
{
  check(!!(plan1.dependencies || plan1.edges || plan1.graph), "A4 plan carries a dependency/edge structure");
}

// ---------- ROOT CAUSE #2 ----------
const reporter = new RuntimeReporter();

// B1 — SUCCESS requires EVERY objective executed.
{
  const r = reporter.report({ mission: M1.id, objectivesTotal: 3, objectivesExecuted: 0 });
  check(r.status !== "SUCCESS", "B1 SUCCESS requires every objective executed");
}

// B2 — SUCCESS requires every required verification/postcondition to pass.
{
  const r = reporter.report({ mission: M1.id, verification: { required: 1, passed: 0 } });
  check(r.status !== "SUCCESS", "B2 SUCCESS requires required verification/postcondition pass");
}

// B3 — absent / failed / invalid proof each BLOCKS SUCCESS.
{
  const absent = reporter.report({ mission: M1.id });
  const failed = reporter.report({ mission: M1.id, proof: { verdict: "FAIL" } });
  const invalid = reporter.report({ mission: M1.id, proof: "###not-json###" });
  const anySuccess = [absent, failed, invalid].some((r) => r.status === "SUCCESS");
  check(!anySuccess, "B3 absent/failed/invalid proof blocks SUCCESS");
}

// B4 — exactly one GUARDED SUCCESS writer (not an unconditional literal).
{
  const reporterSrc = fs.readFileSync(`${SRC}/runtime-reporter.ts`, "utf8");
  const executorSrc = fs.readFileSync(`${SRC}/runtime-executor.ts`, "utf8");
  const unconditionalInReporter = /status:\s*"SUCCESS"/.test(reporterSrc) && !/\?\s*"SUCCESS"/.test(reporterSrc);
  const writers = (reporterSrc.match(/status:\s*"SUCCESS"/g)?.length ?? 0)
    + (executorSrc.match(/status:\s*"SUCCESS"/g)?.length ?? 0);
  check(!unconditionalInReporter && writers === 1, "B4 exactly one guarded SUCCESS writer");
}

console.log(failures === 0 ? "\nALL PASS — PHASE 0 CERTIFIED (8/8)" : `\n${failures} FAILURE(S) — PHASE 0 NOT CERTIFIED`);
process.exit(failures === 0 ? 0 : 1);
