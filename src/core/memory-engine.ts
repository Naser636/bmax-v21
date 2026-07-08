import { Knowledge } from "@/contracts/knowledge";
import { Memory } from "@/contracts/memory";
import { addMemory } from "@/core/memory-registry";

export function createMemory(knowledge: Knowledge): Memory {

  const memory = {
    id: crypto.randomUUID(),
    knowledgeId: knowledge.id,
    summary: knowledge.lesson,
    createdAt: Date.now(),
  };

  addMemory(memory);

  return memory;
}
