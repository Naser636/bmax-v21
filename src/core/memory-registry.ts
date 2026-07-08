import { Memory } from "@/contracts/memory";

const memories: Memory[] = [];

export function addMemory(memory: Memory): void {
  memories.push(memory);
}

export function getMemories(): Memory[] {
  return [...memories];
}
