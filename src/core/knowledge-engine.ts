import { Decision } from "@/contracts/decision";
import { Knowledge } from "@/contracts/knowledge";

export function createKnowledge(decision: Decision): Knowledge {
  return {
    id: crypto.randomUUID(),
    decisionId: decision.id,
    lesson: "Cette décision pourra être réutilisée comme expérience.",
    createdAt: Date.now(),
  };
}
