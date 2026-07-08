import { Capability } from "@/contracts/capability";
import { Decision } from "@/contracts/decision";

export function evaluateCapability(capability: Capability): Decision {
  return {
    id: crypto.randomUUID(),
    capability: capability.id,
    recommendation: "ACCEPT",
    confidence: 1.0,
    timestamp: Date.now(),
  };
}
