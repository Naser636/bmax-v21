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
      // The read-only LOCAL route applies no code changes itself, so there is no genuine applied
      // evidence here; an engineering mission must therefore carry declared verify evidence on disk.
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
}
