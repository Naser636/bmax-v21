import { Decision } from "@/contracts/decision";
import { createKnowledge } from "@/core/knowledge-engine";

export function runKnowledge(decision: Decision) {
  return createKnowledge(decision);
}
