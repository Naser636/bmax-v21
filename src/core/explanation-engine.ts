import { Decision } from "@/contracts/decision";
import { Explanation } from "@/contracts/explanation";
import { addExplanation } from "@/core/explanation-registry";

export function createExplanation(
  decision: Decision
): Explanation {
  const explanation: Explanation = {
    id: crypto.randomUUID(),
    decisionId: decision.id,
    summary: decision.recommendation,
    details: decision.recommendation,
    policy: "",
    risk: "",
    runtime: "",
    createdAt: Date.now(),
  };
  // Register in the explanation store, exactly as createAudit/createEvidence/
  // createKnowledge do for their registries, so the unified trace exposes it.
  addExplanation(explanation);
  return explanation;
}

export class ExplanationEngine {
  execute(decision: Decision): Explanation {
    return createExplanation(decision);
  }
}
