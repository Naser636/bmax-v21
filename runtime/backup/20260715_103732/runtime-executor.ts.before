import { MissionLoader } from "./mission-loader";
import { MissionOrchestrator } from "./mission-orchestrator";
import { ExecutionPlanner } from "./execution-planner";
import { ExecutionMemory } from "./execution-memory";
import { EventBus } from "./event-bus";
import { SystemLoader } from "./system-loader";
import { MissionEngine } from "./mission-engine";
import { CapabilityRegistry } from "./capability-registry";
import { RuntimeReporter } from "./runtime-reporter";
import { RuntimeState } from "./runtime-state";
import { ImplementationEngine } from "./implementation-engine";

export class RuntimeExecutor {

  private readonly system = new SystemLoader();
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

    const runtimeSystem = this.system.load();
    this.state.initialize(runtimeSystem);

    this.events.publish("MissionStarted", {
      id,
      name,
      runtimeSystem
    });

    const mission = this.loader.load(id, name);
    const plan = this.orchestrator.buildPlan(id, name);
    const technical = this.implementation.createTechnicalPlan(id, name);
    this.implementation.prepare(id);
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
      steps: technical.steps.length
    });

    const report = this.implementation.generateReport({
      mission: id,
      capabilities: this.registry.all(),
      logicalSteps: plan.steps.length,
      technicalSteps: technical.steps.length
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
