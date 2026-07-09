import { Decision } from "@/contracts/decision";
import { Value } from "@/contracts/value";
import { addValue } from "@/core/value-registry";
import { getDefaultPolicy } from "@/core/policy-engine";
import { evaluateRisk } from "@/core/risk-engine";
import { getLatestMemory } from "@/core/memory-service";

export function evaluateValue(decision: Decision): Value {
  const policy = getDefaultPolicy();
  const risk = evaluateRisk(decision);
  const memory = getLatestMemory();

  let score = decision.confidence;

  if (policy.enabled) {
    score += 0.10;
  }

  if (risk.level === "LOW") {
    score += 0.10;
  }

  if (memory?.result === "ACCEPT") {
    score += 0.10;
  }

  score = Math.min(score, 1);

  const value: Value = {
    id: crypto.randomUUID(),
    decisionId: decision.id,
    score,
    description: "Score basé sur la confiance, la Policy, le Risk et la Memory.",
    createdAt: Date.now(),
  };

  addValue(value);

  return value;
}
