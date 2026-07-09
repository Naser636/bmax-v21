import { Decision } from "@/contracts/decision";
import { Reason } from "@/contracts/reason";
import { Explanation } from "@/contracts/explanation";
import { addExplanation } from "@/core/explanation-registry";
import { getDefaultPolicy } from "@/core/policy-engine";
import { evaluateRisk } from "@/core/risk-engine";
import { runtimeContext } from "@/core/runtime-context";

export function createExplanation(
  decision: Decision & { reason: Reason }
): Explanation {
  const policy = getDefaultPolicy();
  const risk = evaluateRisk(decision);

  const explanation: Explanation = {
    id: crypto.randomUUID(),
    decisionId: decision.id,
    summary: decision.reason.code,
    details: decision.reason.message,
    policy: policy.name,
    risk: risk.level,
    runtime: `${runtimeContext.systemState}/${runtimeContext.operationMode}`,
    createdAt: Date.now(),
  };

  addExplanation(explanation);

  return explanation;
}
