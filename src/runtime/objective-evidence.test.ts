/*
 * ROOT CAUSE #1 regression — PROVEN must require GENUINE objective evidence.
 *
 * Locks the fix for the src/runtime LOCAL (migrated) route recording missions PROVEN on
 * SELF-FULFILLING evidence. The pre-fix executor computed:
 *     objectivesTotal    = technical.steps.length
 *     objectivesExecuted = registry.all().length   // registry was just filled with those steps
 *     verdict            = objectivesExecuted === objectivesTotal ? "PASS" : "FAIL"
 * a tautology that is ALWAYS "PASS" (verification hardcoded {0,0}), so an engineering mission
 * whose objective was never genuinely achieved was still recorded SUCCESS.
 *
 * This suite proves the defect on the OLD formula (reproduced inline) and the fix on the NEW
 * assessObjectiveEvidence(), and proves legitimate read-only AUDIT missions still pass (both at
 * the pure-helper level and end-to-end through the real LocalMissionRunner).
 *
 * Run directly: node_modules/.bin/tsx src/runtime/objective-evidence.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { assessObjectiveEvidence } from "./objective-evidence";
import { ObjectiveSpec, VerifyRequirement } from "./mission-loader";
import { ExecutionStep } from "./mission-orchestrator";
import { LocalMissionRunner } from "./local-mission-runner";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

function spec(id: string): ObjectiveSpec {
  return { id, goal: `goal ${id}`, doneWhen: [`${id} done`], dependsOn: [], proof: null };
}
function step(id: string): ExecutionStep {
  return { id, name: `step ${id}`, status: "PENDING", actions: [], dependencies: [], postconditions: [], verificationRequirements: [] };
}
function verify(evidence: string): VerifyRequirement {
  return { capability: "CAP", evidence };
}

// The OLD self-fulfilling formula, reproduced verbatim: the registry always mirrors the planned
// steps, so executed === total and the verdict is structurally "PASS" for ANY mission.
function oldSelfFulfillingVerdict(plannedSteps: number): "PASS" | "FAIL" {
  const objectivesTotal = plannedSteps;
  const objectivesExecuted = plannedSteps; // registry.all().length after registering every step
  return objectivesExecuted === objectivesTotal ? "PASS" : "FAIL";
}

console.log("ROOT CAUSE #1 — PROVEN REQUIRES GENUINE OBJECTIVE EVIDENCE");

// 0 — the defect exists on the OLD formula: engineering objective NOT achieved ⇒ old verdict PASS.
{
  const planned = 3;
  check(oldSelfFulfillingVerdict(planned) === "PASS",
    "OLD formula records an unachieved engineering mission PROVEN (reproduces false-success)");
}

// 1 — FIX: engineering mission (authorized paths), declared evidence ABSENT ⇒ FAIL.
{
  const e = assessObjectiveEvidence({
    objectiveSpecs: [spec("OBJ1")],
    planObjectiveSteps: [step("OBJECTIVE_1")],
    authorizedPaths: ["runtime/x/**"],
    verify: [verify("runtime/generated/never.json")],
    evidenceExists: () => false,
  });
  check(e.isEngineering === true, "engineering class detected from authorized paths");
  check(e.proof.verdict === "FAIL" && e.reason === "engineering-evidence-missing",
    "engineering + absent evidence ⇒ FAIL (false-success closed)");
}

// 2 — engineering with NO declared verify at all ⇒ still FAIL (must show ≥1 genuine effect).
{
  const e = assessObjectiveEvidence({
    objectiveSpecs: [spec("OBJ1")],
    planObjectiveSteps: [step("OBJECTIVE_1")],
    authorizedPaths: ["runtime/x/**"],
    verify: [],
    evidenceExists: () => false,
  });
  check(e.verification.required >= 1 && e.proof.verdict === "FAIL",
    "engineering + no evidence/applied effect ⇒ FAIL");
}

// 3 — NOT over-blocked: engineering with declared evidence PRESENT on disk ⇒ PASS.
{
  const present = new Set(["runtime/generated/real.json"]);
  const e = assessObjectiveEvidence({
    objectiveSpecs: [spec("OBJ1")],
    planObjectiveSteps: [step("OBJECTIVE_1")],
    authorizedPaths: ["runtime/x/**"],
    verify: [verify("runtime/generated/real.json")],
    evidenceExists: (p) => present.has(p),
  });
  check(e.proof.verdict === "PASS", "engineering + present evidence ⇒ PASS (genuine evidence honored)");
}

// 4 — NOT over-blocked: engineering with a real applied effect this run ⇒ PASS.
{
  const e = assessObjectiveEvidence({
    objectiveSpecs: [spec("OBJ1")],
    planObjectiveSteps: [step("OBJECTIVE_1")],
    authorizedPaths: ["runtime/x/**"],
    verify: [],
    appliedEvidenceCount: 1,
    evidenceExists: () => false,
  });
  check(e.proof.verdict === "PASS", "engineering + real applied effect ⇒ PASS");
}

// 5 — legitimate read-only AUDIT mission (no authorized paths, no verify) ⇒ PASS (existing contract).
{
  const e = assessObjectiveEvidence({
    objectiveSpecs: [spec("OBJ1"), spec("OBJ2")],
    planObjectiveSteps: [step("OBJECTIVE_1"), step("OBJECTIVE_2")],
    authorizedPaths: [],
    verify: [],
    evidenceExists: () => false,
  });
  check(e.isEngineering === false && e.proof.verdict === "PASS",
    "read-only AUDIT (coverage complete) ⇒ PASS (A3 case 4 preserved)");
}

// 6 — read-only but declares evidence that is MISSING ⇒ FAIL (declared proof must exist).
{
  const e = assessObjectiveEvidence({
    objectiveSpecs: [spec("OBJ1")],
    planObjectiveSteps: [step("OBJECTIVE_1")],
    authorizedPaths: [],
    verify: [verify("runtime/generated/missing.json")],
    evidenceExists: () => false,
  });
  check(e.proof.verdict === "FAIL" && e.reason === "verification-failed",
    "read-only + declared-but-missing evidence ⇒ FAIL");
}

// 7 — no genuine objectives declared ⇒ FAIL (cannot prove nothing).
{
  const e = assessObjectiveEvidence({
    objectiveSpecs: [], planObjectiveSteps: [], authorizedPaths: [], verify: [],
  });
  check(e.proof.verdict === "FAIL" && e.reason === "objective-coverage-absent",
    "no declared objectives ⇒ FAIL (coverage absent)");
}

// 8 — coverage incomplete (orchestrator built fewer steps than declared objectives) ⇒ FAIL.
{
  const e = assessObjectiveEvidence({
    objectiveSpecs: [spec("OBJ1"), spec("OBJ2")],
    planObjectiveSteps: [step("OBJECTIVE_1")],
    authorizedPaths: [],
    verify: [],
  });
  check(e.proof.verdict === "FAIL" && e.reason === "objective-coverage-incomplete",
    "declared>built objectives ⇒ FAIL (coverage incomplete)");
}

// 9 — END-TO-END through the real LocalMissionRunner: an engineering mission whose objective is
//     genuinely NOT achieved is recorded FAILED (OLD code recorded it SUCCESS). The mission file
//     and any evidence artifact live under git-ignored paths and are removed afterwards.
{
  const id = "__ROOTCAUSE1_REG__";
  const missionFile = path.join("runtime", "missions", `${id}.json`);
  const evidence = path.join("runtime", "generated", "__rootcause1_reg_evidence__.json");
  const hadGenerated = fs.existsSync(path.join("runtime", "generated"));
  try {
    fs.mkdirSync(path.join("runtime", "generated"), { recursive: true });
    fs.rmSync(evidence, { force: true });
    fs.writeFileSync(missionFile, JSON.stringify({
      mission: id, mode: "IMPLEMENT", requires_engineering: true,
      authorized_paths: ["runtime/nowhere/**"],
      objectives: [{ id: "OBJ1", goal: "write a module that never got written", done_when: [`${evidence} exists`] }],
      verify: [{ capability: "WRITE_MODULE", evidence }],
    }));

    // Spy recorder so the test writes nothing to the real ledger/report.
    const spy = () => ({ skipped: true });

    const unachieved = new LocalMissionRunner(undefined, undefined, spy).run(id);
    const status1 = (unachieved.execution as { report?: { status?: string } })?.report?.status;
    check(status1 === "FAILED" && unachieved.validated === false,
      "END-TO-END engineering objective NOT achieved ⇒ FAILED (false-success closed)");

    // Now genuinely produce the declared evidence → the SAME mission is honestly PROVEN.
    fs.writeFileSync(evidence, JSON.stringify({ proof: true }));
    const achieved = new LocalMissionRunner(undefined, undefined, spy).run(id);
    const status2 = (achieved.execution as { report?: { status?: string } })?.report?.status;
    check(status2 === "SUCCESS" && achieved.validated === true,
      "END-TO-END same mission WITH genuine evidence ⇒ SUCCESS (not over-blocked)");
  } finally {
    fs.rmSync(missionFile, { force: true });
    fs.rmSync(evidence, { force: true });
    if (!hadGenerated) fs.rmSync(path.join("runtime", "generated"), { recursive: true, force: true });
  }
}

console.log(failures === 0 ? "ALL PASS — ROOT CAUSE #1 GENUINE-EVIDENCE GATE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
