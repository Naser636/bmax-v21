import type { Opportunity } from "@/contracts/opportunity";

export type { Opportunity };

export function createOpportunity(
  title: string,
  description: string,
  source: string
): Opportunity {
  return {
    id: crypto.randomUUID(),
    title,
    description,
    source,
    createdAt: Date.now(),
  };
}

export class OpportunityEngine {
  execute(): Opportunity[] {
    return [
      createOpportunity(
        "Demo Opportunity",
        "Demo Opportunity",
        "BOAMP"
      ),
    ];
  }
}
