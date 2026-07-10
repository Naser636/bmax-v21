import { initializeGoal } from "@/core/goal-service";
import { initializeMission } from "@/core/mission-service";
import { runDiscovery } from "@/core/discovery-runner";
import { runVerification } from "@/core/verification-runner";

const goal = initializeGoal();

const mission = initializeMission(
  goal,
  "Trouver des appels d'offres",
  "Recherche B2B"
);

const connector = runDiscovery(mission);
const verification = runVerification(connector);

console.assert(verification.verified === true);

console.log("Verification Runner OK");
