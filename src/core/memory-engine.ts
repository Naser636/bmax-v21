import { Knowledge } from "@/contracts/knowledge";
import { Memory } from "@/contracts/memory";

export function createMemory(knowledge: Knowledge): Memory {
  return {
    id: crypto.randomUUID(),
    knowledgeId: knowledge.id,
    summary: knowledge.lesson,
    createdAt: Date.now(),
  };
}
