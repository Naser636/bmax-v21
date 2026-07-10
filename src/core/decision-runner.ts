import { Simulation } from "@/contracts/simulation";
import { capabilities } from "@/core/capability-registry";
import { evaluateCapability } from "@/core/decision-engine";

export function runDecision(simulation: Simulation) {
  void simulation;

  return evaluateCapability(capabilities[0]);
}
