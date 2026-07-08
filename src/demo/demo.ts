import { capabilities } from "@/core/capability-registry";
import { evaluateCapability } from "@/core/decision-engine";

const decision = evaluateCapability(capabilities[0]);

console.log("=== ODG DEMO ===");
console.log(decision);
