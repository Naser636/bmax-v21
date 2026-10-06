import fs from "node:fs";
import { createRequire } from "node:module";
import { MissionLoader } from "./mission-loader";
import { createMissionIntent } from "./mission-intent";
import { MissionOrchestrator } from "./mission-orchestrator";
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

  execute(id: string, name: string) {

    this.engine.bootstrap();

    const runtimeSystem = this.context.system;
    this.state.initialize(runtimeSystem);

    this.events.publish("MissionStarted", {
      id,
      name,
      runtimeSystem
    });

    const mission = this.loader.load(id, name);
    const intent = createMissionIntent(id);
    const plan = this.orchestrator.buildPlan(id, name, intent);
    const technical = this.implementation.createTechnicalPlan(id, name);
    const executionPlan = this.planner.create(id, name, intent);
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
      executionSteps: executionPlan.steps.length
    });

    // CONNECT_FIRST_PRODUCER_CLEAN_WORKSPACE_V1 — self-scoping capability dispatch. For each mission
    // objective, if the EXISTING capability-executors registry matches its id, run the capability so it
    // produces its evidence artifact THIS run (closing Mission → Capability → Execution → Evidence).
    // Objectives matched by no executor are untouched (no dispatch) — existing behaviour preserved. This
    // mirrors the proven Path-B dispatch in runtime/core/patch-executor.js; it adds no mapping layer,
    // Resolver, Allocator, primitive, or authority. A capability that throws propagates and fails the
    // mission closed (LocalMissionRunner records nothing — no ledger write).
    const capabilityExecutors = createRequire(import.meta.url)(
      "../../runtime/core/capability-executors.js",
    ) as {
      resolve: (
        patch: { objectiveId: string; goal?: string },
      ) => { run: () => { capability: string; evidence: string } } | null;
    };
    for (const spec of mission.brain.objectiveSpecs) {
      const executor = capabilityExecutors.resolve({ objectiveId: spec.id, goal: spec.goal });
      if (!executor) continue; // no capability maps to this objective → no dispatch (unchanged)
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
    const evidence = assessObjectiveEvidence({
      objectiveSpecs: mission.brain.objectiveSpecs,
      planObjectiveSteps: plan.steps.filter((s) => s.id.startsWith("OBJECTIVE_")),
      authorizedPaths: mission.policies.authorizedPaths,
      verify: mission.contract.verify,
      // `verify[].evidence` is a REGISTERED PROBE NAME (canonical; same as validation-engine.js). Resolve
      // it through the probe registry using the EXISTING ctx shape { missionId, verify } — verify = the
      // runtime-verify.json booleans the probes already read. No new context model; artifact-path evidence
      // is a different schema and is untouched here.
      probeCtx: { missionId: id, verify: this.readRuntimeVerify() },
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
