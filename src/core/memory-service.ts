import { Memory } from "@/contracts/memory";
import { getMemories } from "@/core/memory-registry";

export function getMemoryStore(): Memory[] {
  return getMemories();
}

export function getLatestMemory(): Memory | undefined {
  const memories = getMemories();

  return memories.length > 0
    ? memories[memories.length - 1]
    : undefined;
}
