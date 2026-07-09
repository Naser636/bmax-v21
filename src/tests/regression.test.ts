import { capabilities } from "@/core/capability-registry";
import { evaluateCapability } from "@/core/decision-engine";
import { getUnifiedTrace } from "@/core/trace-service";

evaluateCapability(capabilities[0]);

const trace = getUnifiedTrace();

console.assert(trace.decisions.length > 0);
console.assert(trace.evidences.length > 0);
console.assert(trace.audits.length > 0);
console.assert(trace.explanations.length > 0);
console.assert(trace.knowledge.length > 0);
console.assert(trace.memories.length > 0);

console.log("Regression test OK");
