/*
 * Non-regression harness — Provider path honours the MSE canonical release contract
 *
 * Guards the divergence fixed in FIX_PROVIDER_RELEASE_CONTRACT: the Provider / `odg autonomy` path
 * used to accept ANY mission-scoped runtime/generated/mission-report.json (even a non-canonical
 * `{status:"OK"}` with no `validated` field, or a BLOCKED / unproven report) as sufficient evidence,
 * so a mission could reach RELEASE without the Validation Engine's proof — a false MISSION SUCCESS.
 *
 * The MSE pipeline (runtime/mission-standard/bin/mse, step [4/5]) writes a SUCCESS artifact ONLY when
 * the report is mission-scoped AND `validated === true` AND `status === "SUCCESS"`. The adapter must
 * now enforce EXACTLY that same canonical verdict on the Provider path.
 *
 * It composes the REAL production objects (Release Manager is in-core and NOT injectable); only the
 * process boundary that would spawn `claude` is stubbed inside a throwaway git workspace:
 *
 *   RuntimeAutonomy (core) → AutonomyRuntimeAdapter (real glue) → ClaudeProviderAdapter (real)
 *
 * Checks, one per report shape the adapter reads:
 *   1. CANONICAL  — {status:"SUCCESS", validated:true} ⇒ RELEASE (a genuine success still releases).
 *   2. LOOSE      — {status:"OK"} (no `validated`)      ⇒ NO release, halt EVIDENCE_INCOMPLETE
 *                   (regression guard: the exact shape the old provider smoke fixture exploited).
 *   3. BLOCKED    — {status:"BLOCKED", validated:false} ⇒ NO release, halt EVIDENCE_INCOMPLETE.
 *   4. WRONG MISS — canonical but for a DIFFERENT mission ⇒ NO release, halt EVIDENCE_INCOMPLETE.
 *
 * Run: `npx tsx src/tests/provider-canonical-contract.test.ts`.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { RuntimeAutonomy } from "@/core/runtime-autonomy";
import { AUTONOMY_CONTRACT_VERSION } from "@/contracts/runtime-autonomy";
import { AutonomyRuntimeAdapter } from "@/runtime/autonomy-runtime-adapter";
import {
  ClaudeProviderAdapter,
  type ProviderProcessRunner,
} from "@/providers/claude-provider-adapter";

const MISSION = "PROVIDER_CANONICAL_CONTRACT_V1";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.error(`  FAIL  ${label}`);
  }
}

/** A workspace whose mission-report.json is exactly the report shape under test. */
function makeWorkspace(report: unknown): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "odg-canonical-contract-"));
  const generated = path.join(root, "runtime", "generated");
  fs.mkdirSync(path.join(root, "runtime", "missions"), { recursive: true });
  fs.mkdirSync(path.join(root, "runtime", "core"), { recursive: true });
  fs.mkdirSync(generated, { recursive: true });

  // Archive shells out here; a no-op keeps the workspace self-contained.
  fs.writeFileSync(path.join(root, "runtime", "core", "mission-ledger.js"), "process.exit(0);\n");

  // An ENGINEERING mission → the Runtime routes it to the provider (missionRequiresProvider === true).
  fs.writeFileSync(
    path.join(root, "runtime", "missions", `${MISSION}.json`),
    JSON.stringify({
      mission: MISSION,
      mode: "ENGINEERING",
      requiresEngineering: true,
      authorizedPaths: ["src/tests/**"],
      objectives: [{ id: "OBJ-1", goal: "exercise the canonical contract", done_when: [] }],
    }),
  );

  // Plan state so the selector picks exactly this mission.
  fs.writeFileSync(path.join(generated, "mission-plan.json"), JSON.stringify({ objectives: [MISSION] }));
  fs.writeFileSync(
    path.join(generated, "capability-registry.json"),
    JSON.stringify({ missingCapabilities: [MISSION] }),
  );

  // Every release gate EXCEPT the report is green, so the report shape is the ONLY variable.
  fs.writeFileSync(
    path.join(generated, "runtime-verify.json"),
    JSON.stringify({ build: true, typescript: true, gitClean: true }),
  );
  fs.writeFileSync(path.join(generated, "mission-report.json"), JSON.stringify(report));

  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
  git("init");
  git("config", "user.email", "odg@local");
  git("config", "user.name", "ODG");
  git("add", "-A");
  git("-c", "commit.gpgsign=false", "commit", "-m", "fixture");
  return root;
}

/** A provider stub that reports a clean DONE run without touching the tree (no live `claude` call). */
function makeRunner(): ProviderProcessRunner {
  return (bin: string) => {
    if (bin === "git") return { status: 0, stdout: "", stderr: "" };
    return {
      status: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        session_id: "sess-canonical",
        result: JSON.stringify({
          mission: MISSION,
          providerContractVersion: "1.0.0",
          status: "DONE",
          objectivesAddressed: ["OBJ-1"],
          changedFiles: [],
          commandsRun: [],
          blocker: null,
        }),
      }),
      stderr: "",
    };
  };
}

const cfg = { autonomyContractVersion: AUTONOMY_CONTRACT_VERSION };

function runWith(report: unknown) {
  const ws = makeWorkspace(report);
  const cacheDir = path.join(ws, "runtime", "generated", "provider-cache");
  try {
    const provider = new ClaudeProviderAdapter({ cwd: ws, run: makeRunner(), cacheDir });
    const ports = new AutonomyRuntimeAdapter(ws, provider);
    return new RuntimeAutonomy().run(cfg, ports);
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
}

// --- 1) CANONICAL: a genuine proven report still releases ----------------------------------------

{
  const r = runWith({ mission: MISSION, status: "SUCCESS", validated: true });
  check(
    r.status === "PLAN_COMPLETE" && r.completed[0]?.record.decision === "RELEASE",
    "CANONICAL: {status:SUCCESS, validated:true} ⇒ Release Manager RELEASE",
  );
}

// --- 2) LOOSE: the old accepted shape is now rejected --------------------------------------------

{
  const r = runWith({ mission: MISSION, status: "OK", objectives: [MISSION] });
  check(
    r.completed.length === 0 && r.halt?.reason === "EVIDENCE_INCOMPLETE",
    "LOOSE: {status:OK} (no validated) ⇒ NO release, EVIDENCE_INCOMPLETE (regression guard)",
  );
}

// --- 3) BLOCKED: an unproven Validation-Engine verdict cannot release -----------------------------

{
  const r = runWith({ mission: MISSION, status: "BLOCKED", validated: false });
  check(
    r.completed.length === 0 && r.halt?.reason === "EVIDENCE_INCOMPLETE",
    "BLOCKED: {status:BLOCKED, validated:false} ⇒ NO release, EVIDENCE_INCOMPLETE",
  );
}

// --- 4) WRONG MISSION: a proven report for a DIFFERENT mission is not this mission's proof ---------

{
  const r = runWith({ mission: "SOME_OTHER_MISSION", status: "SUCCESS", validated: true });
  check(
    r.completed.length === 0 && r.halt?.reason === "EVIDENCE_INCOMPLETE",
    "WRONG MISSION: a canonical report scoped to another mission ⇒ NO release, EVIDENCE_INCOMPLETE",
  );
}

if (failures > 0) {
  console.error(`\nProvider Canonical Contract: ${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nProvider Canonical Contract OK");
