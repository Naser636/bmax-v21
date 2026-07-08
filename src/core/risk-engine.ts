import { Decision } from "@/contracts/decision";
import { Risk } from "@/contracts/risk";

export function evaluateRisk(decision: Decision): Risk {
  return {
    id: crypto.randomUUID(),
    decisionId: decision.id,
    level: decision.confidence >= 0.8 ? "LOW" : "MEDIUM",
    reason: "Évaluation initiale du risque.",
    createdAt: Date.now(),
  };
}
