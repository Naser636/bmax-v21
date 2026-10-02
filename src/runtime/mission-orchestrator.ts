import { MissionLoader, RuntimeMission, ObjectiveSpec, MissionPolicies } from "./mission-loader";
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
  // S2: the mission's governance, carried verbatim (transport only; not enforced here).
  policies: MissionPolicies;
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
    // A4-strict: step dependencies honour the contract's declared dependsOn when present
    // (cycle-safe), otherwise fall back to the positional chain.
    const objectiveDeps = this.objectiveDependencies(specs);
    const objectiveSteps: ExecutionStep[] = specs.map((spec, index) => ({
      id: `OBJECTIVE_${index + 1}`,
      name: spec.goal,
      status: "PENDING" as const,
      actions: [spec.goal],
      dependencies: objectiveDeps[index],
      postconditions: spec.doneWhen,
      verificationRequirements: spec.doneWhen
    }));

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
      // S1: prefer the contract-derived intent (a function of the mission); fall back to
      // the caller-supplied intent only if the loader could not derive one.
      intent: mission.intent ?? intent,
      mission,
      objectives: mission.brain.objectives,
      nextObjective: mission.brain.nextObjective,
      steps,
      dependencies,
      // S2: carry the mission's governance verbatim (transport only; not enforced here).
      policies: mission.policies
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

  /**
   * A4-strict: compute each objective step's dependency set.
   *  - If ANY objective declares `dependsOn`, the plan is in DECLARATIVE mode: a step's
   *    dependencies come from its own dependsOn (resolved from objective id → OBJECTIVE_n
   *    step id); an objective that declares none becomes a root (no positional edge).
   *  - If NONE declares dependsOn (every real contract today), fall back to the legacy
   *    POSITIONAL chain (OBJECTIVE_k depends on the prior step) — preserving existing plans.
   * Explicit, tested edge behaviour:
   *  - unknown id (no matching objective) → skipped (no edge);
   *  - self-reference → skipped;
   *  - cycle-closing edge → skipped (the dependency graph is kept acyclic, deterministically
   *    by contract order), so building never loops.
   */
  private objectiveDependencies(specs: ObjectiveSpec[]): string[][] {
    const stepIdOf = (i: number) => `OBJECTIVE_${i + 1}`;

    const idToStep = new Map<string, string>();
    specs.forEach((s, i) => {
      if (s.id && !idToStep.has(s.id)) idToStep.set(s.id, stepIdOf(i));
    });

    const declarative = specs.some(s => (s.dependsOn?.length ?? 0) > 0);

    const adjacency = new Map<string, Set<string>>();
    const addEdge = (from: string, to: string): void => {
      if (!adjacency.has(from)) adjacency.set(from, new Set());
      adjacency.get(from)!.add(to);
    };
    // Is `to` reachable from `from` following the edges accepted so far?
    const reaches = (from: string, to: string): boolean => {
      const seen = new Set<string>();
      const stack = [from];
      while (stack.length) {
        const node = stack.pop()!;
        if (node === to) return true;
        if (seen.has(node)) continue;
        seen.add(node);
        for (const next of adjacency.get(node) ?? []) stack.push(next);
      }
      return false;
    };

    return specs.map((spec, index) => {
      const self = stepIdOf(index);
      const declared = spec.dependsOn ?? [];

      if (declared.length > 0) {
        const resolved: string[] = [];
        for (const ref of declared) {
          const target = idToStep.get(ref);
          if (!target || target === self) continue;      // unknown id or self-ref: skip
          if (reaches(self, target)) continue;           // would close a cycle: skip
          resolved.push(target);
          addEdge(target, self);
        }
        return resolved;                                 // may be empty (all unknown/cyclic)
      }

      if (declarative) {
        return [];                                       // declarative mode: non-declaring objective is a root
      }

      const prior = index === 0 ? "LOAD" : `OBJECTIVE_${index}`;
      addEdge(prior, self);
      return [prior];                                    // legacy positional fallback
    });
  }

}
