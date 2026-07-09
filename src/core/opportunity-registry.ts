import { Opportunity } from "@/contracts/opportunity";

const opportunities: Opportunity[] = [];

export function addOpportunity(opportunity: Opportunity): void {
  opportunities.push(opportunity);
}

export function getOpportunities(): readonly Opportunity[] {
  return opportunities;
}
