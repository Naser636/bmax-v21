/*
 * Runtime Autonomy — Runtime adapter (integration glue)
 *
 * Implements AutonomyRuntimePorts (RUNTIME_AUTONOMY_DESIGN_v1.md §2) over the REAL existing
 * Runtime components. This is the thin, impure boundary the frozen design assigns to the Runtime:
 * it reads already-persisted evidence, launches the EXISTING pipeline unchanged, reuses the
 * Documentation Engine to produce the release proof, and appends to the EXISTING Mission Ledger.
 *
 * It creates no new foundation and no new persistence format, and it never modifies the pipeline's
 * business logic — it only invokes `runtime/bin/odg-run.js` exactly as a human does today. The
 * completion decision is NOT made here; it belongs solely to the Release Manager, invoked by the
 * pure core (design §0 founding invariant).
 */

import fs from "node:fs";
import { spawnSync, execFileSync } from "node:child_process";
import { createRequire } from "node:module";

// Bridge to the existing CommonJS Runtime components (runtime/core/*.js) from this ESM adapter.
const requireCjs = createRequire(import.meta.url);

import type {
  AutonomyPlanState,
  AutonomyRuntimePorts,
  MissionContract,
  PipelineOutcome,
  ReleaseEvidence,
} from "@/contracts/runtime-autonomy";
import type { ReleaseArtifactRef, ReleaseRecord } from "@/contracts/release";
import type {
  Artifact,
  DocumentationInputs,
  DocumentationProof,
} from "@/contracts/documentation";
import { DocumentationEngine } from "@/core/documentation-engine";
import { ARTIFACT_CONTRACT_VERSION } from "@/contracts/documentation";
import {
  PROVIDER_CONTRACT_VERSION,
  absentObservation,
  missionRequiresProvider,
  toPipelineOutcome,
} from "@/providers";
import type {
  EngineeringProviderPort,
  ProviderMission,
  ProviderObjective,
  ProviderOutcome,
  ProviderRequest,
  RoutableMission,
} from "@/providers";
import { ProviderPatchEngine, type PatchReceipt } from "./patch-engine";
import { RootCauseEngine, type MinimalPatch } from "./root-cause-engine";
import {
  haltOutcome,
  runMissionWithFailover,
  type FailoverMissionReport,
} from "./provider-failover-engine";

const GENERATED = "runtime/generated";
const MISSION_PLAN = `${GENERATED}/mission-plan.json`;
const PATCH_PLAN = `${GENERATED}/patch-plan.json`;
const PATCH_EXECUTION = `${GENERATED}/patch-execution.json`;
const MISSION_REPORT = `${GENERATED}/mission-report.json`;
// The EXISTING per-run freshness token the Validation Engine already consumes (validation-engine.js:137-141)
// and the Checkpoint Engine already stamps on the LOCAL route (checkpoint-engine.begin). The provider route
// reuses the SAME artifact + `startedAt` field (no second timestamp source) so freshness-bearing probes get
// a mission-scoped run start instead of falling back to content-only. (P0-070 / FIX_PROVIDER_VALIDATION_PROBE_FRESHNESS_V1)
const PIPELINE_CHECKPOINT = `${GENERATED}/pipeline-checkpoint.json`;
// The failover decision evidence written on every provider run: which provider was selected, and —
// for the OpenAI failover target — the exact blocking component / missing config / next action if it
// is unusable (mission PROVIDER_FAILOVER_TO_OPENAI, objectives 3-7). Never a source of truth for the
// verdict; pure evidence so the provider selection is auditable.
const FAILOVER_REPORT = `${GENERATED}/provider-failover-report.json`;
// Live cost-metering evidence (V5 Stage 3, D): the budget decision + ledger snapshot for a metered
// provider call. Written ONLY when the mission declares a budget block; pure evidence, never a verdict.
const METERING_REPORT = `${GENERATED}/cost-metering-report.json`;
// Independent ECONOMIC VERIFICATION evidence (V5 economic-core): the economic verdict (VERIFIED/FAILED/
// INCOMPLETE/UNKNOWN) rendered by runtime/core/economic-verification.js over the SAME metering facts +
// the provider's OBSERVED observation. Written ONLY alongside a metered call (budget declared); pure
// evidence, NEVER a verdict that gates release — "pipeline success ≠ economic success" is surfaced, not
// enforced (enforcement would be a separate governance decision).
const ECONOMIC_VERIFICATION_REPORT = `${GENERATED}/economic-verification-report.json`;
const REGISTRY = `${GENERATED}/capability-registry.json`;
const LEDGER = `${GENERATED}/mission-ledger.json`;
const VERIFY = `${GENERATED}/runtime-verify.json`;
// Checkpoint: the resume marker written after every RELEASE so an interrupted autonomy run can be
// resumed EXACTLY where it stopped. The ledger already makes resume correct (a proven mission is
// excluded from re-selection), so this artifact is the explicit, human-readable record of it — the
// last released mission + everything released this session — never a second source of truth.
const CHECKPOINT = `${GENERATED}/autonomy-checkpoint.json`;
const BRAIN = "runtime/brain/MASTER_PLAN.md";
const ROADMAP_MANIFEST = "runtime/governance/ROADMAP.json";
const MSTD_GENERATED = "runtime/generated/mission-artifacts/generated";
const PIPELINE = "runtime/bin/odg-run.js";
const MISSIONS_DIR = "runtime/missions";
// The corrective-mission queue: repair missions the Runtime proposes for itself, awaiting
// authorization. A record here is a NOMINATION, never an authorization to run (see readCorrectiveQueue).
const PENDING_DIR = `${MISSIONS_DIR}/pending`;
const VERIFIER = "runtime/bin/odg-verify.js";
// The SOLE author of the canonical mission verdict (validated/status). The provider path feeds it
// real, materialized plan/patch/execution evidence and lets it re-verify — it never writes the
// verdict itself (design: exactly one component writes validated/status).
const VALIDATION_ENGINE = "runtime/core/validation-engine.js";

// LOCAL_FIRST recovery bound: how many diagnose → reuse-known-patch → re-validate passes the Runtime
// attempts locally before it may conclude, by evidence, that it cannot progress without a provider.
// Small and finite: each pass must apply a NEW in-scope patch or the loop stops (see recoverLocally).
const LOCAL_RECOVERY_MAX_ATTEMPTS = 3;

// Pinned provider defaults (contract §2). ODG owns these; the adapter never lets Claude choose them.
const PROVIDER_MODEL = "claude-opus-4-8";
const PROVIDER_MAX_TURNS = 25;

/** Raw shape of an existing runtime/missions/*.json file (read-only; no new format introduced). */
interface RawMission {
  mission?: string;
  priority?: string;
  mode?: string;
  objectives?: Array<string | { id?: string; goal?: string; done_when?: unknown; proof?: unknown }>;
  definition_of_done?: unknown;
  completion?: unknown;
  authorized_paths?: unknown;
  authorizedPaths?: unknown;
  requires_engineering?: boolean;
  requiresEngineering?: boolean;
  verify?: unknown;
  description?: unknown;
  /** Optional declared budget block (V5 Stage 3, D). Shape validated by budget-contract.js. */
  budget?: unknown;
}

/** A machine-checkable capability proof: a capability bound to the NAME of a registered probe. */
interface VerifyProof {
  capability: string;
  evidence: string;
  required?: boolean;
}

/**
 * Faithful per-objective execution attribution for the PROVIDER route (Tier 2 fix).
 *
 * Builds the `executed[]` entries the Validation Engine consumes from the provider's OWN report of
 * which objectives it addressed (`objectivesAddressed`, derived verbatim from the RESULT SCHEMA the
 * provider returned and carried on the PatchReceipt). An objective the provider reported addressing
 * is `APPLIED`; one it did NOT is the existing no-op status `RECORDED` — explicitly non-successful,
 * which the Validation Engine's A3 `noRecordedNoOp` gate blocks for engineering missions. This never
 * infers execution from a changed file, never interprets `done_when`, and never fabricates APPLIED
 * for an unaddressed objective. A genuinely full provider run (all objectives addressed) ⇒ all APPLIED.
 * Pure function of its inputs (testable in isolation).
 */
export function attributeProviderExecution(
  objectives: Array<{ id: string }>,
  objectivesAddressed: readonly string[],
): Array<{ action: string; objectiveId: string; status: "APPLIED" | "RECORDED" }> {
  const addressed = new Set(objectivesAddressed);
  return objectives.map((o) => ({
    action: o.id,
    objectiveId: o.id,
    status: addressed.has(o.id) ? "APPLIED" : "RECORDED",
  }));
}

/**
 * Build the mission-scoped run-start checkpoint the provider route supplies to the Validation Engine so
 * its EXISTING freshness mechanism (runStartedAtMs, validation-engine.js:137-141) activates on this route
 * — reusing the exact `pipeline-checkpoint.json` {mission, startedAt} shape the Checkpoint Engine already
 * writes on the LOCAL route (NO second timestamp source, NO VE change, NO provider checkpoint redesign).
 *
 * DENY-SAFE: returns null when the mission identity or run start is absent, so a run that cannot be
 * mission-bound writes NO checkpoint and the Validation Engine keeps its content-only fallback rather than
 * trusting an unknown run as fresh. `startedAt` is captured once at the provider run's start (same source
 * as checkpoint-engine.begin), so a prior-run clean-workspace-scanned / external-research-dry-run-planned
 * artifact (mtime < startedAt) is rejected as stale instead of falsely satisfying this mission. (P0-070)
 */
export function providerRunStartCheckpoint(
  missionId: string | null | undefined,
  startedAtIso: string | null | undefined,
): { mission: string; startedAt: string } | null {
  if (typeof missionId !== "string" || !missionId) return null;
  if (typeof startedAtIso !== "string" || !startedAtIso) return null;
  return { mission: missionId, startedAt: startedAtIso };
}

/**
 * Default intent-implied proof resolver: the SINGLE shared vocabulary the Mission Loader and the
 * Contract Factory already use (runtime/core/mission-contract-factory.resolveVerifyProbes). Loaded
 * via require (a .js core module) and best-effort — if unavailable the declared proofs still stand.
 */
function defaultResolveImpliedProofs(entry: unknown): Array<{ capability: string; evidence: string }> {
  try {
    const require = createRequire(import.meta.url);
    const { resolveVerifyProbes } = require("../../runtime/core/mission-contract-factory.js") as {
      resolveVerifyProbes: (e: unknown) => Array<{ capability: string; evidence: string }>;
    };
    const out = resolveVerifyProbes(entry);
    return Array.isArray(out) ? out : [];
  } catch {
    return [];
  }
}

/**
 * Resolve the PROVIDER route's `verify` block exactly as the LOCAL route's Mission Loader does
 * (runtime/core/mission-loader.js:133-178), so a provider-executed mission is held to the SAME
 * independent, machine-checked capability proofs instead of silently dropping them:
 *   (1) the contract's DECLARED proofs (spec.verify), normalized ({capability, evidence}, optional
 *       required:false carried verbatim);
 *   (2) MERGED with the proofs the mission's INTENT implies, via the shared resolveVerifyProbes
 *       resolver (one vocabulary, no second source of truth), de-duplicated by evidence name.
 * The Validation Engine's existing required-proof gate (capability-probes.evaluate) then checks each
 * proof against REAL evidence artifacts and BLOCKS SUCCESS on any missing/failing required proof —
 * independent of the provider's self-reported objectivesAddressed. A mission that declares/implies no
 * proof is unaffected (empty ⇒ no extra gate), preserving backward compatibility. Does NOT interpret
 * done_when and does NOT treat a changed file as proof. Pure given its injected resolver.
 */
export function resolveProviderPlanVerify(
  spec: RawMission | null,
  ctx: { id: string; title?: unknown; goal?: string; description?: unknown },
  resolveImplied: (entry: unknown) => Array<{ capability: string; evidence: string }> = defaultResolveImpliedProofs,
): VerifyProof[] {
  const rawDeclared = Array.isArray(spec?.verify) ? (spec!.verify as unknown[]) : [];
  const declared: VerifyProof[] = rawDeclared
    .filter((v): v is { capability?: unknown; evidence: string; required?: unknown } =>
      !!v && typeof v === "object" && typeof (v as { evidence?: unknown }).evidence === "string")
    .map((v) => {
      const entry: VerifyProof = { capability: String(v.capability || v.evidence), evidence: v.evidence };
      if (v.required === false) entry.required = false;
      return entry;
    });
  const seen = new Set(declared.map((v) => v.evidence));
  for (const p of resolveImplied({ id: ctx.id, title: ctx.title, goal: ctx.goal, description: ctx.description })) {
    if (p && typeof p.evidence === "string" && !seen.has(p.evidence)) {
      seen.add(p.evidence);
      declared.push({ capability: p.capability, evidence: p.evidence });
    }
  }
  return declared;
}

export class AutonomyRuntimeAdapter implements AutonomyRuntimePorts {
  private readonly documentation = new DocumentationEngine();
  // Receives the provider's produced patch and decides whether it is fit for validation (OBJ-003).
  private readonly patchEngine = new ProviderPatchEngine();
  // The receipt of the last provider patch received this session, per mission (evidence / audit).
  private readonly patchReceipts = new Map<string, PatchReceipt>();
  // Missions released this session, so readPlanState excludes them and the loop advances (design §3).
  private readonly archivedThisSession = new Set<string>();
  private lastReleaseRef: string | null = null;
  // Lazily constructed so local-only runs never even instantiate a provider (cost minimization).
  private provider: EngineeringProviderPort | null = null;
  // One provider invocation per mission per session: a repeat reuses the recorded outcome, and an
  // identical re-run in a later session is served by the provider's on-disk cache (no live call).
  private readonly providerRuns = new Map<string, ProviderOutcome>();

  /**
   * @param cwd      mission workspace (defaults to process.cwd()).
   * @param provider optional pre-built engineering provider. Production leaves it undefined and the
   *                 real Claude adapter is created lazily on first use; tests inject a fake so the
   *                 full route can be exercised without a live (paid) provider call.
   */
  constructor(
    private readonly cwd: string = process.cwd(),
    provider?: EngineeringProviderPort,
  ) {
    this.provider = provider ?? null;
  }

  /** Stage 1 — deterministic selection inputs from existing artifacts (design §2 Stage 1). */
  readPlanState(): AutonomyPlanState {
    // The autonomous work-list is the SAME coherent forward gap the Runtime dashboard computes
    // (runtime/core/runtime-model.js): every mission CONTRACT on disk that is executable (declares
    // objectives) and is not yet PROVEN in the ledger, ordered roadmap-first then alphabetical.
    //
    // Root cause this replaces: the work-list was sourced from the ROADMAP.json manifest ALONE. Once
    // the handful of seed roadmap missions are proven, the manifest yields an EMPTY plan and the
    // Autonomy Cycle terminates PLAN_COMPLETE with Cycles=0 — even though executable missions (e.g.
    // AUTONOMOUS_EXECUTION_WITH_FALLBACK) still sit unproven on disk. They were never candidates
    // because they are absent from the manifest. Reusing the dashboard's model makes `odg autonomy`
    // and the dashboard's "Next Mission" one source of truth. The frozen selectNextMission FUNCTION
    // is untouched — only its INPUT work-list is corrected.
    // MISSION CONTRACT FACTORY: before computing the forward work-list, materialise any roadmap
    // mission whose contract file is missing. A roadmap entry with no contract on disk never appears
    // in the runtime-model queue (it lists only executable contracts), so it would be silently
    // skipped and the campaign could never reach it "from the roadmap alone". The factory generates a
    // complete, Mission-Loader-conformant contract for each gap; it is idempotent (an already-
    // executable contract is left untouched), so re-running it every cycle never churns the tree.
    this.materialiseRoadmapContracts();

    let masterPlanObjectives: string[];
    let missingCapabilities: string[];
    const workList = this.readRuntimeModelQueue();
    if (workList !== null) {
      masterPlanObjectives = workList;
      missingCapabilities = workList;
    } else {
      // Fallback (only when the model cannot be loaded, e.g. a stripped checkout): the roadmap
      // manifest, else the legacy master plan + capability registry. Preserves prior behaviour.
      const manifest = this.readJson<{ missions?: Array<{ id?: string }> }>(ROADMAP_MANIFEST);
      const manifestIds = Array.isArray(manifest?.missions)
        ? manifest!.missions.map((m) => m?.id).filter((m): m is string => typeof m === "string")
        : [];
      if (manifestIds.length > 0) {
        masterPlanObjectives = manifestIds;
        missingCapabilities = manifestIds;
      } else {
        masterPlanObjectives = this.readMasterPlanObjectives();
        const registry = this.readJson<{ missingCapabilities?: string[] }>(REGISTRY);
        missingCapabilities = Array.isArray(registry?.missingCapabilities)
          ? registry!.missingCapabilities
          : [];
      }
    }

    // A mission counts as completed ONLY when the ledger holds a PROVEN entry for it (proven === true,
    // which mission-ledger.js sets exclusively for validation-proven executions). The ledger is an
    // immutable history of proof EVENTS, not a list of closed missions: a mission merely *recorded*
    // once — e.g. an unproven CREATED run — must not be treated as done, or it could never be
    // re-executed. Filtering on `proven` is what makes selectNextMission the "first roadmap mission
    // not yet PROVEN in the ledger" the comment above already promises. Read-only: the ledger's
    // immutability is untouched (mission-ledger.js is unchanged), and the filter is a pure function of
    // its content, so determinism holds.
    const ledger = this.readJson<{ entries?: Array<{ mission?: string; proven?: boolean }> }>(LEDGER);
    const ledgerMissions = Array.isArray(ledger?.entries)
      ? ledger!.entries
          .filter((e) => e?.proven === true)
          .map((e) => e?.mission)
          .filter((m): m is string => typeof m === "string")
      : [];

    // Fold the AUTHORIZED corrective-mission queue into the work-list AHEAD of roadmap progress:
    // a self-proposed repair, once authorized, is executed before the Runtime advances the roadmap.
    // The frozen selectNextMission is untouched — it still returns "the first work-list entry that is
    // missing and not completed"; we only enrich its INPUT with the corrective ids (deduped, order
    // preserved). Unauthorized nominations are NOT added here, so they can never silently run — they
    // stay a human/RootCauseEngine concern (never bypass HUMAN_VALIDATION). Prepending to BOTH lists
    // keeps a corrective id both a candidate (masterPlanObjectives) and "missing" (missingCapabilities)
    // so the selector nominates it exactly as it does a roadmap mission.
    const corrective = this.readCorrectiveQueue().authorized;

    const completedSet = new Set([...ledgerMissions, ...this.archivedThisSession]);
    // ROOT CAUSE (odg autonomy terminated PLAN_COMPLETE / Cycles=0 while `odg delegate` reached
    // RELEASED): an AUTHORIZED corrective mission is an EXPLICIT, governance-approved instruction to
    // run NOW — precisely what `odg delegate <NAME>` honours unconditionally. A prior proven ledger
    // entry for the SAME name must therefore NOT mask it: otherwise the frozen selectNextMission drops
    // it (its `missing ∧ !completed` test fails because the name is in completedMissions), so the loop
    // selects nothing and halts with zero cycles even though authorized work is queued. The ONLY thing
    // that marks a corrective mission done for selection is a release THIS session (archivedThisSession)
    // — which is what terminates the loop after it runs (and the core's processed/STALLED guard still
    // backs that up), so this cannot re-select forever. Governance retires the standing authorization
    // by removing its pending record. The frozen selectNextMission FUNCTION is untouched; only its
    // `completedMissions` INPUT is corrected.
    for (const id of corrective) {
      if (!this.archivedThisSession.has(id)) completedSet.delete(id);
    }
    const completedMissions = Array.from(completedSet);

    if (corrective.length > 0) {
      masterPlanObjectives = Array.from(new Set([...corrective, ...masterPlanObjectives]));
      missingCapabilities = Array.from(new Set([...corrective, ...missingCapabilities]));
    }

    return { masterPlanObjectives, missingCapabilities, completedMissions };
  }

  /**
   * Enumerate the corrective-mission queue (runtime/missions/pending/*.json) and split it into
   * missions AUTHORIZED to run autonomously vs. DEFERRED (awaiting human authoring/authorization).
   *
   * A pending record is only a NOMINATION. It becomes an authorized, executable corrective mission —
   * and is folded into the autonomous work-list by readPlanState — ONLY when all three hold, so an
   * unauthored repair marker can never silently run (never bypass HUMAN_VALIDATION / never disable a
   * guard):
   *   1. the record explicitly declares `status === "AUTHORIZED"` (the human/governance gate);
   *   2. a real Mission Contract exists at runtime/missions/<mission>.json;
   *   3. that contract declares at least one objective (the SAME guard the Mission Loader enforces),
   *      so an authorized-but-empty contract is still refused rather than run vacuously.
   * Every other record is DEFERRED with a concrete reason — a real blocker for a human / the
   * RootCauseEngine, never executed here. Deterministic: filenames are read in sorted order and the
   * result is a pure function of the queue's contents (no timestamp, no randomness).
   */
  readCorrectiveQueue(): {
    authorized: string[];
    deferred: Array<{ mission: string; reason: string }>;
  } {
    const authorized: string[] = [];
    const deferred: Array<{ mission: string; reason: string }> = [];
    let files: string[];
    try {
      files = fs
        .readdirSync(this.resolve(PENDING_DIR))
        .filter((f) => f.endsWith(".json"))
        .sort();
    } catch {
      return { authorized, deferred };
    }
    for (const file of files) {
      const record = this.readJson<{ mission?: string; status?: string }>(`${PENDING_DIR}/${file}`);
      const mission = record?.mission ?? file.replace(/\.json$/, "");
      if (record?.status !== "AUTHORIZED") {
        deferred.push({
          mission,
          reason: `not authorized (status=${record?.status ?? "MISSING"}); a human/governance decision is required before it can run`,
        });
        continue;
      }
      let spec = this.readMissionJson(mission);
      if (!spec) {
        // CONTRACT ON DEMAND: an AUTHORIZED corrective mission whose contract is not yet written is no
        // longer permanently deferred — synthesize it (when governance authorizes on-demand) so the
        // authorized repair can run. Human authorization is still required (status must be AUTHORIZED);
        // only the mechanical authoring is automated. A disabled policy keeps the original deferral.
        this.materialiseOnDemand(mission);
        spec = this.readMissionJson(mission);
      }
      if (!spec) {
        deferred.push({
          mission,
          reason: `authorized but has no Mission Contract at ${MISSIONS_DIR}/${mission}.json — author the contract (or enable Contract On Demand) before it can execute`,
        });
        continue;
      }
      if (this.providerObjectives(mission, spec).length === 0) {
        deferred.push({ mission, reason: `contract declares no objectives (Mission Loader guard)` });
        continue;
      }
      authorized.push(mission);
    }
    return { authorized, deferred };
  }

  /**
   * Stage 2 — load the REAL Mission Contract from runtime/missions/<MISSION>.json.
   *
   * The generic synthesized contract is removed (the "generic replay" blockage): a mission with no
   * real definition on disk THROWS here, which the pure core turns into a CONTRACT_INVALID halt
   * (design §3, R-Human) — a real blocker for a human to author the mission, never a fabricated one.
   * Objectives (both the string and the {id,goal,done_when} shapes) come from the mission itself, so
   * different missions produce different contracts. Missing definition_of_done / completion metadata
   * falls back to sensible defaults; the mission-specific OBJECTIVES are always real.
   */
  generateContract(mission: string): MissionContract {
    // CONTRACT ON DEMAND: an unknown mission is synthesized (when governance authorizes it) rather
    // than treated as a hard blocker, so the provider/autonomy path can continue. A disabled policy
    // or a failed generation leaves spec null and the original CONTRACT_INVALID blocker stands.
    let spec = this.readMissionJson(mission);
    if (!spec) {
      this.materialiseOnDemand(mission);
      spec = this.readMissionJson(mission);
    }
    if (!spec) {
      throw new Error(
        `No mission contract at ${MISSIONS_DIR}/${mission}.json — author the mission definition (or enable Contract On Demand) before it can execute.`,
      );
    }
    const objectives = this.providerObjectives(mission, spec);
    if (objectives.length === 0) {
      throw new Error(`Mission contract "${mission}" declares no objectives.`);
    }
    return {
      mission: spec.mission ?? mission,
      priority: typeof spec.priority === "string" ? spec.priority : "NORMAL",
      mode: typeof spec.mode === "string" ? spec.mode : "SEQUENTIAL",
      objectives,
      definition_of_done: this.strings(spec.definition_of_done) ?? [
        "Objective completed.",
        "Validation successful.",
        "Mission ledger updated.",
      ],
      completion: this.strings(spec.completion) ?? ["Release Manager decision is RELEASE."],
    };
  }

  /**
   * Stage 3 — execute the mission (design §2 Stage 3 / Provider Contract §1).
   *
   * LOCAL_FIRST. ODG ALWAYS runs the local deterministic pipeline first (build → tests → patch →
   * validation). The engineering provider is OPTIONAL: it is reached only when the LOCAL run PROVES
   * it cannot progress AND the mission genuinely needs engineering code work
   * (`missionRequiresProvider()`). It is NEVER reached when local already succeeded — so a missing or
   * unavailable provider can never block a mission that can continue locally. When the provider IS
   * used, control returns immediately to the LOCAL flow: its outcome feeds the SAME
   * gatherEvidence() → Release Manager path, then the next mission runs locally again. The existing
   * provider failover (Claude → OpenAI, then runtime-failover halt) is preserved, just moved behind
   * the local attempt.
   */
  runPipeline(mission: string): PipelineOutcome {
    const spec = this.readMissionJson(mission);

    // (1) LOCAL first — the deterministic pipeline (build → tests → patch → validation).
    const local = this.runLocalPipeline(mission);
    if (local.pipelineOk) return local;

    // (2) LOCAL RECOVERY — the mandatory step BEFORE any provider. Diagnose the root cause locally,
    //     reuse the known in-scope patch, regenerate the local evidence surface and re-validate
    //     (build/tests). The provider is NOT the first fallback: it is reached ONLY once local
    //     recovery has PROVEN, by evidence, that the Runtime cannot progress locally.
    const recovery = this.recoverLocally(mission, local);
    if (recovery.outcome.pipelineOk) return recovery.outcome;

    // (3) PROVIDER — last resort only. Reached solely when local recovery is proven exhausted AND the
    //     mission genuinely needs engineering code work. The existing Claude → OpenAI failover is
    //     preserved unchanged; control returns immediately to the LOCAL flow afterwards (the provider
    //     outcome feeds the SAME gatherEvidence() → Release Manager path, then the next mission runs
    //     locally again). A missing/unavailable provider can never block a mission recoverable locally.
    if (recovery.exhausted && missionRequiresProvider(this.toRoutable(spec))) {
      return this.runViaProvider(mission, spec);
    }
    return recovery.outcome;
  }

  /**
   * LOCAL RECOVERY (the decision point the mission targets). Between a failed local pipeline and any
   * provider, the Runtime exhausts what it can do ITSELF, grounded in evidence:
   *
   *   Root Cause locale  → RootCauseEngine.diagnose() reads the CURRENT evidence (runtime-verify.json,
   *                        mission-report.json, git) and names the blocking Release gate. Mutates nothing.
   *   Preuves + patchs   → the engine IS the Runtime's known-patch knowledge base: each gate maps to a
   *     connus              KNOWN minimal patch. A patch confined to the regenerable runtime/generated/
   *                        surface is one the Runtime may author WITHOUT a provider; an empty patch
   *                        (build/typescript) or one touching tracked source needs a provider to author
   *                        the code fix — that absence of an in-scope local patch IS the evidence the
   *                        Runtime cannot progress locally.
   *   Patch LOCAL +      → apply the in-scope patch by regenerating the evidence surface (the existing
   *     Validation/Build/   verifier: npm build + tsc + git) and re-running the deterministic pipeline,
   *     Tests               then re-diagnose. A pass that yields no NEW in-scope patch stops the loop.
   *
   * Returns the last local outcome and whether local recovery is exhausted (the caller only escalates
   * to the provider when it is). Bounded by LOCAL_RECOVERY_MAX_ATTEMPTS; never throws.
   */
  private recoverLocally(
    mission: string,
    initial: PipelineOutcome,
  ): { outcome: PipelineOutcome; exhausted: boolean } {
    const engine = new RootCauseEngine({ cwd: this.cwd, generatedDir: GENERATED });
    const tried = new Set<string>();
    let last = initial;

    for (let attempt = 0; attempt < LOCAL_RECOVERY_MAX_ATTEMPTS; attempt++) {
      const report = engine.diagnose(mission);
      const patch = report.minimalPatch;

      // No diagnosable blocker, or the known patch is not confined to the Runtime's safe local
      // surface: there is no automatic LOCAL action left — proven local exhaustion.
      if (report.status !== "DIAGNOSED" || !patch || !this.isLocallyApplicable(patch)) {
        return { outcome: last, exhausted: true };
      }
      // No NEW in-scope patch this run (the same known patch was already applied) — stop, don't spin.
      const sig = JSON.stringify([patch.filesToModify, patch.steps]);
      if (tried.has(sig)) return { outcome: last, exhausted: true };
      tried.add(sig);

      // Apply the in-scope patch locally: regenerate the evidence surface, then re-run Validation →
      // Build → Tests via the deterministic pipeline. If it now progresses, recovery succeeded LOCALLY.
      this.refreshVerifyEvidence(mission);
      last = this.runLocalPipeline(mission);
      if (last.pipelineOk) return { outcome: last, exhausted: false };
    }
    return { outcome: last, exhausted: true };
  }

  /**
   * A known minimal patch is applicable LOCALLY iff every target is confined to the regenerable
   * runtime/generated/ tree — the only surface the Runtime may author without a provider. An empty
   * target set (a build/typescript fix that must edit source) or any tracked-source target is left to
   * a provider, which holds the authorization to author that code.
   */
  private isLocallyApplicable(patch: MinimalPatch): boolean {
    const targets = patch.filesToModify;
    const prefix = GENERATED.replace(/\/+$/, "") + "/";
    return targets.length > 0 && targets.every((f) => f === GENERATED || f.startsWith(prefix));
  }

  /**
   * The LOCAL execute path — the EXISTING deterministic pipeline (odg-run.js). Behaviour is
   * byte-for-byte what runPipeline did before; it is extracted only so runPipeline can try it FIRST
   * (LOCAL_FIRST) and use its failure as the single proof that the Runtime cannot progress locally.
   */
  private runLocalPipeline(mission: string): PipelineOutcome {
    const r = spawnSync("node", [PIPELINE, mission], {
      cwd: this.cwd,
      stdio: "inherit",
    });
    const pipelineOk = r.status === 0;
    if (!pipelineOk) {
      // Never surface a bare boolean: report the launcher, its exit code and the failing signal.
      // stdout/stderr were streamed live to the console (stdio:"inherit"), so they are not captured
      // here — we honestly omit them rather than invent empty strings.
      return {
        pipelineOk: false,
        diagnostics: {
          stage: "local-pipeline",
          reason: r.signal ? "KILLED_BY_SIGNAL" : "NON_ZERO_EXIT",
          message: r.error
            ? `Failed to launch ${PIPELINE}: ${r.error.message}`
            : `${PIPELINE} exited with code ${r.status ?? "null"}${r.signal ? ` (signal ${r.signal})` : ""}. See the streamed pipeline output above.`,
          provider: PIPELINE,
          exitCode: r.status,
          ...(r.error ? { exception: r.error.message } : {}),
        },
      };
    }
    // A clean LOCAL run refreshes the same build/typescript/gitClean evidence surface the provider
    // path produces (via the EXISTING verifier), so the UNCHANGED gatherEvidence() → Release Manager
    // decision is made on CURRENT evidence — not a stale runtime-verify.json from an earlier run.
    // The pipeline itself has no verify stage, so without this the local autonomy path would gate on
    // whatever odg-verify last wrote (or nothing, on a fresh clone).
    this.refreshVerifyEvidence(mission);
    return { pipelineOk: true };
  }

  // --- provider execute path (Provider Contract §1/§2) --------------------

  /** Route the execute stage to the injected engineering provider, exactly once per mission. */
  private runViaProvider(mission: string, spec: RawMission | null): PipelineOutcome {
    // Capture this provider run's start ONCE, before the provider executes, so any artifact genuinely
    // produced during the run is fresh (mtime >= start) while prior-run leftovers are stale. Same source
    // as checkpoint-engine.begin (wall-clock at run start); supplied to the Validation Engine below. (P0-070)
    const runStartedAt = new Date().toISOString();
    let outcome = this.providerRuns.get(mission);
    if (!outcome) {
      // The provider is the ONLY place a provider process is spawned (contract §1); its own
      // content-addressed cache short-circuits an identical re-request without a live call. When the
      // mission declares a budget, the provider call is metered live (D) around the SAME invocation.
      outcome = this.executeMetered(mission, spec);
      this.providerRuns.set(mission, outcome);
    }
    // OBJ-003: the Patch Engine RECEIVES the provider's result (the working-tree patch) and decides,
    // from observed evidence, whether it is fit for validation. Its receipt — never the provider's
    // own prose — is what triggers the Validation Engine (odg-verify.js) to refresh the same
    // build/typescript/gitClean surface odg-run.js would leave, so the UNCHANGED gatherEvidence() →
    // Release Manager path decides completion (contract §1 steps 6-7). `readyForValidation` holds
    // exactly when the run was clean and in-scope, so the evidence refresh happens on precisely the
    // runs it did before — the Patch Engine makes the seam explicit without changing behaviour.
    const receipt = this.patchEngine.receive(mission, outcome);
    this.patchReceipts.set(mission, receipt);
    if (receipt.readyForValidation) {
      this.refreshVerifyEvidence(mission);
      // The provider path bypasses odg-run.js, so the pipeline stages that write the canonical
      // mission-scoped runtime/generated/mission-report.json never run — leaving documentableArtifacts
      // with nothing and buildDocumentationProof returning null (Release gate documentationProofPresent
      // = false). Materialize the SAME plan/patch/execution evidence the pipeline's earlier stages
      // produce, from the provider's REAL receipt (mission id + ground-truth changedFiles), then let the
      // Validation Engine — the SOLE author of validated/status — re-verify and write the report. The
      // verdict is NOT asserted here: the Validation Engine still computes it from real evidence
      // (working-tree changes in scope + build/tsc gates), so an unproven mission still yields BLOCKED.
      this.writeProviderValidationEvidence(mission, spec, receipt, runStartedAt);
      // An engineering mission's deliverable IS the in-scope working-tree change the provider produced.
      // That change legitimately makes gitClean FALSE — yet the frozen Release Manager gates RELEASE on
      // gitClean, so without this an engineering mission could NEVER release (the Validation Engine
      // requires an in-scope change; the Release Manager requires none). Now that the Validation Engine
      // has PROVEN the deliverable (SUCCESS), commit exactly the authorized scope: the commit is the
      // release's reproducible source and rollback point, and gitClean becomes legitimately true. Only
      // re-refresh the verifier when a commit actually happened, so cache-hit / no-change / local /
      // non-engineering runs (and the fake-provider tests) are byte-for-byte unaffected.
      if (this.commitAuthorizedDeliverable(mission, spec)) {
        this.refreshVerifyEvidence(mission);
      }
    }
    return toPipelineOutcome(outcome);
  }

  /**
   * Provider path only: reconstruct the plan/patch/execution artifacts the local pipeline's earlier
   * stages write, from the provider's real receipt, then run the Validation Engine so it authors the
   * canonical mission-scoped runtime/generated/mission-report.json. Mission-plan/patch-plan/execution
   * mirror the shapes runtime/core/validation-engine.js consumes; the engineering gate it applies is
   * checked against the REAL working tree, and build/tsc come from the just-refreshed verifier — no
   * verdict is fabricated here.
   */
  private writeProviderValidationEvidence(
    mission: string,
    spec: RawMission | null,
    receipt: PatchReceipt,
    runStartedAt: string,
  ): void {
    // The Validation Engine is the sole author of the verdict. If it is absent (e.g. a sandboxed
    // harness that supplies its own canonical mission-report.json), leave the existing report
    // untouched rather than materializing half of the pipeline's inputs. Mirrors refreshVerifyEvidence.
    if (!fs.existsSync(this.resolve(VALIDATION_ENGINE))) return;

    const objectives = this.providerObjectives(mission, spec);
    const missionId = spec?.mission ?? mission;

    // Carry the mission's declared + intent-implied capability proofs into the plan so the Validation
    // Engine independently verifies them — the LOCAL route's Mission Loader already does this; the
    // provider route used to drop them, letting a provider-executed mission reach SUCCESS without any
    // of its declared proofs being checked. Empty ⇒ no extra gate (unchanged for proof-less missions).
    const verify = resolveProviderPlanVerify(spec, {
      id: missionId,
      title: spec?.mission,
      goal: objectives.map((o) => o.goal).filter(Boolean).join(" "),
      description: spec?.description,
    });
    const plan = {
      mission: missionId,
      mode: typeof spec?.mode === "string" ? spec.mode : "IMPLEMENT",
      requiresEngineering: spec?.requiresEngineering === true,
      authorizedPaths: this.authorizedPaths(spec),
      // Carry each objective's OPT-IN proof binding (ObjectiveSpec.proof) into the plan so the
      // Validation Engine's objective-proof gate independently verifies it. Sourced from the contract
      // objective at the same index (providerObjectives is 1:1 with spec.objectives); absent ⇒ omitted
      // (legacy objectives unaffected). The provider's objectivesAddressed/APPLIED never substitute.
      objectives: objectives.map((o, i) => {
        const raw = Array.isArray(spec?.objectives) ? spec!.objectives[i] : undefined;
        const proof =
          raw && typeof raw === "object" && typeof raw.proof === "string" && raw.proof ? raw.proof : undefined;
        return proof
          ? { id: o.id, goal: o.goal, done_when: o.done_when, proof }
          : { id: o.id, goal: o.goal, done_when: o.done_when };
      }),
      definitionOfDone: this.strings(spec?.definition_of_done) ?? [],
      ...(verify.length ? { verify } : {}),
    };
    const patchPlan = {
      mission: missionId,
      patches: objectives.map((o) => ({ objective: o.id, files: receipt.changedFiles })),
    };
    // ROOT CAUSE (Tier 2 false execution attribution): previously EVERY objective was fabricated as
    // `status:"APPLIED"` regardless of what the provider did, so a provider that addressed K of N
    // objectives still presented N APPLIED entries and could reach SUCCESS. Attribute execution from
    // the provider's OWN per-objective report (receipt.objectivesAddressed, derived verbatim from the
    // RESULT SCHEMA `objectivesAddressed` the provider returned) — never from the mere fact that a file
    // changed. An objective the provider did NOT report addressing is recorded as the existing no-op
    // status "RECORDED" (NOT APPLIED): it is explicitly non-successful and, for an engineering mission,
    // the Validation Engine's A3 `noRecordedNoOp` gate BLOCKS it. No gate is made stricter, no evidence
    // invented, no done_when interpreted — a genuinely full provider execution (all objectives
    // addressed) still yields all-APPLIED and passes exactly as before.
    const execution = {
      mission: missionId,
      executed: attributeProviderExecution(objectives, receipt.objectivesAddressed),
    };

    this.writeJson(MISSION_PLAN, plan);
    this.writeJson(PATCH_PLAN, patchPlan);
    this.writeJson(PATCH_EXECUTION, execution);

    // Supply the mission-scoped run start the Validation Engine's EXISTING freshness gate consumes
    // (validation-engine.js:137-141): without it the provider route left runStartedAtMs undefined and the
    // freshness-bearing probes fell back to content-only, letting a prior-run artifact falsely satisfy this
    // mission (P0-070 / V11). Deny-safe: no checkpoint when the mission identity is absent (VE then keeps
    // content-only — the pre-existing behaviour, never a fabricated-fresh run). git-ignored; LOCAL/MSE write
    // their own via checkpoint-engine, so this is additive and does not touch the LOCAL route.
    const runStart = providerRunStartCheckpoint(missionId, runStartedAt);
    if (runStart) this.writeJson(PIPELINE_CHECKPOINT, runStart);

    // Sole author of the verdict — writes runtime/generated/mission-report.json from real evidence.
    // It exits non-zero on a BLOCKED verdict but still writes the (unvalidated) report first, so this
    // is best-effort: a genuinely unproven mission leaves a non-SUCCESS report and never releases.
    spawnSync("node", [VALIDATION_ENGINE, mission], { cwd: this.cwd, stdio: "inherit" });
  }

  private writeJson(relPath: string, value: unknown): void {
    const abs = this.resolve(relPath);
    fs.mkdirSync(abs.slice(0, abs.lastIndexOf("/")), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify(value, null, 2));
  }

  /**
   * Commit the mission's authorized in-scope deliverable once the Validation Engine has PROVEN it
   * (mission-report status SUCCESS + validated true). This resolves the structural tension between the
   * Validation Engine — which REQUIRES an in-scope working-tree change to call an engineering mission
   * done — and the frozen Release Manager — which REQUIRES gitClean to RELEASE. The proven change
   * becomes a commit: the release's reproducible source and its rollback point, after which gitClean is
   * legitimately true. Tightly scoped and best-effort: only paths under authorized_paths are staged; a
   * run with nothing to commit in scope (provider cache hit, no change) or no usable git repo is a
   * no-op. Returns true IFF a commit was created (the sole trigger for a gitClean re-check).
   */
  private commitAuthorizedDeliverable(mission: string, spec: RawMission | null): boolean {
    const authorized = this.authorizedPaths(spec);
    if (authorized.length === 0) return false;
    const report = this.readJson<{ status?: string; validated?: boolean }>(MISSION_REPORT);
    if (report?.validated !== true || report?.status !== "SUCCESS") return false;
    // LIVE COMMIT AUTHORIZATION (opt-in). Before committing a validated deliverable, consult the EXISTING
    // §7 commit guards via acceptance-facts.commitGateDecision: a CONTROLLED (control.required) mission must
    // pass mechanical acceptance (ACCEPT), and an ECONOMICALLY-ENFORCED (control.economic) mission must carry
    // a VERIFIED economic verdict. A mission that opts into neither is a NO-OP ⇒ allowed, so legacy behaviour
    // is byte-for-byte unchanged. A blocked opted-in mission is NOT committed (no partial mutation) — gitClean
    // stays false so the frozen Release Manager returns NO_RELEASE, exactly as a failed commit would. Reuses
    // the already-proven guards; adds no new policy/verdict/source of truth. Best-effort: if the gate module
    // is absent (stripped checkout / sandbox) this degrades to the prior behaviour, and the authoritative
    // release gate (mission-ledger.recordMission) still enforces the same guards.
    const gate = this.loadCommitGate();
    if (gate) {
      const decision = gate.commitGateDecision(mission);
      if (decision && decision.allowed !== true) {
        const why = Array.isArray(decision.reasons) && decision.reasons.length ? decision.reasons.join("; ") : "commit gate refused";
        // eslint-disable-next-line no-console
        console.warn(`[AutonomyRuntimeAdapter] Not committing "${mission}": ${why}.`);
        return false;
      }
    }
    // Reduce globbed authorized paths (e.g. "src/app/x/**") to committable path prefixes.
    const prefixes = authorized
      .map((p) => p.replace(/[*].*$/, "").replace(/\/+$/, ""))
      .filter((p) => p.length > 0);
    if (prefixes.length === 0) return false;
    try {
      const porcelain = execFileSync("git", ["status", "--porcelain", "--", ...prefixes], {
        cwd: this.cwd,
        encoding: "utf8",
      }).trim();
      if (porcelain.length === 0) return false; // nothing changed in scope — pure no-op
      execFileSync("git", ["add", "--", ...prefixes], { cwd: this.cwd, stdio: "ignore" });
      execFileSync(
        "git",
        [
          "-c",
          "commit.gpgsign=false",
          "commit",
          "-m",
          `ODG mission ${mission}: release authorized deliverable`,
        ],
        { cwd: this.cwd, stdio: "ignore" },
      );
      return true;
    } catch {
      // A commit failure leaves gitClean false → the Release Manager returns NO_RELEASE (safe).
      return false;
    }
  }

  /**
   * Provider selection WITH failover (mission PROVIDER_FAILOVER_TO_OPENAI). The Runtime — not the
   * provider — owns the decision of which engineering provider executes this mission:
   *   - An injected provider (tests / an explicit override) bypasses selection and runs directly, so
   *     the deterministic test seam is untouched.
   *   - Otherwise the default chain is resolved: Claude primary → OpenAI failover (objective 1). When
   *     a provider is AVAILABLE the engineering mission CONTINUES on it (objective 2); the OpenAI
   *     adapter is only ever constructed and spawned when Claude is unavailable and OpenAI is usable.
   *   - When NO provider can continue the Runtime STOPS (objective 7) with a BLOCKED outcome naming
   *     the exact blocking component, missing configuration and single next action (objectives 3-6).
   * The failover report is persisted as evidence on every provider run so the selection is auditable
   * even on the happy path (where OpenAI is never invoked but its readiness is still reported).
   */
  /**
   * LIVE COST METERING (V5 Stage 3, D). Branch the OBSERVED provider usage (E) onto the existing
   * cost-accounting lifecycle, driven by the REAL provider invocation, WITHOUT creating a second budget
   * system. Metering engages ONLY when the mission declares a `budget` block:
   *   - No budget declared ⇒ this is a pure pass-through to executeWithFailover (byte-for-byte the prior
   *     behaviour — the whole existing suite and every current mission are unaffected, since none declare
   *     a budget).
   *   - Budget declared ⇒ runtime/core/live-cost-metering.js verifies it, RESERVES the declared bucket
   *     ceiling (admission), runs the provider via the injected `execute`, reads the OBSERVED usage, and
   *     SPENDS exactly that usage (or refuses on malformed/exhausted/mismatch — no fictive spend). The
   *     provider's own outcome is returned unchanged; a refusal BEFORE any call becomes a BLOCKED outcome
   *     so the frozen Release Manager halts. The ledger snapshot is persisted as gitignored evidence only.
   * Best-effort: if the metering module is absent (e.g. a stripped checkout) the call degrades to the
   * unmetered path, so metering can never block a mission the Runtime could otherwise run.
   */
  private executeMetered(mission: string, spec: RawMission | null): ProviderOutcome {
    if (!spec || spec.budget === undefined || spec.budget === null) {
      return this.executeWithFailover(mission, spec);
    }
    const meter = this.loadMetering();
    if (!meter) return this.executeWithFailover(mission, spec);

    let captured: ProviderOutcome | null = null;
    const result = meter.meterProviderCall({
      spec,
      bucket: "provider",
      allocationId: mission,
      execute: () => {
        captured = this.executeWithFailover(mission, spec);
        return captured;
      },
    });
    this.persistMeteringReport(mission, result);
    // Surface the INDEPENDENT economic verdict over the same facts as pure evidence (never a gate). The
    // observation is read from the provider's real outcome when it ran; a pre-call refusal has none. The
    // typed local re-widens `captured` (assigned only inside the closure, so flow-narrowed to never).
    const providerOutcome = captured as ProviderOutcome | null;
    this.persistEconomicVerification(mission, result, providerOutcome ? providerOutcome.observation : null);
    // The provider ran ⇒ return its real outcome (carrying E's observation). A refusal before any call
    // (malformed budget / zero or exhausted ceiling) ⇒ a BLOCKED outcome so the Release Manager halts.
    if (captured) return captured;
    return this.budgetRefusalOutcome(mission, spec, result);
  }

  /** Load the pure live-cost-metering engine (CJS). Best-effort — null when unavailable. */
  private loadMetering(): {
    meterProviderCall: (opts: {
      spec: unknown;
      bucket?: string;
      allocationId?: string;
      execute: () => ProviderOutcome;
    }) => { decision: string; outcome: ProviderOutcome | null; errors?: string[] };
  } | null {
    try {
      return requireCjs(`${this.cwd}/runtime/core/live-cost-metering.js`) as ReturnType<
        AutonomyRuntimeAdapter["loadMetering"]
      >;
    } catch {
      return null;
    }
  }

  /** Load the read-only commit-authorization gate (CJS). Best-effort — null when unavailable. */
  private loadCommitGate(): {
    commitGateDecision: (mission: string) => { allowed: boolean; reasons: readonly string[] };
  } | null {
    try {
      return requireCjs(`${this.cwd}/runtime/core/acceptance-facts.js`) as ReturnType<
        AutonomyRuntimeAdapter["loadCommitGate"]
      >;
    } catch {
      return null;
    }
  }

  /** Persist the metering decision + ledger snapshot as gitignored evidence (never a verdict). */
  private persistMeteringReport(mission: string, result: unknown): void {
    try {
      this.writeJson(METERING_REPORT, { mission, ...(result as Record<string, unknown>) });
    } catch {
      /* evidence capture is best-effort — never abort a mission over it */
    }
  }

  /** Load the pure economic-verification engine (CJS). Best-effort — null when unavailable. */
  private loadEconomicVerification(): {
    verifyEconomics: (facts: unknown) => { verdict: string; violations: readonly string[] };
  } | null {
    try {
      return requireCjs(`${this.cwd}/runtime/core/economic-verification.js`) as ReturnType<
        AutonomyRuntimeAdapter["loadEconomicVerification"]
      >;
    } catch {
      return null;
    }
  }

  /**
   * Persist the INDEPENDENT economic verdict as gitignored evidence (never a verdict that gates release).
   * Composes the already-captured metering facts + the provider's OBSERVED observation through the pure
   * economic-verification engine. Best-effort and side-effect-free with respect to the mission outcome:
   * the engine performs no I/O, invents no value, and this call can neither change nor block the release —
   * it only makes "pipeline success ≠ economic success" observable. Degrades silently if the engine is
   * absent (stripped checkout), exactly like the metering path.
   */
  private persistEconomicVerification(
    mission: string,
    metering: unknown,
    observation: unknown,
  ): void {
    try {
      const engine = this.loadEconomicVerification();
      if (!engine) return;
      const verdict = engine.verifyEconomics({ metering, observation });
      this.writeJson(ECONOMIC_VERIFICATION_REPORT, { mission, ...verdict });
    } catch {
      /* evidence capture is best-effort — never abort a mission over it */
    }
  }

  /** A BLOCKED outcome for a budget gate that refused the call before the provider ever ran (D). */
  private budgetRefusalOutcome(
    mission: string,
    spec: RawMission | null,
    result: { decision: string; errors?: string[] },
  ): ProviderOutcome {
    const detail = result.errors && result.errors.length ? ` (${result.errors.join("; ")})` : "";
    return {
      provider: "runtime-budget-gate",
      classification: "BLOCKED",
      providerExecuted: false,
      fromCache: false,
      result: {
        mission: spec?.mission ?? mission,
        providerContractVersion: PROVIDER_CONTRACT_VERSION,
        status: "BLOCKED",
        objectivesAddressed: [],
        changedFiles: [],
        commandsRun: [],
        blocker: `Live cost-metering refused the provider call: ${result.decision}${detail}`,
        notes: "V5 Stage 3 live cost metering (D)",
      },
      sessionId: null,
      changedFiles: [],
      unauthorizedChanges: [],
      raw: { exitCode: null, stdout: "", stderr: "" },
      diagnostics: [`budget gate: ${result.decision}`],
      observation: absentObservation(),
    };
  }

  private executeWithFailover(mission: string, spec: RawMission | null): ProviderOutcome {
    const request: ProviderRequest = {
      providerContractVersion: PROVIDER_CONTRACT_VERSION,
      mission: this.buildProviderMission(mission, spec),
      model: PROVIDER_MODEL,
      maxTurns: PROVIDER_MAX_TURNS,
    };
    if (this.provider) {
      return this.provider.execute(request);
    }
    const run = runMissionWithFailover(request, {
      claude: { cwd: this.cwd, model: PROVIDER_MODEL },
      openai: { cwd: this.cwd },
    });
    this.persistFailoverReport(mission, run.report);
    if (run.executed && run.outcome) return run.outcome;
    // No provider can continue → synthesize the actionable BLOCKED outcome (objectives 3-7).
    return haltOutcome(request, run.report);
  }

  /** Best-effort evidence: record which provider was selected and why (never breaks the run). */
  private persistFailoverReport(mission: string, report: FailoverMissionReport): void {
    try {
      this.writeJson(FAILOVER_REPORT, { ...report, mission });
    } catch {
      /* evidence capture is best-effort — a write failure must not abort mission execution */
    }
  }

  /** Refresh build/typescript/gitClean evidence via the EXISTING verifier (best-effort). */
  private refreshVerifyEvidence(mission?: string): void {
    // Reuse the same verifier `odg verify` runs. Its gates are judged later by the Release Manager,
    // so a failing gate must not throw here — it only writes runtime-verify.json.
    // Pass the authoritative current mission as argv[2] (odg-verify.js already prefers it) so the
    // stamped runtime-verify.json carries THIS mission — not a stale corrective-mission.json pointer
    // that odg-verify.js falls back to when invoked with no argument (A1).
    if (!fs.existsSync(this.resolve(VERIFIER))) return;
    spawnSync("node", mission ? [VERIFIER, mission] : [VERIFIER], { cwd: this.cwd, stdio: "inherit" });
  }

  /** Map an existing mission JSON onto the minimal routing shape (Provider Contract §0/§1). */
  private toRoutable(spec: RawMission | null): RoutableMission {
    return {
      mode: spec?.mode,
      authorizedPaths: this.authorizedPaths(spec),
      requiresEngineering: spec?.requires_engineering ?? spec?.requiresEngineering,
    };
  }

  /**
   * Assemble the ProviderMission from EXISTING artifacts (contract §3): the mission JSON where
   * present, falling back to the generated contract, plus deterministic selection context. Pure
   * function of repo state — no timestamps, no randomness (DETERMINISM_FIRST).
   */
  private buildProviderMission(mission: string, spec: RawMission | null): ProviderMission {
    const contract = this.generateContract(mission);
    const state = this.readPlanState();
    const source = this.readSource();
    return {
      mission: spec?.mission ?? mission,
      priority: spec?.priority ?? contract.priority,
      mode: spec?.mode ?? contract.mode,
      objectives: this.providerObjectives(mission, spec),
      definitionOfDone: this.strings(spec?.definition_of_done) ?? contract.definition_of_done,
      completion: this.strings(spec?.completion) ?? contract.completion,
      authorizedPaths: this.authorizedPaths(spec),
      context: {
        repoRoot: this.cwd,
        branch: source.branch ?? "",
        headCommit: source.commit ?? "",
        masterPlanObjectives: state.masterPlanObjectives,
        missingCapabilities: state.missingCapabilities,
      },
    };
  }

  private providerObjectives(mission: string, spec: RawMission | null): ProviderObjective[] {
    const raw = spec?.objectives;
    if (Array.isArray(raw) && raw.length > 0) {
      return raw.map((o, i) => {
        const id = `${this.slug(mission)}_${i + 1}`;
        if (typeof o === "string") return { id, goal: o, done_when: [] };
        return {
          id: typeof o.id === "string" ? o.id : id,
          goal: typeof o.goal === "string" ? o.goal : "",
          done_when: this.strings(o.done_when) ?? [],
        };
      });
    }
    // No objectives on the spec → return empty; generateContract() treats this as a real blocker
    // (no self-synthesized generic objective). This also breaks the previous generateContract↔here
    // recursion now that generateContract calls this helper.
    return [];
  }

  private authorizedPaths(spec: RawMission | null): string[] {
    return this.strings(spec?.authorized_paths ?? spec?.authorizedPaths) ?? [];
  }

  private strings(value: unknown): string[] | null {
    return Array.isArray(value) ? value.filter((s): s is string => typeof s === "string") : null;
  }

  private readMissionJson(mission: string): RawMission | null {
    return this.readJson<RawMission>(`${MISSIONS_DIR}/${mission}.json`);
  }

  /** Stage 4 — collect evidence from existing capabilities (design §2 Stage 4). */
  gatherEvidence(mission: string): ReleaseEvidence {
    const verify = this.readJson<{
      build?: boolean;
      typescript?: boolean;
      gitClean?: boolean;
    }>(VERIFY);

    return {
      validation: {
        build: verify?.build,
        typescript: verify?.typescript,
        gitClean: verify?.gitClean,
        // We only reach Stage 4 after runPipeline reported success (design §2 Stage 4).
        missionPipeline: true,
      },
      source: this.readSource(),
      documentationProof: this.buildDocumentationProof(mission),
      artifacts: this.collectArtifacts(mission),
      previousReleaseRef: this.lastReleaseRef,
    };
  }

  /** Stage 6 — archive via the EXISTING Mission Ledger; no new persistence format (design §2 Stage 6). */
  archive(mission: string, record: ReleaseRecord): void {
    // Reuse the existing Mission Ledger component exactly as the pipeline does.
    spawnSync("node", ["runtime/core/mission-ledger.js", mission], {
      cwd: this.cwd,
      stdio: "inherit",
    });
    this.archivedThisSession.add(mission);
    this.lastReleaseRef = record.requestId;
    this.writeCheckpoint(mission);
  }

  /**
   * Write the resume checkpoint after a RELEASE (best-effort; never throws — a checkpoint failure
   * must not fail an otherwise-successful mission). On restart the loop re-reads the ledger and
   * skips proven missions, so this file is purely observability + a precise "resume after" marker.
   */
  private writeCheckpoint(mission: string): void {
    try {
      const prior = this.readJson<{ releasedThisSession?: string[] }>(CHECKPOINT);
      const released = Array.isArray(prior?.releasedThisSession) ? prior!.releasedThisSession : [];
      if (!released.includes(mission)) released.push(mission);
      const abs = this.resolve(CHECKPOINT);
      fs.mkdirSync(abs.slice(0, abs.lastIndexOf("/")), { recursive: true });
      fs.writeFileSync(
        abs,
        JSON.stringify(
          {
            updatedAt: new Date().toISOString(),
            lastReleased: mission,
            releasedThisSession: released,
            resumeAfter: mission,
          },
          null,
          2,
        ),
      );
    } catch {
      /* best-effort: checkpoint is observability, not a gate */
    }
  }

  // --- helpers ------------------------------------------------------------

  /**
   * The forward work-list, from the SAME coherent model the Runtime dashboard uses
   * (runtime/core/runtime-model.js): executable-but-unproven mission contracts in roadmap-then-
   * alphabetical order. Returns the ordered mission ids (possibly empty when nothing remains), or
   * null when the model cannot be loaded — then readPlanState falls back to the roadmap manifest.
   * Read-only and best-effort; the frozen selectNextMission still consumes this as plain input.
   */
  /**
   * Mission Contract Factory bridge: generate a complete Mission-Loader-conformant contract for
   * every roadmap mission whose contract file is missing (runtime/core/mission-contract-factory.js).
   * This is what lets the campaign run "from the roadmap alone" — a roadmap entry with no contract is
   * otherwise invisible to the runtime-model queue below. Idempotent and best-effort: an existing
   * executable contract is left untouched, and any failure (e.g. a stripped checkout without the
   * factory module) degrades to "generate nothing" rather than breaking selection.
   */
  private materialiseRoadmapContracts(): void {
    try {
      const factory = requireCjs(
        `${this.cwd}/runtime/core/mission-contract-factory.js`,
      ) as {
        generateMissing: (
          root: string,
          opts?: { write?: boolean },
        ) => { generated?: Array<{ mission?: string; path?: string }> };
      };
      const report = factory.generateMissing(this.cwd, { write: true });
      for (const g of report?.generated ?? []) {
        if (g?.path) console.log(`[mission-contract-factory] generated contract: ${g.path}`);
      }
    } catch {
      /* best-effort: absence of the factory must never break mission selection */
    }
  }

  /**
   * CONTRACT ON DEMAND (DYNAMIC_MISSION_CONTRACT_FACTORY): for a SPECIFIC mission that has no contract
   * on disk, synthesize a complete, Mission-Loader-conformant one when governance authorizes it
   * (runtime-policies.json contractOnDemand.enabled) — so an unknown mission no longer blocks the
   * autonomy loop or the provider path. Returns true iff a usable contract now exists on disk (either
   * freshly generated or already present). Idempotent and best-effort: an existing executable contract
   * is reused untouched, and any failure (missing factory, disabled policy) degrades to "no contract",
   * preserving the prior strict behaviour. No new architecture — the CJS factory is the sole author.
   */
  private materialiseOnDemand(mission: string): boolean {
    try {
      const factory = requireCjs(
        `${this.cwd}/runtime/core/mission-contract-factory.js`,
      ) as {
        isOnDemandEnabled: (root: string) => boolean;
        generateForMission: (
          root: string,
          missionId: string,
          opts?: { write?: boolean },
        ) => { generated?: boolean; reused?: boolean; path?: string };
      };
      if (!factory.isOnDemandEnabled(this.cwd)) return false;
      const result = factory.generateForMission(this.cwd, mission, { write: true });
      if (result?.generated && result.path) {
        console.log(`[mission-contract-factory] on-demand contract: ${result.path}`);
      }
      return result?.generated === true || result?.reused === true;
    } catch {
      return false;
    }
  }

  private readRuntimeModelQueue(): string[] | null {
    try {
      const { computeRuntimeModel } = requireCjs(
        `${this.cwd}/runtime/core/runtime-model.js`,
      ) as { computeRuntimeModel: (root: string) => { queue?: Array<{ mission?: unknown }> } };
      const model = computeRuntimeModel(this.cwd);
      const queue = Array.isArray(model?.queue) ? model.queue : [];
      return queue
        .map((q) => q?.mission)
        .filter((m): m is string => typeof m === "string");
    } catch {
      return null;
    }
  }

  private readMasterPlanObjectives(): string[] {
    // Prefer the pipeline-produced plan; fall back to parsing the Master Plan directly.
    const plan = this.readJson<{ objectives?: string[] }>(MISSION_PLAN);
    if (Array.isArray(plan?.objectives) && plan!.objectives.length > 0) {
      return plan!.objectives;
    }
    const brainPath = this.resolve(BRAIN);
    if (!fs.existsSync(brainPath)) return [];
    return fs
      .readFileSync(brainPath, "utf8")
      .split(/\r?\n/)
      .filter((l) => /^\d+\./.test(l.trim()))
      .map((l) => l.trim().replace(/^\d+\.\s*/, ""));
  }

  private readSource(): { commit?: string; branch?: string } {
    try {
      const commit = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: this.cwd,
        encoding: "utf8",
      }).trim();
      const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
        cwd: this.cwd,
        encoding: "utf8",
      }).trim();
      return { commit, branch };
    } catch {
      return {};
    }
  }

  private buildDocumentationProof(mission: string): DocumentationProof | null {
    const artifacts = this.documentableArtifacts(mission);
    if (artifacts.length === 0) return null;
    const inputs: DocumentationInputs = {
      artifactContractVersion: ARTIFACT_CONTRACT_VERSION,
      requestId: mission,
      artifacts,
    };
    const result = this.documentation.generate(inputs);
    return result.ok ? result.proof : null;
  }

  /**
   * Real, already-materialized artifacts of the just-executed mission, fed to the existing
   * Documentation Engine. Two provenance paths are supported so a mission run via EITHER runner
   * yields a proof:
   *   - `runtime/generated/mission-artifacts/generated/<mission>.json` — the local fallback engine
   *     output (the `odg mission <NAME>` path);
   *   - `runtime/generated/mission-report.json` — the canonical pipeline output written by
   *     odg-run.js for the current mission (the `odg autonomy` path). It is mission-scoped, so we
   *     only accept it when its own `mission` field matches the mission we just ran.
   */
  private documentableArtifacts(mission: string): Artifact[] {
    const artifacts: Artifact[] = [];

    const mstd = this.readJson<Record<string, unknown>>(
      `${MSTD_GENERATED}/${mission}.json`,
    );
    if (mstd && typeof mstd === "object") {
      artifacts.push({ kind: "generated", id: mission, version: "1.0.0", payload: mstd });
    }

    const report = this.readCanonicalMissionReport(mission);
    if (report) {
      artifacts.push({ kind: "report", id: mission, version: "1.0.0", payload: report });
    }

    return artifacts;
  }

  /**
   * Read runtime/generated/mission-report.json ONLY when it satisfies the SAME canonical verdict the
   * local fallback pipeline enforces before it writes a SUCCESS artifact
   * (runtime/bin/odg-local-pipeline.sh, step [4/5] GENERATE): the report must be mission-scoped AND
   * carry the Validation Engine's proof — `validated === true` AND `status === "SUCCESS"`.
   *
   * This reuses the Validation Engine's own verdict — the `validated`/`status` fields are written by
   * exactly one component, runtime/core/validation-engine.js — instead of re-deriving proof here, so
   * the Provider / `odg autonomy` path and the MSE path accept EXACTLY the same canonical contract.
   * An absent, stale (different mission), unproven (`validated !== true`) or BLOCKED
   * (`status !== "SUCCESS"`) report yields null: no documentation proof and no releasable artifact is
   * built from it, so the Release Manager returns EVIDENCE_INCOMPLETE rather than a false MISSION
   * SUCCESS (design §0 founding invariant — mandatory evidence must be present to release).
   */
  private readCanonicalMissionReport(mission: string): Record<string, unknown> | null {
    const report = this.readJson<Record<string, unknown>>(MISSION_REPORT);
    if (
      report &&
      typeof report === "object" &&
      report.mission === mission &&
      report.validated === true &&
      report.status === "SUCCESS"
    ) {
      return report;
    }
    return null;
  }

  private collectArtifacts(mission: string): ReleaseArtifactRef[] {
    const refs: ReleaseArtifactRef[] = [];
    const candidates: Array<{ kind: ReleaseArtifactRef["kind"]; path: string }> = [
      { kind: "certificate", path: `runtime/generated/mission-artifacts/certificates/${mission}.certificate.md` },
      { kind: "passport", path: `runtime/generated/mission-artifacts/passports/${mission}.passport.md` },
      { kind: "report", path: `runtime/generated/mission-artifacts/reports/${mission}.report.md` },
      { kind: "generated", path: `${MSTD_GENERATED}/${mission}.json` },
    ];
    for (const c of candidates) {
      if (fs.existsSync(this.resolve(c.path))) {
        refs.push({ kind: c.kind, id: mission, version: "1.0.0" });
      }
    }
    // Canonical pipeline output (odg-run.js / Validation Engine): pin the mission report ONLY when it
    // passes the SAME canonical verdict the MSE pipeline demands (mission-scoped + validated + SUCCESS).
    // A stale or unproven report is not a releasable artifact, so `odg autonomy` never releases a
    // mission whose canonical proof is absent — identical acceptance to the MSE path.
    if (this.readCanonicalMissionReport(mission)) {
      refs.push({ kind: "report", id: `${mission}:mission-report`, version: "1.0.0" });
    }
    return refs;
  }

  private readJson<T>(relPath: string): T | null {
    try {
      return JSON.parse(fs.readFileSync(this.resolve(relPath), "utf8")) as T;
    } catch {
      return null;
    }
  }

  private resolve(relPath: string): string {
    return `${this.cwd}/${relPath}`;
  }

  private slug(mission: string): string {
    return mission.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  }
}
