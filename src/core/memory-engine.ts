import { Knowledge } from "@/contracts/knowledge";
import { Memory } from "@/contracts/memory";
import { addMemory } from "@/core/memory-registry";

export function createMemory(knowledge: Knowledge): Memory {
  const memory: Memory = {
    id: crypto.randomUUID(),
    knowledgeId: knowledge.id,
    summary: knowledge.lesson,
    result: knowledge.result,
    score: knowledge.score,
    createdAt: Date.now(),
  };

  addMemory(memory);

  return memory;
}
