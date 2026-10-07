import fs from "node:fs";
import { createRequire } from "node:module";
import { MissionLoader, RuntimeMission } from "./mission-loader";
import { createMissionIntent, MissionIntent } from "./mission-intent";
import { MissionOrchestrator, ExecutionPlan } from "./mission-orchestrator";
import { ExecutionPlanner } from "./execution-planner";
import { ExecutionMemory } from "./execution-memory";
import { EventBus } from "./event-bus";
import { RuntimeContext } from "./runtime-context";
import { MissionEngine } from "./mission-engine";
import { CapabilityRegistry } from "./capability-registry";
import { RuntimeReporter } from "./runtime-reporter";
import { RuntimeState } from "./runtime-state";
import { ImplementationEngine } from "./implementation-engine";
import { assessObjectiveEvidence } from "./objective-evidence";

export class RuntimeExecutor {

  private readonly context = RuntimeContext.get();
  private readonly engine = new MissionEngine();
  private readonly loader = new MissionLoader();
  private readonly orchestrator = new MissionOrchestrator();
  private readonly planner = new ExecutionPlanner();
  private readonly memory = new ExecutionMemory();
  private readonly events = new EventBus();
  private readonly registry = new CapabilityRegistry();
  private readonly reporter = new RuntimeReporter();
  private readonly state = new RuntimeState();
  private readonly implementation = new ImplementationEngine();

  execute(id: string, name: string, suppliedPlan?: ExecutionPlan) {

    this.engine.bootstrap();

    const runtimeSystem = this.context.system;
    this.state.initialize(runtimeSystem);

    this.events.publish("MissionStarted", {
      id,
      name,
      runtimeSystem
    });

    // FIX_DOUBLE_RECOMPUTE_V1: REUSE the plan the caller (LocalMissionRunner) already built instead of
    // re-loading + re-planning. When a plan is supplied, the second load + buildPlan +
    // ExecutionPlanner.create sequence is SKIPPED and the exact supplied plan drives execution. When no
    // plan is supplied (standalone callers), build it exactly as before (backward-compatible).
    let mission: RuntimeMission;
    let intent: MissionIntent;
    let plan: ExecutionPlan;
    if (suppliedPlan) {
      plan = suppliedPlan;
      mission = suppliedPlan.mission;
      intent = suppliedPlan.intent ?? createMissionIntent(id);
    } else {
      mission = this.loader.load(id, name);
      intent = createMissionIntent(id);
      plan = this.orchestrator.buildPlan(id, name, intent);
    }
    const technical = this.implementation.createTechnicalPlan(id, name);
    // ExecutionPlanner.create belongs to the skipped second-construction sequence; its only use here is the
    // executionSteps log count, derived from the reused plan when a plan is supplied.
    const executionSteps = suppliedPlan
      ? plan.steps.length
      : this.planner.create(id, name, intent).steps.length;
    this.implementation.prepare(id, intent);
    this.implementation.prepareExecution(id, name);

    for (const step of technical.steps) {
      this.registry.register({
        id: step.id,
        name: step.capability
      });
    }

    this.memory.append(id, "MissionStarted", { name });
    this.memory.append(id, "SystemLoaded", runtimeSystem);
    this.memory.append(id, "PlanCreated", {
      steps: plan.steps.length
    });
    this.memory.append(id, "TechnicalPlanCreated", {
      steps: technical.steps.length,
      executionSteps
    });

    // CONNECT_FIRST_PRODUCER_CLEAN_WORKSPACE_V1 — self-scoping capability dispatch. For each mission
    // objective, if the EXISTING capability-executors registry matches its id, run the capability so it
    // produces its evidence artifact THIS run (closing Mission → Capability → Execution → Evidence).
    // Objectives matched by no executor are untouched (no dispatch) — existing behaviour preserved. This
    // mirrors the proven Path-B dispatch in runtime/core/patch-executor.js; it adds no mapping layer,
    // Resolver, Allocator, primitive, or authority. A capability that throws propagates and fails the
    // mission closed (LocalMissionRunner records nothing — no ledger write).
    // Run-ownership reference (ADD_PROBE_RUN_OWNERSHIP_V1): captured from the EXISTING
    // RuntimeState.startedAt (set by state.initialize above, BEFORE any capability dispatch below).
    // Reuses the existing runStartedAtMs concept — no new ownership framework or context model.
    const runStartedAtMs = this.state.startedAt ? Date.parse(this.state.startedAt) : undefined;

    const require_ = createRequire(import.meta.url);
    const capabilityExecutors = require_(
      "../../runtime/core/capability-executors.js",
    ) as {
      resolve: (
        patch: Record<string, unknown>,
      ) => { capability: string; run: () => { capability: string; evidence: string } } | null;
    };
    // GOVERNED CONSEQUENTIAL-CAPABILITY GATE at the execution chokepoint (defense-in-depth, independent
    // of the NL entrypoint): a consequential capability runs ONLY under a valid human grant carried on
    // the objective (re-validated here against mission/expiry/scope/capability/human), fail-closed.
    const authz = require_("../../runtime/core/capability-authorization.js") as {
      isConsequentialCapability: (c: string) => boolean;
      authorizeCapability: (
        req: { capability: string; mission: string; requestedScope?: unknown },
        grant: unknown,
        ctx: { now: number },
      ) => { decision: string; code?: string; detail?: string; evidence?: unknown };
      requestedScopeOf: (c: string, v: unknown) => unknown;
    };
    const nowMs = runStartedAtMs ?? Date.now();
    for (const spec of mission.brain.objectiveSpecs) {
      // Transport the human-authorized concrete capability spec to the EXISTING executor: the privileged
      // parameters came from the human grant's scope (built by odg-objective), carried verbatim through
      // the loader, and are injected here under the exact patch key the executor already reads.
      const resolvePatch: Record<string, unknown> = { objectiveId: spec.id, goal: spec.goal };
      if (spec.authorization) resolvePatch.authorization = spec.authorization;
      if (spec.capabilitySpec && spec.capabilitySpec.field) {
        resolvePatch[spec.capabilitySpec.field] = spec.capabilitySpec.value;
      }
      const executor = capabilityExecutors.resolve(resolvePatch);
      if (!executor) continue; // no capability maps to this objective → no dispatch (unchanged)

      // Consequential capability ⇒ require a valid human grant before running (fail-closed). An
      // unauthorized objective is NOT executed (produces no evidence ⇒ its proof fails ⇒ the mission is
      // not SUCCESS), while any independently-authorized objective still proceeds.
      if (authz.isConsequentialCapability(executor.capability)) {
        const decision = authz.authorizeCapability(
          {
            capability: executor.capability,
            mission: id,
            requestedScope: spec.capabilitySpec
              ? authz.requestedScopeOf(executor.capability, spec.capabilitySpec.value)
              : undefined,
          },
          spec.authorization ?? null,
          { now: nowMs },
        );
        if (decision.decision !== "ALLOW") {
          this.memory.append(id, "CapabilityBlocked", {
            objectiveId: spec.id,
            capability: executor.capability,
            code: decision.code,
            detail: decision.detail,
          });
          continue; // fail-closed: never run a consequential capability without a valid human grant
        }
        this.memory.append(id, "CapabilityAuthorized", {
          objectiveId: spec.id,
          capability: executor.capability,
          authorization: decision.evidence,
        });
      }

      const result = executor.run();
      this.memory.append(id, "CapabilityExecuted", {
        objectiveId: spec.id,
        capability: result.capability,
        evidence: result.evidence,
      });
    }

    // ROOT CAUSE #1: the verdict must be a function of GENUINE, mission-derived evidence —
    // not a self-fulfilling count of the plan's own steps copied into the registry. The
    // previous computation (objectivesExecuted = registry.all().length, which this executor
    // had just filled with technical.steps; verification hardcoded {0,0}; verdict derived from
    // executed === total) was a tautology that recorded EVERY mission PROVEN regardless of
    // class or evidence. Assess the honest inputs (coverage cross-checked loader→orchestrator,
    // and class-aware evidence per validation-engine.js:66 / artifactNonEmpty) and feed them to
    // the UNCHANGED RuntimeReporter gate, which re-enforces coverage + verification + PASS.
    // `verify[].evidence` is a REGISTERED PROBE NAME (canonical; same as validation-engine.js). Resolve
    // it through the probe registry using the EXISTING ctx shape { missionId, verify } — verify = the
    // runtime-verify.json booleans the probes already read. `runStartedAtMs` lets an ARTIFACT-BACKED
    // probe (e.g. clean-workspace-scanned) confirm its evidence was produced THIS run (run-ownership);
    // content-derived probes (build-green/typescript-green) ignore it. No new context model; artifact-
    // path evidence is a different schema and is untouched here. Built as a local so the extra field
    // passes structurally without widening the ObjectiveEvidenceInput.probeCtx type.
    const probeCtx = { missionId: id, verify: this.readRuntimeVerify(), runStartedAtMs };
    const evidence = assessObjectiveEvidence({
      objectiveSpecs: mission.brain.objectiveSpecs,
      planObjectiveSteps: plan.steps.filter((s) => s.id.startsWith("OBJECTIVE_")),
      authorizedPaths: mission.policies.authorizedPaths,
      verify: mission.contract.verify,
      probeCtx,
      // The read-only LOCAL route applies no code changes itself, so there is no genuine applied
      // evidence here; an engineering mission must therefore carry declared verify evidence (probes).
      appliedEvidenceCount: 0,
    });

    const report = this.implementation.generateReport({
      mission: id,
      capabilities: this.registry.all(),
      logicalSteps: plan.steps.length,
      technicalSteps: technical.steps.length,
      objectivesTotal: evidence.objectivesTotal,
      objectivesExecuted: evidence.objectivesExecuted,
      verification: evidence.verification,
      proof: evidence.proof
    });

    this.state.complete();

    this.events.publish("MissionCompleted", { id });

    return {
      mission,
      runtimeSystem,
      logicalSteps: plan.steps.length,
      technicalSteps: technical.steps.length,
      capabilities: this.registry.all(),
      report,
      history: this.memory.history(id)
    };
  }

  /**
   * Read the EXISTING runtime-verify.json booleans (odg-verify.js is their sole writer) so the
   * build-green / typescript-green probes can resolve on this route — the same artifact and ctx the
   * Validation Engine uses (validation-engine.js:98,131). Returns undefined when absent; probes then
   * fail closed (never throw). This reads only an existing artifact; it writes nothing.
   */
  private readRuntimeVerify(): unknown {
    try {
      return JSON.parse(fs.readFileSync("runtime/generated/runtime-verify.json", "utf8"));
    } catch {
      return undefined;
    }
  }
}
