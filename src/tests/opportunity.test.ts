import { initializeOpportunity } from "@/core/opportunity-service";

const opportunity = initializeOpportunity(
  "Contrat BTP",
  "Recherche d'un sous-traitant",
  "Example API"
);

console.assert(opportunity.title === "Contrat BTP");
console.assert(opportunity.source === "Example API");

console.log("Opportunity test OK");
