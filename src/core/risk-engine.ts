import { Decision } from "@/contracts/decision";
import { Risk } from "@/contracts/risk";
import { addRisk } from "@/core/risk-registry";
import { config } from "@/core/config";

export function evaluateRisk(decision: Decision): Risk {
  const score = 1 - decision.confidence;
  const limit = config.risk.limit;

  const level: Risk["level"] =
    score >= 0.80 ? "HIGH"
    : score >= 0.50 ? "MEDIUM"
    : "LOW";

  const risk: Risk = {
    id: crypto.randomUUID(),
    decisionId: decision.id,
    score,
    limit,
    level,
    reason:
      score > limit
        ? "La limite de risque est dépassée."
        : "Le risque est acceptable.",
    createdAt: Date.now(),
  };

  addRisk(risk);

  return risk;
}
