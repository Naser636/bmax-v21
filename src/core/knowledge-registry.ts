import { Knowledge } from "@/contracts/knowledge";

const knowledgeBase: Knowledge[] = [];

export function addKnowledge(knowledge: Knowledge): void {
  knowledgeBase.push(knowledge);
}

export function getKnowledge(): Knowledge[] {
  return [...knowledgeBase];
}
