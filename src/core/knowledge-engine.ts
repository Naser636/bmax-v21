import { Decision } from "@/contracts/decision";
import { Knowledge } from "@/contracts/knowledge";
import { addKnowledge } from "@/core/knowledge-registry";
import { createMemory } from "@/core/memory-engine";

export function createKnowledge(decision: Decision): Knowledge {

  const knowledge = {
    id: crypto.randomUUID(),
    decisionId: decision.id,
    lesson: "Cette décision pourra être réutilisée comme expérience.",
    createdAt: Date.now(),
  };

  addKnowledge(knowledge);

  createMemory(knowledge);

  return knowledge;
}
