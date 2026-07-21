/*
 * Runtime Autonomy — single-mission CLI entrypoint (`odg mission <MISSION>`, provider route)
 *
 * The one new piece required to let `odg mission <MISSION>` execute an ENGINEERING mission through
 * the Claude Provider Adapter. It is pure wiring and adds no business logic of its own:
 *
 *   - it reuses the EXISTING autonomous core (src/core/runtime-autonomy.ts) and the EXISTING
 *     Runtime adapter (src/runtime/autonomy-runtime-adapter.ts) verbatim;
 *   - the provider routing decision, the provider call, evidence gathering, the Release Manager
 *     decision and the ledger archive are ALL the adapter's / core's own behaviour — untouched;
 *   - the only thing this file contributes is scoping the Autonomy Cycle to the ONE mission named
 *     on the command line (SingleMissionAdapter) so the same loop runs it and then reports
 *     PLAN_COMPLETE.
 *
 * Compatibility: a mission that does NOT require a provider (local / deterministic — the existing
 * roadmap missions) is left entirely to the existing Mission-Standard engine (`mse`). This entry
 * point signals that by exiting with FALLBACK_TO_MSE, and the `odg` launcher then runs `mse`
 * exactly as before. No local mission path is changed.
 *
 * No foundation, contract, governance, provider or engine file is modified here.
 */

import fs from "node:fs";
import path from "node:path";

import { RuntimeAutonomy } from "@/core/runtime-autonomy";
import {
  AUTONOMY_CONTRACT_VERSION,
  type AutonomyPlanState,
} from "@/contracts/runtime-autonomy";
import type { ReleaseRecord } from "@/contracts/release";
import { AutonomyRuntimeAdapter } from "@/runtime/autonomy-runtime-adapter";
import { missionRequiresProvider, type RoutableMission } from "@/providers";

/** Exit code telling the `odg` launcher to fall back to the existing Mission-Standard engine. */
const FALLBACK_TO_MSE = 3;

/** Raw shape of an existing runtime/missions/*.json file (read-only; no new format introduced). */
interface RawMission {
  mode?: string;
  authorized_paths?: unknown;
  authorizedPaths?: unknown;
  requires_engineering?: boolean;
  requiresEngineering?: boolean;
}

function readMissionSpec(mission: string): RawMission | null {
  try {
    return JSON.parse(
      fs.readFileSync(path.join("runtime", "missions", `${mission}.json`), "utf8"),
    ) as RawMission;
  } catch {
    return null;
  }
}

/** Map an existing mission JSON onto the provider-owned routing shape (Provider Contract §0/§1). */
function toRoutable(spec: RawMission): RoutableMission {
  const paths = spec.authorized_paths ?? spec.authorizedPaths;
  return {
    mode: spec.mode,
    authorizedPaths: Array.isArray(paths)
      ? paths.filter((p): p is string => typeof p === "string")
      : [],
    requiresEngineering: spec.requires_engineering ?? spec.requiresEngineering,
  };
}

/**
 * Scopes the EXISTING AutonomyRuntimeAdapter to exactly one mission.
 *
 * `readPlanState` is the only Stage-1 input; by returning a single-mission plan we make the frozen
 * `selectNextMission` pick THIS mission (missing & not yet completed), run it once, then — after a
 * RELEASE archive flips `released` — report it completed so the next selection returns null and the
 * Autonomy Cycle terminates with PLAN_COMPLETE. Every other port (generateContract, runPipeline —
 * which owns the missionRequiresProvider → ClaudeProviderAdapter routing — gatherEvidence, archive)
 * is inherited unchanged, so no logic is duplicated.
 */
class SingleMissionAdapter extends AutonomyRuntimeAdapter {
  private released = false;

  constructor(private readonly missionId: string, cwd?: string) {
    super(cwd);
  }

  readPlanState(): AutonomyPlanState {
    return {
      masterPlanObjectives: [this.missionId],
      missingCapabilities: [this.missionId],
      completedMissions: this.released ? [this.missionId] : [],
    };
  }

  archive(mission: string, record: ReleaseRecord): void {
    // Reuse the base archive (Mission Ledger) exactly; only remember that this run has released so
    // the very next readPlanState reports the plan exhausted and the loop stops at PLAN_COMPLETE.
    super.archive(mission, record);
    this.released = true;
  }
}

function main(): number {
  const mission = process.argv[2];
  if (!mission) {
    console.error("Usage: tsx src/runtime/mission-cli.ts <MISSION>");
    return 1;
  }

  const spec = readMissionSpec(mission);
  // No mission definition here, or a local / deterministic mission ⇒ keep the EXISTING mse path.
  if (!spec || !missionRequiresProvider(toRoutable(spec))) {
    return FALLBACK_TO_MSE;
  }

  console.log("======================================");
  console.log("ODG MISSION — ENGINEERING PROVIDER ROUTE");
  console.log("======================================");
  console.log("Mission    :", mission);
  console.log("Decision   : missionRequiresProvider = true");
  console.log("Route      : RuntimeAutonomy → AutonomyRuntimeAdapter → ClaudeProviderAdapter");
  console.log("--------------------------------------");

  const autonomy = new RuntimeAutonomy();
  const ports = new SingleMissionAdapter(mission);
  autonomy.initialize();

  const result = autonomy.run(
    { autonomyContractVersion: AUTONOMY_CONTRACT_VERSION },
    ports,
  );

  console.log("--------------------------------------");
  console.log("Status     :", result.status);
  console.log("Cycles     :", result.cycles);
  console.log(
    "Released   :",
    result.completed.length > 0
      ? result.completed.map((c) => c.mission).join(", ")
      : "(none)",
  );
  if (result.halt) {
    console.log("Halt on    :", result.halt.mission ?? "(plan)");
    console.log("Reason     :", result.halt.reason);
    console.log("Detail     :", result.halt.message);
  }
  console.log("======================================");

  // Same terminal-outcome mapping as `odg autonomy` (RUNTIME_AUTONOMY_DESIGN_v1.md §3):
  //   PLAN_COMPLETE → clean success (0); BLOCKED → human decision required (2); else failure (1).
  if (result.status === "PLAN_COMPLETE") return 0;
  if (result.status === "BLOCKED") return 2;
  return 1;
}

process.exit(main());
