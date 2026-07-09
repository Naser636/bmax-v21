import { Orchestrator } from "@/contracts/orchestrator";

export function createOrchestrator(): Orchestrator {
  return {
    id: crypto.randomUUID(),
    name: "ODG Orchestrator",
    version: "1.0.0",
    createdAt: Date.now(),
  };
}
