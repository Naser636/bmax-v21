import { Decision } from "@/contracts/decision";
import { Value } from "@/contracts/value";
import { addValue } from "@/core/value-registry";

export function evaluateValue(decision: Decision): Value {

  const value = {
    id: crypto.randomUUID(),
    decisionId: decision.id,
    score: decision.confidence,
    description: "Valeur initiale basée sur le niveau de confiance.",
    createdAt: Date.now(),
  };

  addValue(value);

  return value;
}
