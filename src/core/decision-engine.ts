import { Capability } from "@/contracts/capability";
import { Decision } from "@/contracts/decision";
import { Reason } from "@/contracts/reason";
import { addDecision } from "@/core/decision-registry";
import { getRuntimeContext } from "@/core/runtime-service";
import { createEvidence } from "@/core/evidence-engine";
import { addTimelineEvent } from "@/core/timeline-registry";
import { addEvent } from "@/core/event-registry";
import { evaluateValue } from "@/core/value-engine";
import { createKnowledge } from "@/core/knowledge-engine";
import { getDefaultPolicy } from "@/core/policy-engine";

export function evaluateCapability(
  capability: Capability
): Decision & { reason: Reason } {

  const runtime = getRuntimeContext();

  const policy = getDefaultPolicy();

  void runtime;
  void policy;

  const decision = {
    id: crypto.randomUUID(),
    capability: capability.id,
    recommendation: "ACCEPT",
    confidence: 1.0,
    timestamp: Date.now(),
    reason: {
      code: "CAPABILITY_VALID",
      message: "La capability est enregistrée et prête à être utilisée.",
    },
  };

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
