import { capabilities } from "@/core/capability-registry";
import { evaluateCapability } from "@/core/decision-engine";

export function getDashboardState() {
  return {
    capability: capabilities[0],
    decision: evaluateCapability(capabilities[0]),
  };
}
