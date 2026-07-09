import { Decision } from "@/contracts/decision";
import { Reason } from "@/contracts/reason";
import { Explanation } from "@/contracts/explanation";

export function createExplanation(
  decision: Decision & { reason: Reason }
): Explanation {
  return {
    id: crypto.randomUUID(),
    decisionId: decision.id,
    summary: decision.reason.code,
    details: decision.reason.message,
    createdAt: Date.now(),
  };
}
