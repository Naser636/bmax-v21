import { Decision } from "@/contracts/decision";
import { Evidence } from "@/contracts/evidence";
import { addEvidence } from "@/core/audit-registry";

export function createEvidence(decision: Decision): Evidence {
  const evidence = {
    id: crypto.randomUUID(),
    decisionId: decision.id,
    source: "DecisionEngine",
    createdAt: Date.now(),
    hash: `${decision.id}-${Date.now()}`,
  };

  addEvidence(evidence);

  return evidence;
}
