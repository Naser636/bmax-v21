/*
 * Validation harness — Runtime Autonomy, LOCAL path (no AI provider)
 *
 * This is the proof required by MISSION 1 ("Runtime Autonomous Closure"): the autonomy loop
 * genuinely SELECTS a mission and drives it to RELEASE through the EXISTING local pipeline path,
 * with NO engineering provider involved. It composes the production objects exactly:
 *
 *   RuntimeAutonomy (core; Release Manager is in-core and NOT injectable)
 *     → AutonomyRuntimeAdapter (the real integration glue, real readPlanState / gatherEvidence /
 *       Documentation Engine / evidence assembly)
 *
 * Only the process boundary the adapter already shells out to is stubbed inside a throwaway git
 * workspace — the pipeline runner (odg-run.js), the verifier (odg-verify.js) and the Mission Ledger
 * — so the test is self-contained and makes no network / AI call. Nothing in src/core, src/contracts
 * or src/runtime is modified.
 *
 * Checks:
 *   1. LOCAL ROUTING — a mission with no authorizedPaths / requiresEngineering is NOT routed to a
 *      provider (missionRequiresProvider(spec) === false).
 *   2. SELECT + RELEASE — a full autonomy run selects the one pending Master-Plan objective, runs
 *      the local pipeline, gathers CURRENT evidence and the Release Manager returns RELEASE, ending
 *      the loop at PLAN_COMPLETE in exactly one cycle.
 *   3. EVIDENCE FRESHNESS — the local path refreshed runtime-verify.json via the verifier before the
 *      decision (regression guard for the stale-evidence blocker fixed in this mission).
 *   4. ADVANCE — a second run finds the plan exhausted (the released mission is excluded) and
 *      returns PLAN_COMPLETE with zero further cycles.
 *
 * Run: `npx tsx src/tests/autonomy-local-loop.test.ts`.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { RuntimeAutonomy } from "@/core/runtime-autonomy";
import { AUTONOMY_CONTRACT_VERSION } from "@/contracts/runtime-autonomy";
import { AutonomyRuntimeAdapter } from "@/runtime/autonomy-runtime-adapter";
import { missionRequiresProvider } from "@/providers";

const MISSION = "LOCAL_AUTONOMY_PROOF_V1";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.error(`  FAIL  ${label}`);
  }
}

// --- 1) LOCAL ROUTING: a plain mission is NOT sent to a provider ---------------------------------

// A complete Mission Contract: since generateContract() loads the REAL mission file and requires
// real objectives (no self-synthesized default), the fixture declares its own — exactly as every
// real roadmap mission does. It stays a PLAIN local mission (no authorizedPaths / requiresEngineering)
// so routing still bypasses the provider.
const spec = {
  mission: MISSION,
  priority: "NORMAL",
  mode: "SEQUENTIAL",
  objectives: [
    {
      id: "LOCAL_AUTONOMY_PROOF",
      goal: "Prove the local autonomy loop drives a plain mission to RELEASE.",
      done_when: ["Pipeline executed without error.", "Release Manager returns RELEASE."],
    },
  ],
};
check(
  missionRequiresProvider({ mode: spec.mode }) === false,
  "LOCAL ROUTING: a mission with no write scope / engineering flag stays on the local pipeline",
);

// --- fixture workspace: a real git repo mirroring the evidence surface the Runtime reads ----------

function makeWorkspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "odg-local-autonomy-"));
  const bin = path.join(root, "runtime", "bin");
  const core = path.join(root, "runtime", "core");
  const generated = path.join(root, "runtime", "generated");
  const missions = path.join(root, "runtime", "missions");
  for (const d of [bin, core, generated, missions]) fs.mkdirSync(d, { recursive: true });

  // Stub local pipeline: writes the SAME mission-scoped report odg-run.js leaves behind, so the
  // Documentation Engine yields a proof and there is a releasable artifact. No business logic.
  fs.writeFileSync(
    path.join(bin, "odg-run.js"),
    [
      "const fs=require('fs');const m=process.argv[2];",
      "fs.writeFileSync('runtime/generated/mission-report.json',JSON.stringify({mission:m,status:'SUCCESS',validated:true}));",
      "process.exit(0);",
    ].join("\n"),
  );

  // Stub verifier: the adapter's local path invokes THIS before gathering evidence. It writes the
  // build/typescript/gitClean gates green — proving the refresh actually ran (check 3).
  fs.writeFileSync(
    path.join(bin, "odg-verify.js"),
    [
      "const fs=require('fs');",
      "fs.writeFileSync('runtime/generated/runtime-verify.json',JSON.stringify({build:true,typescript:true,gitClean:true}));",
      "process.exit(0);",
    ].join("\n"),
  );

  // Mission Ledger stand-in: archive() shells out here; completion is tracked in-session by the
  // adapter, so a no-op keeps the workspace self-contained without persisting anything.
  fs.writeFileSync(path.join(core, "mission-ledger.js"), "process.exit(0);\n");

  // The mission spec — a plain local mission (no authorizedPaths, no requiresEngineering).
  fs.writeFileSync(path.join(missions, `${MISSION}.json`), JSON.stringify(spec));

  // Plan state so the selector picks exactly this one mission, then exhausts the plan.
  fs.writeFileSync(path.join(generated, "mission-plan.json"), JSON.stringify({ objectives: [MISSION] }));
  fs.writeFileSync(
    path.join(generated, "capability-registry.json"),
    JSON.stringify({ missingCapabilities: [MISSION] }),
  );

  // Deliberately STALE / red verify evidence: if the local path failed to refresh it, gitClean would
  // stay false and the Release Manager would NO_RELEASE — so a RELEASE proves the refresh happened.
  fs.writeFileSync(
    path.join(generated, "runtime-verify.json"),
    JSON.stringify({ build: false, typescript: false, gitClean: false }),
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

// --- 2 & 3) SELECT + RELEASE on the local path, with refreshed evidence --------------------------

{
  const ports = new AutonomyRuntimeAdapter(ws);
  const result = new RuntimeAutonomy().run(cfg, ports);

  check(result.status === "PLAN_COMPLETE", "SELECT + RELEASE: the local autonomy loop runs to PLAN_COMPLETE");
  check(result.cycles === 1, "SELECT + RELEASE: exactly one mission was selected and processed");
  check(
    result.completed.length === 1 && result.completed[0].mission === MISSION,
    "SELECT + RELEASE: the selected local mission is the one released",
  );
  check(
    result.completed[0]?.record.decision === "RELEASE",
    "SELECT + RELEASE: the Release Manager terminates the mission with RELEASE",
  );
  check(result.halt === null, "SELECT + RELEASE: no halt — governance did not block a legitimate mission");

  const verify = JSON.parse(
    fs.readFileSync(path.join(ws, "runtime", "generated", "runtime-verify.json"), "utf8"),
  ) as { gitClean?: boolean };
  check(
    verify.gitClean === true,
    "EVIDENCE FRESHNESS: the local path refreshed runtime-verify.json before the release decision",
  );
}

// --- 4) ADVANCE: a second run finds the plan exhausted -------------------------------------------

{
  // A fresh adapter re-reads plan state; capability-registry still lists the mission as missing, but
  // the (stubbed) ledger recorded nothing, so we simulate the ledger having advanced by marking the
  // mission complete exactly as a real ledger write would — a PROVEN entry (proven: true), which is
  // the only shape mission-ledger.js writes for a validation-proven execution. selectNextMission must
  // exclude it; a bare unproven record must NOT close the mission (see readPlanState).
  fs.writeFileSync(
    path.join(ws, "runtime", "generated", "mission-ledger.json"),
    JSON.stringify({ entries: [{ mission: MISSION, proven: true }] }),
  );
  const ports = new AutonomyRuntimeAdapter(ws);
  const result = new RuntimeAutonomy().run(cfg, ports);
  check(
    result.status === "PLAN_COMPLETE" && result.cycles === 0,
    "ADVANCE: with the released mission in the ledger, the plan is exhausted (0 further cycles)",
  );
}

fs.rmSync(ws, { recursive: true, force: true });

if (failures > 0) {
  console.error(`\nRuntime Autonomy (local path): ${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nRuntime Autonomy (local path) OK");
