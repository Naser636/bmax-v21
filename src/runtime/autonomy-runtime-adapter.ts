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
  createClaudeProvider,
  missionRequiresProvider,
  toPipelineOutcome,
} from "@/providers";
import type {
  EngineeringProviderPort,
  ProviderMission,
  ProviderObjective,
  ProviderOutcome,
  RoutableMission,
} from "@/providers";
import { ProviderPatchEngine, type PatchReceipt } from "./patch-engine";

const GENERATED = "runtime/generated";
const MISSION_PLAN = `${GENERATED}/mission-plan.json`;
const PATCH_PLAN = `${GENERATED}/patch-plan.json`;
const PATCH_EXECUTION = `${GENERATED}/patch-execution.json`;
const MISSION_REPORT = `${GENERATED}/mission-report.json`;
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
const MSTD_GENERATED = "runtime/mission-standard/generated";
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

// Pinned provider defaults (contract §2). ODG owns these; the adapter never lets Claude choose them.
const PROVIDER_MODEL = "claude-opus-4-8";
const PROVIDER_MAX_TURNS = 25;

/** Raw shape of an existing runtime/missions/*.json file (read-only; no new format introduced). */
interface RawMission {
  mission?: string;
  priority?: string;
  mode?: string;
  objectives?: Array<string | { id?: string; goal?: string; done_when?: unknown }>;
  definition_of_done?: unknown;
  completion?: unknown;
  authorized_paths?: unknown;
  authorizedPaths?: unknown;
  requires_engineering?: boolean;
  requiresEngineering?: boolean;
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
    // Official roadmap manifest is the primary source (runtime/governance/ROADMAP.json): the ordered
    // list of missions the Runtime executes autonomously. Every roadmap mission is a candidate, so
    // the pure selectNextMission (frozen) reduces to "first roadmap mission not yet proven in the
    // ledger" — the loop advances in roadmap order. The frozen selection FUNCTION is unchanged; only
    // its INPUT artifact is the manifest instead of the exhausted capability master plan.
    const manifest = this.readJson<{ missions?: Array<{ id?: string }> }>(ROADMAP_MANIFEST);
    const manifestIds = Array.isArray(manifest?.missions)
      ? manifest!.missions.map((m) => m?.id).filter((m): m is string => typeof m === "string")
      : [];

    let masterPlanObjectives: string[];
    let missingCapabilities: string[];
    if (manifestIds.length > 0) {
      masterPlanObjectives = manifestIds;
      missingCapabilities = manifestIds;
    } else {
      // Backward-compatible fallback: the legacy capability master plan + registry (pre-manifest).
      masterPlanObjectives = this.readMasterPlanObjectives();
      const registry = this.readJson<{ missingCapabilities?: string[] }>(REGISTRY);
      missingCapabilities = Array.isArray(registry?.missingCapabilities)
        ? registry!.missingCapabilities
        : [];
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

    const completedMissions = Array.from(
      new Set([...ledgerMissions, ...this.archivedThisSession]),
    );

    // Fold the AUTHORIZED corrective-mission queue into the work-list AHEAD of roadmap progress:
    // a self-proposed repair, once authorized, is executed before the Runtime advances the roadmap.
    // The frozen selectNextMission is untouched — it still returns "the first work-list entry that is
    // missing and not completed"; we only enrich its INPUT with the corrective ids (deduped, order
    // preserved). Unauthorized nominations are NOT added here, so they can never silently run — they
    // stay a human/RootCauseEngine concern (never bypass HUMAN_VALIDATION). Prepending to BOTH lists
    // keeps a corrective id both a candidate (masterPlanObjectives) and "missing" (missingCapabilities)
    // so the selector nominates it exactly as it does a roadmap mission.
    const corrective = this.readCorrectiveQueue().authorized;
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
      const spec = this.readMissionJson(mission);
      if (!spec) {
        deferred.push({
          mission,
          reason: `authorized but has no Mission Contract at ${MISSIONS_DIR}/${mission}.json — author the contract before it can execute`,
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
    const spec = this.readMissionJson(mission);
    if (!spec) {
      throw new Error(
        `No mission contract at ${MISSIONS_DIR}/${mission}.json — author the mission definition before it can execute.`,
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
   * ODG decides IF an engineering provider is needed via the provider-owned predicate
   * `missionRequiresProvider()`. Only when it returns true is the Claude Provider Adapter invoked —
   * exactly once per mission. Every other (local / deterministic) mission runs the EXISTING pipeline
   * unchanged and never calls Claude. This is the only branch added; the pipeline path is byte-for-
   * byte what it was.
   */
  runPipeline(mission: string): PipelineOutcome {
    const spec = this.readMissionJson(mission);
    if (missionRequiresProvider(this.toRoutable(spec))) {
      return this.runViaProvider(mission, spec);
    }
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
    this.refreshVerifyEvidence();
    return { pipelineOk: true };
  }

  // --- provider execute path (Provider Contract §1/§2) --------------------

  /** Route the execute stage to the injected engineering provider, exactly once per mission. */
  private runViaProvider(mission: string, spec: RawMission | null): PipelineOutcome {
    let outcome = this.providerRuns.get(mission);
    if (!outcome) {
      // The provider is the ONLY place a provider process is spawned (contract §1); its own
      // content-addressed cache short-circuits an identical re-request without a live call.
      outcome = this.getProvider().execute({
        providerContractVersion: PROVIDER_CONTRACT_VERSION,
        mission: this.buildProviderMission(mission, spec),
        model: PROVIDER_MODEL,
        maxTurns: PROVIDER_MAX_TURNS,
      });
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
      this.refreshVerifyEvidence();
      // The provider path bypasses odg-run.js, so the pipeline stages that write the canonical
      // mission-scoped runtime/generated/mission-report.json never run — leaving documentableArtifacts
      // with nothing and buildDocumentationProof returning null (Release gate documentationProofPresent
      // = false). Materialize the SAME plan/patch/execution evidence the pipeline's earlier stages
      // produce, from the provider's REAL receipt (mission id + ground-truth changedFiles), then let the
      // Validation Engine — the SOLE author of validated/status — re-verify and write the report. The
      // verdict is NOT asserted here: the Validation Engine still computes it from real evidence
      // (working-tree changes in scope + build/tsc gates), so an unproven mission still yields BLOCKED.
      this.writeProviderValidationEvidence(mission, spec, receipt);
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
  ): void {
    // The Validation Engine is the sole author of the verdict. If it is absent (e.g. a sandboxed
    // harness that supplies its own canonical mission-report.json), leave the existing report
    // untouched rather than materializing half of the pipeline's inputs. Mirrors refreshVerifyEvidence.
    if (!fs.existsSync(this.resolve(VALIDATION_ENGINE))) return;

    const objectives = this.providerObjectives(mission, spec);
    const missionId = spec?.mission ?? mission;

    const plan = {
      mission: missionId,
      mode: typeof spec?.mode === "string" ? spec.mode : "IMPLEMENT",
      requiresEngineering: spec?.requiresEngineering === true,
      authorizedPaths: this.authorizedPaths(spec),
      objectives: objectives.map((o) => ({ id: o.id, goal: o.goal, done_when: o.done_when })),
      definitionOfDone: this.strings(spec?.definition_of_done) ?? [],
    };
    const patchPlan = {
      mission: missionId,
      patches: objectives.map((o) => ({ objective: o.id, files: receipt.changedFiles })),
    };
    const execution = {
      mission: missionId,
      executed: objectives.map((o) => ({ action: o.id, status: "APPLIED" })),
    };

    this.writeJson(MISSION_PLAN, plan);
    this.writeJson(PATCH_PLAN, patchPlan);
    this.writeJson(PATCH_EXECUTION, execution);

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

  private getProvider(): EngineeringProviderPort {
    if (!this.provider) {
      this.provider = createClaudeProvider({ cwd: this.cwd, model: PROVIDER_MODEL });
    }
    return this.provider;
  }

  /** Refresh build/typescript/gitClean evidence via the EXISTING verifier (best-effort). */
  private refreshVerifyEvidence(): void {
    // Reuse the same verifier `odg verify` runs. Its gates are judged later by the Release Manager,
    // so a failing gate must not throw here — it only writes runtime-verify.json.
    if (!fs.existsSync(this.resolve(VERIFIER))) return;
    spawnSync("node", [VERIFIER], { cwd: this.cwd, stdio: "inherit" });
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
   *   - `runtime/mission-standard/generated/<mission>.json` — the Mission-Standard engine output
   *     (the `odg mission <NAME>` path);
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
   * Mission-Standard (MSE) pipeline enforces before it writes a SUCCESS artifact
   * (runtime/mission-standard/bin/mse, step [4/5] GENERATE): the report must be mission-scoped AND
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
      { kind: "certificate", path: `runtime/mission-standard/certificates/${mission}.certificate.md` },
      { kind: "passport", path: `runtime/mission-standard/passports/${mission}.passport.md` },
      { kind: "report", path: `runtime/mission-standard/reports/${mission}.report.md` },
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
