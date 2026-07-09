import { Audit } from "@/contracts/audit";
import { Decision } from "@/contracts/decision";
import { addAudit } from "@/core/audit-registry";

export function createAudit(decision: Decision): Audit {
  const audit: Audit = {
    id: crypto.randomUUID(),
    decisionId: decision.id,
    action: decision.recommendation,
    actor: "DecisionEngine",
    timestamp: Date.now(),
  };

  addAudit(audit);

  return audit;
}
