import { Audit } from "@/contracts/audit";
import { Decision } from "@/contracts/decision";
import { addAudit } from "@/core/audit-registry";
import { getDefaultPolicy } from "@/core/policy-engine";
import { evaluateRisk } from "@/core/risk-engine";
import { runtimeContext } from "@/core/runtime-context";

export function createAudit(decision: Decision): Audit {
  const policy = getDefaultPolicy();
  const risk = evaluateRisk(decision);

  const audit: Audit = {
    id: crypto.randomUUID(),
    decisionId: decision.id,
    action: decision.recommendation,
    actor: "DecisionEngine",
    policy: policy.name,
    risk: risk.level,
    runtime: `${runtimeContext.systemState}/${runtimeContext.operationMode}`,
    timestamp: Date.now(),
  };

  addAudit(audit);

  return audit;
}
