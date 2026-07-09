import { initializeOrchestrator } from "@/core/orchestrator-service";

const orchestrator = initializeOrchestrator();

console.assert(orchestrator.name === "ODG Orchestrator");
console.assert(orchestrator.version === "1.0.0");

console.log("Orchestrator test OK");
