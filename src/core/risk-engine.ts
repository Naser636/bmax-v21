import { Decision } from "@/contracts/decision";
import { Risk } from "@/contracts/risk";
import { addRisk } from "@/core/risk-registry";

export function evaluateRisk(decision: Decision): Risk {
  const level: Risk["level"] =
    decision.confidence >= 0.8 ? "LOW" : "HIGH";

  const risk: Risk = {
    id: crypto.randomUUID(),
    decisionId: decision.id,
    level,
    reason:
      level === "LOW"
        ? "Risque faible."
        : "Confiance insuffisante : risque élevé.",
    createdAt: Date.now(),
  };

  addRisk(risk);

  return risk;
}
