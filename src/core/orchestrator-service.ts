import { createOrchestrator } from "@/core/orchestrator-engine";
import { addOrchestrator } from "@/core/orchestrator-registry";

export function initializeOrchestrator() {
  const orchestrator = createOrchestrator();
  addOrchestrator(orchestrator);
  return orchestrator;
}
