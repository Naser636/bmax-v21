import { Capability } from "@/contracts/capability";
import { Decision } from "@/contracts/decision";
import { Reason } from "@/contracts/reason";
import { addDecision } from "@/core/decision-registry";
import { getRuntimeContext } from "@/core/runtime-service";
import { createEvidence } from "@/core/evidence-engine";
import { addTimelineEvent } from "@/core/timeline-registry";
import { addEvent } from "@/core/event-registry";

export function evaluateCapability(
  capability: Capability
): Decision & { reason: Reason } {

  const runtime = getRuntimeContext();

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

  void runtime;

  addDecision(decision);

  createEvidence(decision);

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
