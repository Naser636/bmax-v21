import { Capability } from "@/contracts/capability";
import { Decision } from "@/contracts/decision";
import { Reason } from "@/contracts/reason";
import { addDecision } from "@/core/decision-registry";

export function evaluateCapability(
  capability: Capability
): Decision & { reason: Reason } {

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

  return decision;
}
