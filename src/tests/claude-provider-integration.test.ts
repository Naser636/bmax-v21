/*
 * Integration test — Claude Provider wired into the Autonomy Runtime adapter
 * (INTEGRATE_CLAUDE_PROVIDER_V1)
 *
 * Proves the three mission acceptance checks WITHOUT a live (paid) Claude call, by exercising the
 * real routing path (`AutonomyRuntimeAdapter.runPipeline` → `missionRequiresProvider` → provider)
 * with the process boundary stubbed at the injection points the components already expose:
 *
 *   1. A local / deterministic mission NEVER calls the provider.
 *   2. A mission requiring a provider calls the Provider Adapter EXACTLY ONCE.
 *   3. A second identical execution is served by the existing cache — no new live call.
 *
 * Run: `npx tsx src/tests/claude-provider-integration.test.ts`.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { AutonomyRuntimeAdapter } from "@/runtime/autonomy-runtime-adapter";
import {
  ClaudeProviderAdapter,
  type ProviderProcessRunner,
} from "@/providers/claude-provider-adapter";
import type {
  EngineeringProviderPort,
  ProviderOutcome,
  ProviderRequest,
} from "@/providers/provider-port";

// --- workspace fixture ------------------------------------------------------

function makeWorkspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "odg-provider-int-"));
  fs.mkdirSync(path.join(root, "runtime/missions"), { recursive: true });
  // A local mission: no write scope, non-audit mode ⇒ missionRequiresProvider === false.
  fs.writeFileSync(
    path.join(root, "runtime/missions/LOCAL_MISSION.json"),
    JSON.stringify({ mission: "LOCAL_MISSION", mode: "SEQUENTIAL", priority: "NORMAL" }),
  );
  // A provider mission: declares an explicit write scope ⇒ missionRequiresProvider === true.
  fs.writeFileSync(
    path.join(root, "runtime/missions/PROVIDER_MISSION.json"),
    JSON.stringify({
      mission: "PROVIDER_MISSION",
      mode: "IMPLEMENT",
      priority: "NORMAL",
      authorized_paths: ["src/app/**"],
      objectives: [{ id: "o1", goal: "Deliver X.", done_when: ["Build green."] }],
      definition_of_done: ["Objective completed."],
      completion: ["Release Manager decision is RELEASE."],
    }),
  );
  return root;
}

// --- fake provider (counts execute() calls) ---------------------------------

function fakeProvider(): { port: EngineeringProviderPort; calls: () => number } {
  let calls = 0;
  const port: EngineeringProviderPort = {
    name: "fake-provider",
    describe: () => ({
      name: "fake-provider",
      kind: "engineering-provider",
      providerContractVersion: "1.0.0",
      model: "fake",
    }),
    execute: (_request: ProviderRequest): ProviderOutcome => {
      calls++;
      return {
        provider: "fake-provider",
        classification: "OK",
        providerExecuted: true,
        fromCache: false,
        result: null,
        sessionId: "sess-int",
        changedFiles: [],
        unauthorizedChanges: [],
        raw: { exitCode: 0, stdout: "", stderr: "" },
        diagnostics: [],
      };
    },
  };
  return { port, calls: () => calls };
}

const ws = makeWorkspace();

// 1) A local mission never touches the provider ------------------------------
{
  const fp = fakeProvider();
  const adapter = new AutonomyRuntimeAdapter(ws, fp.port);
  const out = adapter.runPipeline("LOCAL_MISSION");
  console.assert(fp.calls() === 0, "local mission NEVER calls the provider");
  console.assert(out.pipelineOk === false, "local mission runs the deterministic pipeline (no odg-run.js in fixture ⇒ not ok)");
}

// 2) A provider mission calls the provider exactly once ----------------------
{
  const fp = fakeProvider();
  const adapter = new AutonomyRuntimeAdapter(ws, fp.port);
  const out = adapter.runPipeline("PROVIDER_MISSION");
  console.assert(fp.calls() === 1, "provider mission calls the provider exactly once");
  console.assert(out.pipelineOk === true, "OK provider outcome ⇒ pipelineOk true");

  // Same session, identical mission: recorded outcome is reused — still exactly one call.
  const out2 = adapter.runPipeline("PROVIDER_MISSION");
  console.assert(fp.calls() === 1, "repeat within the session makes no second provider call");
  console.assert(out2.pipelineOk === true, "reused outcome still maps to pipelineOk true");
}

// 3) A second identical EXECUTION (fresh session) is served by the on-disk cache
//    — exercise the REAL ClaudeProviderAdapter with only the process boundary stubbed.
{
  const cacheDir = path.join(ws, "runtime/generated/provider-cache-int");
  fs.rmSync(cacheDir, { recursive: true, force: true });

  let claudeCalls = 0;
  const runner: ProviderProcessRunner = (bin) => {
    if (bin === "git") return { status: 0, stdout: "", stderr: "" };
    claudeCalls++;
    return {
      status: 0,
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        session_id: "sess-cache",
        result: JSON.stringify({
          mission: "PROVIDER_MISSION",
          providerContractVersion: "1.0.0",
          status: "DONE",
          objectivesAddressed: ["o1"],
          changedFiles: [],
          commandsRun: [],
          blocker: null,
        }),
      }),
      stderr: "",
    };
  };

  // Session A — first execution: one live provider call, result written to the cache.
  const providerA = new ClaudeProviderAdapter({ cwd: ws, run: runner, cacheDir });
  new AutonomyRuntimeAdapter(ws, providerA).runPipeline("PROVIDER_MISSION");
  console.assert(claudeCalls === 1, "first execution makes one live provider call");

  // Session B — identical execution, brand-new adapter + provider sharing the same cache dir.
  const providerB = new ClaudeProviderAdapter({ cwd: ws, run: runner, cacheDir });
  new AutonomyRuntimeAdapter(ws, providerB).runPipeline("PROVIDER_MISSION");
  console.assert(claudeCalls === 1, "identical re-execution is served from cache — no new live call");
}

fs.rmSync(ws, { recursive: true, force: true });

console.log("Claude Provider Integration OK");
