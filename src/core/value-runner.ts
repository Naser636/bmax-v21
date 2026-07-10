import { Decision } from "@/contracts/decision";
import { evaluateValue } from "@/core/value-engine";

export function runValue(decision: Decision) {
  return evaluateValue(decision);
}
