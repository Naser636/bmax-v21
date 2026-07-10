import { Verification } from "@/contracts/verification";
import { initializeOpportunity } from "@/core/opportunity-service";

export function runOpportunity(verification: Verification) {
  return initializeOpportunity(
    "Opportunité détectée",
    "Créée après vérification.",
    verification.source
  );
}
