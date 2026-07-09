import { Capability } from "@/contracts/capability";
import { Decision } from "@/contracts/decision";
import { Reason } from "@/contracts/reason";
import { addDecision } from "@/core/decision-registry";
import { getRuntimeContext } from "@/core/runtime-service";
import { createEvidence } from "@/core/evidence-engine";
import { createExplanation } from "@/core/explanation-engine";
import { addTimelineEvent } from "@/core/timeline-registry";
import { addEvent } from "@/core/event-registry";
import { evaluateValue } from "@/core/value-engine";
import { createKnowledge } from "@/core/knowledge-engine";
import { getDefaultPolicy, isPolicyEnabled } from "@/core/policy-engine";
import { evaluateRisk } from "@/core/risk-engine";

export function evaluateCapability(
  capability: Capability
): Decision & { reason: Reason } {
  const runtime = getRuntimeContext();
  const policy = getDefaultPolicy();

  void runtime;

  const accepted = isPolicyEnabled(policy);

  const decision = {
    id: crypto.randomUUID(),
    capability: capability.id,
    recommendation: accepted ? "ACCEPT" : "REJECT",
    confidence: accepted ? 1.0 : 0.0,
    timestamp: Date.now(),
    reason: accepted
      ? {
          code: "CAPABILITY_VALID",
          message: `Policy '${policy.name}' autorise cette décision.`,
        }
      : {
          code: "POLICY_DISABLED",
          message: `Policy '${policy.name}' interdit cette décision.`,
        },
  };

  const risk = evaluateRisk(decision);

  if (risk.level === "HIGH") {
    decision.recommendation = "REJECT";
    decision.confidence = 0.0;
    decision.reason = {
      code: "RISK_HIGH",
      message: risk.reason,
    };
  }

  createExplanation(decision);

  addDecision(decision);
  createEvidence(decision);
  evaluateValue(decision);
  createKnowledge(decision);

  addTimelineEvent({
    timestamp: Date.now(),
    type: "DECISION_CREATED",
    message: `Décision ${decision.id} créée`,
  });

  addEvent({
    id: crypto.randomUUID(),
    type: "DECISION_CREATED",
    timestamp: Date.now(),
    payload: decision,
  });

  return decision;
}
