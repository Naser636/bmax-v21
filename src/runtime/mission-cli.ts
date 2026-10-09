/*
 * Runtime — unified single-mission CLI entrypoint (`odg mission <MISSION>`)
 *
 * The unified entry point for every mission (UNIFY_RUNTIME_EXECUTION). MissionOrchestrator plans
 * the mission first (OBJ-001) and the Runtime then chooses ONE of three routes:
 *
 *   1. PROVIDER  — an ENGINEERING mission (missionRequiresProvider === true) is driven through the
 *      EXISTING RuntimeAutonomy + AutonomyRuntimeAdapter so the execute stage reaches the Claude
 *      Provider Adapter. Unchanged from before; scoped to ONE mission via SingleMissionAdapter.
 *   2. LOCAL     — a migrated mission (mission-migration.ts) is executed entirely inside
 *      src/runtime via MissionOrchestrator → RuntimeExecutor (OBJ-002).
 *   3. LOCAL PIPELINE — any other deterministic mission is driven through the ONE Runtime's local
 *      execution pipeline (runtime/bin/odg-local-pipeline.sh → odg-verify + odg-run). This is a
 *      first-class route, NOT a fallback to a second engine: mission-cli drives it directly and
 *      returns its real terminal exit code, so there is a single entrypoint and no FALLBACK protocol.
 *
 * The set of migrated missions and the migration report (OBJ-004) live in mission-migration.ts.
 * No foundation, contract, governance, provider or engine file is modified here.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);

import { RuntimeAutonomy } from "@/core/runtime-autonomy";
import {
  AUTONOMY_CONTRACT_VERSION,
  type AutonomyPlanState,
} from "@/contracts/runtime-autonomy";
import type { ReleaseRecord } from "@/contracts/release";
import { AutonomyRuntimeAdapter } from "@/runtime/autonomy-runtime-adapter";
import { missionRequiresProvider, type RoutableMission } from "@/providers";
import { MissionOrchestrator } from "./mission-orchestrator";
import { createMissionIntent } from "./mission-intent";
import { LocalMissionRunner } from "./local-mission-runner";
import { isMigratedMission, renderMigrationReport } from "./mission-migration";
import { runConverge } from "./converge-cli";
import { recordOllamaRouting } from "./ollama-routing-hook";

/**
 * Missions that mean "drive the whole Runtime to convergence" rather than run a single mission.
 * The literal success-criterion command `odg mission RUNTIME_FULL_AUTONOMY_EXECUTION` is routed to
 * the Convergence Orchestrator; any mission JSON declaring `mode: "convergence"` is too. Every other
 * mission keeps the unchanged local / provider / mse single-mission routing below.
 */
function isConvergenceMission(mission: string, spec: RawMission | null): boolean {
  return mission === "RUNTIME_FULL_AUTONOMY_EXECUTION" || spec?.mode === "convergence";
}

/** Raw shape of an existing runtime/missions/*.json file (read-only; no new format introduced). */
interface RawMission {
  mode?: string;
  authorized_paths?: unknown;
  authorizedPaths?: unknown;
  requires_engineering?: boolean;
  requiresEngineering?: boolean;
  objectives?: { id?: string; goal?: string; patch?: unknown }[];
  verify?: { capability?: unknown; evidence?: unknown }[];
}

/**
 * ODG-LOCAL ENGINEERING EXECUTION signal. `missionRequiresProvider` sends EVERY authorized_paths mission
 * to the provider — on the assumption the provider must AUTHOR the change. But when the mission already
 * carries its concrete edits (objective.patch with target+content/diff), the authoring is DONE: nothing
 * is left but DETERMINISTIC local application (Patch Engine → Patch Executor under action-gate +
 * authorized_paths) + validation + ledger. Forcing such a mission to the provider was a catch-22 that
 * made a bounded LOCAL engineering mission impossible (authorized_paths ⇒ provider; no authorized_paths ⇒
 * the edit can't apply). This signal routes a pre-authored engineering mission to the EXISTING local
 * pipeline so ODG executes it itself — no provider call, no authoring. Bounded: requires authorized_paths
 * AND at least one objective carrying a concrete edit; a mission with NO edits still goes to the provider
 * to be authored (unchanged). Reuses the existing local pipeline — no second runtime/engine.
 */
export function missionIsPreAuthoredEngineering(spec: RawMission | null): boolean {
  if (!spec) return false;
  const paths = spec.authorized_paths ?? spec.authorizedPaths;
  const hasPaths = Array.isArray(paths) && paths.some((p) => typeof p === "string" && p.length > 0);
  if (!hasPaths) return false;
  const objs = Array.isArray(spec.objectives) ? spec.objectives : [];
  const hasConcreteEdit = objs.some((o) => {
    const raw = o && (o as { patch?: unknown }).patch;
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return list.some((e) => e && typeof e === "object" && typeof (e as { target?: unknown }).target === "string" &&
      (typeof (e as { content?: unknown }).content === "string" || typeof (e as { diff?: unknown }).diff === "string"));
  });
  return hasConcreteEdit;
}

/**
 * Route signal for the semantic entrypoint (`odg objective` → runtime/bin/odg-objective.js, id
 * namespace "NL_"). A capability-backed NL mission must run on the route that ACTUALLY executes
 * capabilities — the RuntimeExecutor LOCAL route dispatches the EXISTING capability-executors registry
 * and gates on genuine objective evidence; the local-pipeline route never dispatches capability-
 * executors, so a synthesized NL mission would "pass" there without any capability running. This reuses
 * the EXISTING runLocalRoute and the EXISTING capability-executors registry as the only routing signal;
 * it is bounded to the NL_ namespace so every other mission keeps its exact current route selection.
 * No second runtime / mission system is introduced — only route selection among existing routes.
 */
export function nlMissionResolvesCapability(
  mission: string,
  spec: RawMission | null,
): boolean {
  if (!mission.startsWith("NL_") || !spec) return false;
  const objs = Array.isArray(spec.objectives) ? spec.objectives : [];
  if (objs.length === 0) return false;
  let executors: { resolve: (p: { objectiveId?: string; goal?: string }) => unknown };
  try {
    executors = require_("../../runtime/core/capability-executors.js") as {
      resolve: (p: { objectiveId?: string; goal?: string }) => unknown;
    };
  } catch {
    return false; // registry unavailable ⇒ fail closed to the unchanged local-pipeline route
  }
  return objs.some((o) => executors.resolve({ objectiveId: o.id, goal: o.goal }) != null);
}

/**
 * Route signal for a VERIFY-ONLY capability-PROOF mission (namespace-agnostic). A mission that carries
 * NO concrete edits has nothing for a provider to AUTHOR; when it additionally DECLARES a `verify` block
 * binding a capability to an evidence probe, AND each such capability resolves — via one of the mission's
 * own objectives — to an EXISTING local capability-executor of EXACTLY that capability, the mission is
 * proven by RUNNING that capability on the LOCAL route (RuntimeExecutor → capability-executors, dry-run
 * default ⇒ zero network/provider), not by provider authoring.
 *
 * This is strictly NARROWER than `missionRequiresProvider`: it fires only on the conjunction
 * (no-edits ∧ declared-capability-proof ∧ locally-resolvable-to-the-declared-capability). An ordinary
 * engineering mission — which needs the provider to author and declares no resolvable verify probe — is
 * NOT selected and still falls through to the provider unchanged. A verify probe whose capability only
 * text-matches a different executor fails closed (capability mismatch). No mission name is hardcoded; the
 * NL_ route (`nlMissionResolvesCapability`) and normal provider routing are untouched. It reuses the
 * EXISTING runLocalRoute + capability-executors registry — no second runtime/engine, no new format.
 */
export function missionIsLocalCapabilityProof(spec: RawMission | null): boolean {
  if (!spec) return false;
  // A mission that already carries concrete edits is the pre-authored-engineering route's job, not this.
  if (missionIsPreAuthoredEngineering(spec)) return false;
  const verify = Array.isArray(spec.verify) ? spec.verify : [];
  const probes = verify.filter(
    (v): v is { capability: string; evidence: string } =>
      !!v && typeof v.capability === "string" && v.capability.length > 0 &&
      typeof v.evidence === "string" && v.evidence.length > 0,
  );
  if (probes.length === 0) return false; // not a declared capability-proof mission ⇒ unchanged routing
  const objs = Array.isArray(spec.objectives) ? spec.objectives : [];
  if (objs.length === 0) return false;
  let executors: {
    resolve: (p: { objectiveId?: string; goal?: string }) => { capability?: string } | null;
  };
  try {
    executors = require_("../../runtime/core/capability-executors.js") as {
      resolve: (p: { objectiveId?: string; goal?: string }) => { capability?: string } | null;
    };
  } catch {
    return false; // registry unavailable ⇒ fail closed to the unchanged provider route
  }
  // Every declared verify-probe capability must be backed by an objective that resolves to a LOCAL
  // executor of EXACTLY that capability — sufficient proof the mission is capability-backed AND locally
  // executable, not merely "verify-only". A different-capability (text) match fails closed.
  return probes.every((p) =>
    objs.some((o) => {
      const r = executors.resolve({ objectiveId: o.id, goal: o.goal });
      return !!r && r.capability === p.capability;
    }),
  );
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

/**
 * Provider route (unchanged behaviour): drive an ENGINEERING mission through the EXISTING
 * RuntimeAutonomy + AutonomyRuntimeAdapter so the execute stage reaches the Claude Provider
 * Adapter. Terminal-outcome mapping is identical to `odg autonomy`.
 */
function runProviderRoute(mission: string): number {
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

  // RUNTIME_AUTONOMY_DESIGN_v1.md §3: PLAN_COMPLETE → 0; BLOCKED → 2; else failure → 1.
  if (result.status === "PLAN_COMPLETE") return 0;
  if (result.status === "BLOCKED") return 2;
  return 1;
}

/**
 * Local route (OBJ-002): execute a migrated mission entirely inside src/runtime via the
 * MissionOrchestrator → RuntimeExecutor pipeline. Never falls back to mse.
 */
export function runLocalRoute(
  mission: string,
  runner: LocalMissionRunner = new LocalMissionRunner(),
): number {
  console.log("Route      : MissionOrchestrator → RuntimeExecutor (local, src/runtime)");
  console.log("--------------------------------------");

  const outcome = runner.run(mission, mission);

  if (!outcome.ok) {
    console.log("Status     : LOCAL_EXECUTION_FAILED");
    console.log("Detail     :", outcome.error);
    console.log("======================================");
    return 1;
  }

  const exec = outcome.execution as {
    logicalSteps?: number;
    technicalSteps?: number;
    capabilities?: unknown[];
  };
  console.log("Status     : LOCAL_COMPLETE");
  console.log("Logical    :", exec.logicalSteps ?? 0, "steps");
  console.log("Technical  :", exec.technicalSteps ?? 0, "steps");
  console.log("Capabilities:", exec.capabilities?.length ?? 0);
  // Read-only Expert Instance surface (declarative metadata; NOT on any decision path).
  if (outcome.expertInstance) {
    const xi = outcome.expertInstance;
    console.log(
      "Expert     :",
      `${xi.role} (${xi.profile_status}); authority_scope=[${xi.authority_scope.join(", ")}]`,
    );
  }
  // Ledger seam: the LOCAL route hands its honest verdict to the EXISTING recordMission writer
  // (proven-only gate). Only a validated run obtains a proven ledger entry; no cascade, no bypass.
  console.log("Validated  :", outcome.validated === true);
  console.log("Ledger     : recordMission invoked via LOCAL route (proven-only gate applies)");
  console.log("======================================");
  // Exit status must reflect the HONEST verdict, not merely that execution ran without throwing.
  // `outcome.validated` is the RuntimeReporter proof gate's result (status === "SUCCESS"); a LOCAL
  // mission that executed but was NOT validated is a failure and must exit non-zero — matching the
  // sibling routes (convergence returns 1 unless PLAN_COMPLETE; the local-pipeline route returns the
  // pipeline's real non-zero on an unproven mission). Previously this returned 0 unconditionally,
  // printing `Validated: false` yet exiting 0 (a false-success exit for `odg mission <migrated>`).
  return outcome.validated === true ? 0 : 1;
}

/**
 * Local-pipeline route (single-entrypoint consolidation): a deterministic local mission is a
 * first-class route of the ONE Runtime. mission-cli drives the local execution pipeline directly
 * (runtime/bin/odg-local-pipeline.sh → odg-verify pre-flight + odg-run staged pipeline + governance
 * gates) and returns its real terminal exit code. There is no second engine and no FALLBACK exit
 * protocol for the launcher to dispatch.
 */
function runLocalPipelineRoute(mission: string): number {
  console.log("Decision   : local deterministic mission → LOCAL PIPELINE (one Runtime)");
  console.log("Route      : odg-local-pipeline.sh → odg-verify + odg-run");
  console.log("======================================");
  const r = spawnSync(
    "bash",
    [path.join("runtime", "bin", "odg-local-pipeline.sh"), mission],
    { stdio: "inherit" },
  );
  return r.status ?? 1;
}

function main(): number {
  const mission = process.argv[2];
  if (!mission) {
    console.error("Usage: tsx src/runtime/mission-cli.ts <MISSION>");
    return 1;
  }

  // Inspection helper (OBJ-004): print the migration report and exit without routing.
  if (mission === "--migration-report") {
    console.log(renderMigrationReport());
    return 0;
  }

  const spec = readMissionSpec(mission);

  // Convergence route: `odg mission RUNTIME_FULL_AUTONOMY_EXECUTION` (and any mode:"convergence"
  // mission) is not a single mission — delegate to the Convergence Orchestrator. Non-breaking: every
  // other mission name falls through to the unchanged single-mission routing below.
  if (isConvergenceMission(mission, spec)) {
    console.log("Decision   : convergence mission → CONVERGENCE ORCHESTRATOR");
    return runConverge();
  }

  console.log("======================================");
  console.log("ODG MISSION — UNIFIED RUNTIME ENTRY");
  console.log("======================================");
  console.log("Mission    :", mission);

  // OBJ-001: MissionOrchestrator is the single entry point — every mission is planned here
  // first; the Runtime then chooses local vs provider execution.
  try {
    const plan = new MissionOrchestrator().buildPlan(
      mission,
      mission,
      createMissionIntent(mission),
    );
    console.log("Orchestrator: plan built (" + plan.steps.length + " steps)");
  } catch (e) {
    console.log("Orchestrator: plan unavailable (" + (e as Error).message + ")");
  }

  // OBJ-004: always surface the migration status as evidence of what src/runtime owns.
  console.log("--------------------------------------");
  console.log(renderMigrationReport());
  console.log("--------------------------------------");

  // ON_DEMAND_MODEL_ROUTING_V2 (opt-in, OFF by default): surface the Ollama control-plane routing decision
  // for this mission as gitignored evidence. Strict NO-OP unless ODG_OLLAMA_CONTROL_PLANE=1 — it NEVER
  // changes route selection, provider choice, or execution; it only records an observability decision.
  const ocp = recordOllamaRouting(mission, spec, { cwd: process.cwd() });
  if (ocp.enabled) {
    console.log(`Ollama CP  : tier=${ocp.tier} model=${ocp.model ?? "(none)"} routed=${ocp.routed} risk=${ocp.risk} — ${ocp.reason}`);
  }

  // Route selection — the Runtime chooses local vs provider vs fallback.
  if (isMigratedMission(mission)) {
    console.log("Decision   : migrated local mission → LOCAL RUNTIME");
    return runLocalRoute(mission);
  }

  // ODG-local engineering: a mission that ALREADY carries its concrete edits needs no provider to
  // author — only deterministic local application. Route it to the local pipeline BEFORE the provider
  // check so ODG executes bounded engineering itself (apply → validate → ledger), governed by the
  // action-gate at apply time. A mission with no edits still falls through to the provider to be authored.
  if (spec && missionIsPreAuthoredEngineering(spec)) {
    console.log("Decision   : pre-authored engineering mission (edits present) → LOCAL PIPELINE (ODG deterministic apply)");
    return runLocalPipelineRoute(mission);
  }

  // Verify-only capability-proof mission: no edits to author, but its `verify` block binds a capability
  // to an evidence probe AND that capability resolves to an EXISTING local capability-executor via an
  // objective. Nothing for a provider to author — run it on the LOCAL route that actually dispatches
  // capability-executors (dry-run default ⇒ zero network/provider). Checked BEFORE the provider gate and
  // strictly narrower than it, so a mission with no resolvable capability-proof block still goes to the
  // provider unchanged. Namespace-agnostic (no mission name hardcoded); the NL_ route below is untouched.
  if (spec && missionIsLocalCapabilityProof(spec)) {
    console.log("Decision   : verify-only capability-proof mission → LOCAL RUNTIME (capability execution + evidence)");
    return runLocalRoute(mission);
  }

  if (spec && missionRequiresProvider(toRoutable(spec))) {
    console.log("Decision   : missionRequiresProvider = true → PROVIDER");
    return runProviderRoute(mission);
  }

  // Semantic entrypoint: a capability-backed NL mission must run on the route that actually EXECUTES
  // its capability and gates on real objective evidence (RuntimeExecutor → capability-executors),
  // not the local-pipeline (which never dispatches capability-executors). Bounded to the NL_ namespace.
  if (nlMissionResolvesCapability(mission, spec)) {
    console.log("Decision   : NL capability-backed mission → LOCAL RUNTIME (capability execution + evidence)");
    return runLocalRoute(mission);
  }

  // Single-entrypoint consolidation: every other deterministic mission is driven through the one
  // Runtime's local execution pipeline directly — no fallback exit code, no second engine.
  return runLocalPipelineRoute(mission);
}

// Only auto-run when invoked directly as a script (not when imported by a test). Mirrors the same
// guard converge-cli.ts uses, so importing runLocalRoute for a unit test does not execute main().
if (
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  /mission-cli\.ts$/.test(process.argv[1] ?? "")
) {
  process.exit(main());
}
