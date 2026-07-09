import { Decision } from "@/contracts/decision";
import { Reason } from "@/contracts/reason";
import { Explanation } from "@/contracts/explanation";
import { addExplanation } from "@/core/explanation-registry";

export function createExplanation(
  decision: Decision & { reason: Reason }
): Explanation {
  const explanation: Explanation = {
    id: crypto.randomUUID(),
    decisionId: decision.id,
    summary: decision.reason.code,
    details: decision.reason.message,
    createdAt: Date.now(),
  };

  addExplanation(explanation);

  return explanation;
}
