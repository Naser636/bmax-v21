import { Capability } from "@/contracts/capability";
import { Opportunity } from "@/contracts/opportunity";

export function opportunityToCapability(
  opportunity: Opportunity
): Capability {
  return {
    id: opportunity.id,
    name: opportunity.title,
    version: "2.0",
    description: opportunity.description,
  };
}
