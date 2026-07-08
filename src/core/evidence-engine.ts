import { Decision } from "@/contracts/decision";
import { Evidence } from "@/contracts/evidence";

export function createEvidence(decision: Decision): Evidence {
  return {
    id: crypto.randomUUID(),
    decisionId: decision.id,
    source: "DecisionEngine",
    createdAt: Date.now(),
    hash: `${decision.id}-${Date.now()}`,
  };
}
