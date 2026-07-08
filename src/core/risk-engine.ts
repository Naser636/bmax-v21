import { Decision } from "@/contracts/decision";
import { Risk } from "@/contracts/risk";
import { addRisk } from "@/core/risk-registry";

export function evaluateRisk(decision: Decision): Risk {
  const risk: Risk = {
    id: crypto.randomUUID(),
    decisionId: decision.id,
    level: decision.confidence >= 0.8 ? "LOW" : "MEDIUM",
    reason: "Évaluation initiale du risque.",
    createdAt: Date.now(),
  };

  addRisk(risk);

  return risk;
}
