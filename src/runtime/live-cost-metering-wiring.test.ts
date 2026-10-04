/*
 * V5 Stage 3 — D wiring: live cost metering is BRANCHED into the real runViaProvider path.
 *
 * Proves BEHAVIOURALLY (not just at the unit level) that AutonomyRuntimeAdapter.runPipeline, once it
 * escalates to the provider, routes the REAL provider invocation through runtime/core/live-cost-metering.js
 * when — and ONLY when — the mission declares a budget:
 *   - budget declared + injected provider returning OBSERVED usage ⇒ the provider runs, the ledger SPENDS
 *     exactly the observed amount, and a gitignored metering report is written;
 *   - no budget declared ⇒ pure pass-through: the provider still runs and NO metering report is written
 *     (byte-for-byte the prior behaviour — this is why the whole existing suite is unaffected).
 *
 * Uses an INJECTED fake provider (no real/paid call) and a sandbox repo. The local pipeline binary is
 * absent in the sandbox, so runPipeline fails locally and escalates to the provider exactly as designed.
 *
 * Run: node_modules/.bin/tsx src/runtime/live-cost-metering-wiring.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { AutonomyRuntimeAdapter } from "./autonomy-runtime-adapter";
import {
  absentObservation,
  observedUsage,
  type EngineeringProviderPort,
  type ProviderOutcome,
  type ProviderRequest,
} from "@/providers";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

const REPO = process.cwd();
const CORE = ["economic-unit.js", "budget-ledger.js", "budget-contract.js", "cost-accounting.js", "live-cost-metering.js"];

/** A fake engineering provider: counts calls, returns OK carrying a fixed OBSERVED token usage. */
class FakeProvider implements EngineeringProviderPort {
  readonly name = "fake-provider";
  calls = 0;
  constructor(private readonly tokens: number | null) {}
  describe() { return { name: this.name, kind: "engineering-provider" as const, providerContractVersion: "1.0.0", model: "fake" }; }
  execute(_request: ProviderRequest): ProviderOutcome {
    this.calls++;
    return {
      provider: this.name,
      classification: "OK",
      providerExecuted: true,
      fromCache: false,
      result: { mission: "M", providerContractVersion: "1.0.0", status: "DONE", objectivesAddressed: ["m_1"], changedFiles: [], commandsRun: [], blocker: null },
      sessionId: null,
      changedFiles: [],
      unauthorizedChanges: [],
      raw: { exitCode: 0, stdout: "", stderr: "" },
      diagnostics: [],
      observation: this.tokens == null
        ? absentObservation()
        : observedUsage([{ unit: "token", kind: "COST_UNIT", minor: this.tokens, scale: 0 }], "fake:usage"),
    };
  }
}

function sandbox(budget: boolean): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "d-wiring-"));
  fs.mkdirSync(path.join(dir, "runtime", "core"), { recursive: true });
  fs.mkdirSync(path.join(dir, "runtime", "missions"), { recursive: true });
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  for (const f of CORE) fs.copyFileSync(path.join(REPO, "runtime", "core", f), path.join(dir, "runtime", "core", f));
  spawnSync("git", ["init", "-q"], { cwd: dir });
  const mission: Record<string, unknown> = {
    mission: "M",
    mode: "IMPLEMENT",
    requires_engineering: true,
    authorized_paths: ["src/app/**"],
    objectives: [{ id: "m_1", goal: "deliver", done_when: ["ok"] }],
  };
  if (budget) {
    mission.budget = { allocations: [{ bucket: "provider", unit: "token", kind: "COST_UNIT", amount: 1000, scale: 0 }] };
  }
  fs.writeFileSync(path.join(dir, "runtime", "missions", "M.json"), JSON.stringify(mission, null, 2));
  return dir;
}

console.log("V5 — D WIRING: LIVE METERING IN runViaProvider");

// 1 — budget declared ⇒ provider runs through the meter; ledger SPENDS the observed usage; report written.
{
  const dir = sandbox(true);
  const provider = new FakeProvider(300);
  const adapter = new AutonomyRuntimeAdapter(dir, provider);
  const outcome = adapter.runPipeline("M");
  check(provider.calls >= 1, "provider was invoked via the metered live path");
  check(outcome.pipelineOk === true, "clean provider run ⇒ pipelineOk true");
  const reportPath = path.join(dir, "runtime", "generated", "cost-metering-report.json");
  check(fs.existsSync(reportPath), "a cost-metering report was written (D engaged)");
  if (fs.existsSync(reportPath)) {
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    check(report.decision === "SPENT" && report.snapshot?.spent === 300, "ledger SPENT exactly the OBSERVED 300 tokens");
    check(report.snapshot?.available === 700 && report.snapshot?.recovered === 1000, "remainder returned; admission reservation recovered");
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

// 2 — no budget ⇒ pure pass-through: provider still runs, NO metering report (prior behaviour preserved).
{
  const dir = sandbox(false);
  const provider = new FakeProvider(300);
  const adapter = new AutonomyRuntimeAdapter(dir, provider);
  const outcome = adapter.runPipeline("M");
  check(provider.calls >= 1, "no-budget mission still invokes the provider (unchanged)");
  check(outcome.pipelineOk === true, "no-budget clean run ⇒ pipelineOk true");
  check(!fs.existsSync(path.join(dir, "runtime", "generated", "cost-metering-report.json")), "no budget ⇒ NO metering report (dormant, backward compatible)");
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(failures === 0 ? "ALL PASS — D WIRING" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
