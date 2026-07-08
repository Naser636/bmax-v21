import { Decision } from "@/contracts/decision";
import { Value } from "@/contracts/value";

export function evaluateValue(decision: Decision): Value {
  return {
    id: crypto.randomUUID(),
    decisionId: decision.id,
    score: decision.confidence,
    description: "Valeur initiale basée sur le niveau de confiance.",
    createdAt: Date.now(),
  };
}
