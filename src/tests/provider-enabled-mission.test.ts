/*
 * Validation harness — PROVIDER_ENABLED_SMOKE_V1 (first official provider-enabled ODG mission)
 *
 * Proves the mission acceptance checks against the REAL, unmodified Runtime, WITHOUT a live (paid)
 * Claude call. It composes exactly the production objects:
 *
 *   RuntimeAutonomy (core, Release Manager is in-core and NOT injectable)
 *     → AutonomyRuntimeAdapter (the real integration glue)
 *       → ClaudeProviderAdapter (the real provider adapter)
 *
 * Only the single legitimate impure boundary — the process runner that would spawn `claude` — is
 * stubbed, at the injection point the adapter already exposes. Nothing in src/core, src/contracts,
 * src/providers or src/runtime is modified.
 *
 * Checks:
 *   1. ROUTING   — the Runtime itself decides to call the provider for THIS official mission file
 *                  (missionRequiresProvider(spec) === true), driven off the real JSON on disk.
 *   2. ONE CALL  — a full autonomy run invokes the provider process exactly once and the Release
 *                  Manager terminates the mission with RELEASE (status PLAN_COMPLETE).
 *   3. CACHE     — an identical re-execution in a fresh session is served by the provider's on-disk
 *                  cache: zero new live calls, and the Release Manager still returns RELEASE.
 *
 * Run: `npx tsx src/tests/provider-enabled-mission.test.ts`.
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
import { missionRequiresProvider } from "@/providers";

const MISSION = "PROVIDER_ENABLED_SMOKE_V1";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const MISSION_FILE = path.join(REPO_ROOT, "runtime", "missions", `${MISSION}.json`);

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.error(`  FAIL  ${label}`);
  }
}

// --- 1) ROUTING: the Runtime decides to call the provider for the real mission file --------------

const spec = JSON.parse(fs.readFileSync(MISSION_FILE, "utf8")) as {
  mode?: string;
  authorizedPaths?: string[];
  requiresEngineering?: boolean;
};
check(
  missionRequiresProvider({
    mode: spec.mode,
    authorizedPaths: spec.authorizedPaths,
    requiresEngineering: spec.requiresEngineering,
  }) === true,
  "ROUTING: the official mission declares work ⇒ the Runtime routes it to the provider",
);

// --- fixture workspace: a real git repo mirroring the evidence surface the Runtime reads ----------

function makeWorkspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "odg-provider-mission-"));
  const generated = path.join(root, "runtime", "generated");
  fs.mkdirSync(path.join(root, "runtime", "missions"), { recursive: true });
  fs.mkdirSync(path.join(root, "runtime", "core"), { recursive: true });
  fs.mkdirSync(generated, { recursive: true });

  // Archive spawns `node runtime/core/mission-ledger.js`; its exit status is ignored by design.
  // A no-op stand-in keeps the workspace self-contained (no error dump) WITHOUT persisting
  // completion — so session B re-selects the mission and genuinely exercises the provider cache.
  fs.writeFileSync(path.join(root, "runtime", "core", "mission-ledger.js"), "process.exit(0);\n");

  // The REAL official mission file — copied verbatim, never synthesised.
  fs.copyFileSync(MISSION_FILE, path.join(root, "runtime", "missions", `${MISSION}.json`));

  // Plan state so the autonomy selector picks exactly this one mission, then exhausts the plan.
  fs.writeFileSync(path.join(generated, "mission-plan.json"), JSON.stringify({ objectives: [MISSION] }));
  fs.writeFileSync(path.join(generated, "capability-registry.json"), JSON.stringify({ missingCapabilities: [MISSION] }));

  // Validation evidence the Release Manager gates on (build / typescript / gitClean all green).
  fs.writeFileSync(
    path.join(generated, "runtime-verify.json"),
    JSON.stringify({ build: true, typescript: true, gitClean: true }),
  );

  // A mission-scoped report carrying the Validation Engine's canonical verdict
  // (validated === true, status === "SUCCESS") so the Documentation Engine yields a proof and there
  // is at least one releasable artifact — exactly what odg-run.js / validation-engine.js leaves
  // behind on the real path, and exactly the contract the adapter now enforces on BOTH paths.
  fs.writeFileSync(
    path.join(generated, "mission-report.json"),
    JSON.stringify({ mission: MISSION, status: "SUCCESS", validated: true, objectives: [MISSION] }),
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

// --- stubbed process boundary: counts live `claude` calls; serves git status as clean -------------

function makeRunner(counter: { claudeCalls: number }): ProviderProcessRunner {
  return (bin: string) => {
    if (bin === "git") return { status: 0, stdout: "", stderr: "" };
    counter.claudeCalls++;
    return {
      status: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        session_id: "sess-smoke",
        result: JSON.stringify({
          mission: MISSION,
          providerContractVersion: "1.0.0",
          status: "DONE",
          objectivesAddressed: ["PROVIDER_SMOKE_MARKER"],
          changedFiles: [],
          commandsRun: [],
          blocker: null,
        }),
      }),
      stderr: "",
    };
  };
}

const ws = makeWorkspace();
const cacheDir = path.join(ws, "runtime", "generated", "provider-cache");
const cfg = { autonomyContractVersion: AUTONOMY_CONTRACT_VERSION };

// --- 2) ONE CALL: full autonomy run → provider once → Release Manager RELEASE --------------------

const counter = { claudeCalls: 0 };

{
  const provider = new ClaudeProviderAdapter({ cwd: ws, run: makeRunner(counter), cacheDir });
  const ports = new AutonomyRuntimeAdapter(ws, provider);
  const result = new RuntimeAutonomy().run(cfg, ports);

  check(counter.claudeCalls === 1, "ONE CALL: first execution invokes the provider process exactly once");
  check(result.status === "PLAN_COMPLETE", "ONE CALL: the autonomy loop runs to PLAN_COMPLETE");
  check(
    result.completed.length === 1 && result.completed[0].mission === MISSION,
    "ONE CALL: the provider mission is the one released",
  );
  check(
    result.completed[0]?.record.decision === "RELEASE",
    "ONE CALL: the Release Manager terminates the mission with RELEASE",
  );
  check(result.halt === null, "ONE CALL: no halt — the Release Manager did not block");
}

// --- 3) CACHE: identical re-execution in a fresh session is served from the on-disk cache --------

{
  const provider = new ClaudeProviderAdapter({ cwd: ws, run: makeRunner(counter), cacheDir });
  const ports = new AutonomyRuntimeAdapter(ws, provider);
  const result = new RuntimeAutonomy().run(cfg, ports);

  check(counter.claudeCalls === 1, "CACHE: identical re-execution makes NO new live provider call");
  check(result.status === "PLAN_COMPLETE", "CACHE: the re-run still runs to PLAN_COMPLETE");
  check(
    result.completed[0]?.record.decision === "RELEASE",
    "CACHE: the Release Manager still terminates with RELEASE off the cached outcome",
  );
}

fs.rmSync(ws, { recursive: true, force: true });

if (failures > 0) {
  console.error(`\nProvider Enabled Mission: ${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nProvider Enabled Mission OK");
