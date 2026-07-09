import { Opportunity } from "@/contracts/opportunity";

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
