import { MissionLoader, RuntimeMission } from "./mission-loader";
import { MissionIntent } from "./mission-intent";

export interface ExecutionStep {
  id: string;
  name: string;
  status: "PENDING";
  actions: string[];
  dependencies: string[];
  postconditions: string[];
  verificationRequirements: string[];
}

export interface PlanDependency {
  from: string;
  to: string;
}

export interface ExecutionPlan {
  intent?: MissionIntent;
  mission: RuntimeMission;
  steps: ExecutionStep[];
  objectives: string[];
  nextObjective: string | null;
  dependencies: PlanDependency[];
}

export class MissionOrchestrator {

  constructor(
    private readonly loader = new MissionLoader()
  ) {}

  buildPlan(id: string, name: string, intent?: MissionIntent): ExecutionPlan {

    const mission = this.loader.load(id, name);
    const specs = mission.brain.objectiveSpecs;

    // A2/A3: one semantic step per mission objective. The step carries actions,
    // dependencies, postconditions and verificationRequirements derived from the
    // mission's own objective spec — so two semantically different missions produce
    // different steps (and therefore a different plan signature).
    const objectiveSteps: ExecutionStep[] = specs.map((spec, index) => {
      const prior = index === 0 ? "LOAD" : `OBJECTIVE_${index}`;
      return {
        id: `OBJECTIVE_${index + 1}`,
        name: spec.goal,
        status: "PENDING" as const,
        actions: [spec.goal],
        dependencies: [prior],
        postconditions: spec.doneWhen,
        verificationRequirements: spec.doneWhen
      };
    });

    const lastObjective =
      specs.length > 0 ? `OBJECTIVE_${specs.length}` : "LOAD";

    const steps: ExecutionStep[] = [
      this.step("LOAD", "Load ProjectContext", []),
      ...objectiveSteps,
      this.step("VERIFY", "Verify Governance", [lastObjective]),
      this.step("EXECUTE", "Execute Mission", ["VERIFY"]),
      this.step("REPORT", "Generate Report", ["EXECUTE"])
    ];

    // A4: expose the declared step ordering as an edge list (dependency graph).
    const dependencies = this.deriveDependencies(steps);

    return {
      intent,
      mission,
      objectives: mission.brain.objectives,
      nextObjective: mission.brain.nextObjective,
      steps,
      dependencies
    };
  }

  private step(
    id: string,
    name: string,
    dependencies: string[]
  ): ExecutionStep {
    return {
      id,
      name,
      status: "PENDING",
      actions: [name],
      dependencies,
      postconditions: [],
      verificationRequirements: []
    };
  }

  private deriveDependencies(steps: ExecutionStep[]): PlanDependency[] {
    const edges: PlanDependency[] = [];
    for (const step of steps) {
      for (const from of step.dependencies) {
        edges.push({ from, to: step.id });
      }
    }
    return edges;
  }

}
