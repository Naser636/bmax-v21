import { Orchestrator } from "@/contracts/orchestrator";

const orchestrators: Orchestrator[] = [];

export function addOrchestrator(item: Orchestrator): void {
  orchestrators.push(item);
}

export function getOrchestrators(): readonly Orchestrator[] {
  return orchestrators;
}
