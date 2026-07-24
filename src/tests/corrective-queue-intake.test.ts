/*
 * Validation harness — corrective-mission queue intake (SELF_ENGINEERING_RUNTIME_KERNEL)
 *
 * Proof for the mission: the autonomy loop now automatically qualifies and executes an AUTHORIZED
 * corrective mission taken from runtime/missions/pending/, AHEAD of roadmap progress, while an
 * unauthorized / unauthored nomination is DEFERRED (never silently run — HUMAN_VALIDATION preserved).
 *
 * It composes the production objects exactly as the runtime does:
 *   RuntimeAutonomy (core; Release Manager in-core, not injectable)
 *     → AutonomyRuntimeAdapter (real readCorrectiveQueue / readPlanState / gatherEvidence / release)
 *
 * Only the process boundaries the adapter already shells out to (odg-run.js, odg-verify.js,
 * mission-ledger.js) are stubbed inside a throwaway git workspace, so the test makes no network / AI
 * call. Nothing in src/core, src/contracts or src/runtime is modified.
 *
 * Checks:
 *   1. CLASSIFY — readCorrectiveQueue authorizes ONLY a record that is status=AUTHORIZED AND has a
 *      real contract with objectives; the three failing shapes are each deferred with a reason.
 *   2. WORK-LIST — readPlanState prepends the authorized corrective mission AHEAD of the roadmap.
 *   3. EXECUTE — a full run selects + releases the corrective mission FIRST, then resumes the
 *      roadmap, ending PLAN_COMPLETE; the unauthorized nomination is never executed.
 *
 * Run: `npx tsx src/tests/corrective-queue-intake.test.ts`.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { RuntimeAutonomy } from "@/core/runtime-autonomy";
import { AUTONOMY_CONTRACT_VERSION } from "@/contracts/runtime-autonomy";
import { AutonomyRuntimeAdapter } from "@/runtime/autonomy-runtime-adapter";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.error(`  FAIL  ${label}`);
  }
}

const AUTHORIZED = "FIX_AUTHORIZED_CORRECTIVE";
const ROADMAP = "ROADMAP_MISSION_1";
const UNAUTHORIZED = "FIX_PENDING_REPAIR"; // status not AUTHORIZED
const NO_CONTRACT = "FIX_NO_CONTRACT"; // authorized but no contract on disk
const EMPTY_OBJECTIVES = "FIX_EMPTY_OBJECTIVES"; // authorized + contract but no objectives

function contract(mission: string, objectives: unknown[]) {
  return JSON.stringify({ mission, priority: "NORMAL", mode: "AUDIT", objectives });
}
const OBJ = [{ id: `${"O"}1`, goal: "Prove intake.", done_when: ["Released."] }];

function makeWorkspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "odg-corrective-queue-"));
  const bin = path.join(root, "runtime", "bin");
  const core = path.join(root, "runtime", "core");
  const generated = path.join(root, "runtime", "generated");
  const missions = path.join(root, "runtime", "missions");
  const pending = path.join(missions, "pending");
  const governance = path.join(root, "runtime", "governance");
  for (const d of [bin, core, generated, missions, pending, governance]) {
    fs.mkdirSync(d, { recursive: true });
  }

  // Stub local pipeline: writes the SAME mission-scoped, validated report odg-run.js leaves behind,
  // so the Documentation Engine yields a proof and there is a releasable artifact. No business logic.
  fs.writeFileSync(
    path.join(bin, "odg-run.js"),
    [
      "const fs=require('fs');const m=process.argv[2];",
      "fs.writeFileSync('runtime/generated/mission-report.json',JSON.stringify({mission:m,status:'SUCCESS',validated:true}));",
      "process.exit(0);",
    ].join("\n"),
  );
  // Stub verifier: the adapter's local path invokes THIS before gathering evidence; gates green.
  fs.writeFileSync(
    path.join(bin, "odg-verify.js"),
    [
      "const fs=require('fs');",
      "fs.writeFileSync('runtime/generated/runtime-verify.json',JSON.stringify({build:true,typescript:true,gitClean:true}));",
      "process.exit(0);",
    ].join("\n"),
  );
  // Mission Ledger stand-in: archive() shells out here; in-session completion is tracked by the
  // adapter, so a no-op keeps the workspace self-contained.
  fs.writeFileSync(path.join(core, "mission-ledger.js"), "process.exit(0);\n");

  // Contracts.
  fs.writeFileSync(path.join(missions, `${AUTHORIZED}.json`), contract(AUTHORIZED, OBJ));
  fs.writeFileSync(path.join(missions, `${ROADMAP}.json`), contract(ROADMAP, OBJ));
  fs.writeFileSync(path.join(missions, `${UNAUTHORIZED}.json`), contract(UNAUTHORIZED, OBJ));
  fs.writeFileSync(path.join(missions, `${EMPTY_OBJECTIVES}.json`), contract(EMPTY_OBJECTIVES, []));
  // NO_CONTRACT intentionally has no runtime/missions/*.json.

  // Pending queue nominations.
  const rec = (mission: string, status: string) => JSON.stringify({ mission, status });
  fs.writeFileSync(path.join(pending, `${AUTHORIZED}.json`), rec(AUTHORIZED, "AUTHORIZED"));
  fs.writeFileSync(path.join(pending, `${UNAUTHORIZED}.json`), rec(UNAUTHORIZED, "PENDING_REPAIR"));
  fs.writeFileSync(path.join(pending, `${NO_CONTRACT}.json`), rec(NO_CONTRACT, "AUTHORIZED"));
  fs.writeFileSync(path.join(pending, `${EMPTY_OBJECTIVES}.json`), rec(EMPTY_OBJECTIVES, "AUTHORIZED"));

  // Roadmap manifest: the single roadmap mission the loop advances to after the corrective mission.
  fs.writeFileSync(
    path.join(governance, "ROADMAP.json"),
    JSON.stringify({ missions: [{ id: ROADMAP, contract: `runtime/missions/${ROADMAP}.json` }] }),
  );

  // A real git repo: AutonomyRuntimeAdapter.readSource() runs `git` directly in the workspace.
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
  git("init");
  git("config", "user.email", "odg@local");
  git("config", "user.name", "ODG");
  git("add", "-A");
  git("-c", "commit.gpgsign=false", "commit", "-m", "fixture");
  return root;
}

const ws = makeWorkspace();
const cfg = { autonomyContractVersion: AUTONOMY_CONTRACT_VERSION };

// --- 1) CLASSIFY ---------------------------------------------------------------------------------
{
  const q = new AutonomyRuntimeAdapter(ws).readCorrectiveQueue();
  check(
    q.authorized.length === 1 && q.authorized[0] === AUTHORIZED,
    "CLASSIFY: only the status=AUTHORIZED record with a real contract + objectives is authorized",
  );
  const deferred = new Set(q.deferred.map((d) => d.mission));
  check(deferred.has(UNAUTHORIZED), "CLASSIFY: a PENDING_REPAIR nomination is deferred (not authorized)");
  check(deferred.has(NO_CONTRACT), "CLASSIFY: an authorized nomination with no contract is deferred");
  check(deferred.has(EMPTY_OBJECTIVES), "CLASSIFY: an authorized contract with no objectives is deferred");
}

// --- 2) WORK-LIST --------------------------------------------------------------------------------
{
  const plan = new AutonomyRuntimeAdapter(ws).readPlanState();
  check(
    plan.masterPlanObjectives[0] === AUTHORIZED,
    "WORK-LIST: the authorized corrective mission is prepended AHEAD of roadmap missions",
  );
  check(
    plan.masterPlanObjectives.includes(ROADMAP),
    "WORK-LIST: the roadmap mission is still present after the corrective mission",
  );
  check(
    !plan.masterPlanObjectives.includes(UNAUTHORIZED),
    "WORK-LIST: a deferred nomination is NOT injected into the work-list",
  );
}

// --- 3) EXECUTE ----------------------------------------------------------------------------------
{
  const ports = new AutonomyRuntimeAdapter(ws);
  const result = new RuntimeAutonomy().run(cfg, ports);
  check(result.status === "PLAN_COMPLETE", "EXECUTE: the loop runs to PLAN_COMPLETE");
  check(
    result.completed[0]?.mission === AUTHORIZED,
    "EXECUTE: the authorized corrective mission is executed + released FIRST",
  );
  check(
    result.completed.some((c) => c.mission === ROADMAP),
    "EXECUTE: the roadmap resumes automatically after the corrective mission",
  );
  check(
    result.completed.every((c) => c.mission !== UNAUTHORIZED),
    "EXECUTE: the unauthorized nomination is never executed",
  );
  check(
    result.completed.every((c) => c.record.decision === "RELEASE"),
    "EXECUTE: every completed mission ended with a Release Manager RELEASE decision",
  );
}

fs.rmSync(ws, { recursive: true, force: true });

if (failures > 0) {
  console.error(`\nCorrective-queue intake: ${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nCorrective-queue intake OK");
