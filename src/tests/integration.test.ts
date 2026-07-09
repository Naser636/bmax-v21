import { capabilities } from "@/core/capability-registry";
import { evaluateCapability } from "@/core/decision-engine";

const decision = evaluateCapability(capabilities[0]);

console.assert(decision.recommendation === "ACCEPT" || decision.recommendation === "REJECT");
console.assert(decision.reason.code.length > 0);

console.log("Integration test OK");
