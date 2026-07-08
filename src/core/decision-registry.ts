import { Decision } from "@/contracts/decision";

const registry: Decision[] = [];

export function addDecision(decision: Decision): void {
  registry.push(decision);
}

export function getDecisions(): Decision[] {
  return [...registry];
}
