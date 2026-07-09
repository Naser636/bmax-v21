import { Explanation } from "@/contracts/explanation";

const explanations: Explanation[] = [];

export function addExplanation(explanation: Explanation): void {
  explanations.push(explanation);
}

export function getExplanations(): Explanation[] {
  return [...explanations];
}
