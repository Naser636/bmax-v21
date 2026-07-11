import { Decision } from "@/contracts/decision";
import { Explanation } from "@/contracts/explanation";

export function createExplanation(
  decision: Decision
): Explanation {
  return {
    id: crypto.randomUUID(),
    decisionId: decision.id,
    summary: decision.recommendation,
    details: decision.recommendation,
    policy: "",
    risk: "",
    runtime: "",
    createdAt: Date.now(),
  };
}

export class ExplanationEngine {
  execute(decision: Decision): Explanation {
    return createExplanation(decision);
  }
}
