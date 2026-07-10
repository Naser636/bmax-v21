import { Decision } from "@/contracts/decision";
import { Reason } from "@/contracts/reason";
import { createAudit } from "@/core/audit-engine";
import { createExplanation } from "@/core/explanation-engine";

export function runAudit(
  decision: Decision & { reason: Reason }
) {
  const explanation = createExplanation(decision);
  const audit = createAudit(decision);

  return {
    explanation,
    audit,
  };
}
