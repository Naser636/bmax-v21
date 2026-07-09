import { createOpportunity } from "@/core/opportunity-engine";
import { addOpportunity } from "@/core/opportunity-registry";

export function initializeOpportunity(
  title: string,
  description: string,
  source: string
) {
  const opportunity = createOpportunity(title, description, source);
  addOpportunity(opportunity);
  return opportunity;
}
