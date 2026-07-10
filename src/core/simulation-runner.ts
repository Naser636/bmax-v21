import { Opportunity } from "@/contracts/opportunity";
import { initializeSimulation } from "@/core/simulation-service";

export function runSimulation(opportunity: Opportunity) {
  return initializeSimulation(
    opportunity.title,
    0.90
  );
}
