import { capabilities } from "@/core/capability-registry";
import { evaluateCapability } from "@/core/decision-engine";
import { getDecisions } from "@/core/decision-registry";

const decision = evaluateCapability(capabilities[0]);

console.log("=== ODG DEMO ===");
console.log(decision);
console.log("Décisions enregistrées :", getDecisions().length);
