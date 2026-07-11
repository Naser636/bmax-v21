import { MissionContext } from "@/core/mission-context";

export async function executeQualification(
  context: MissionContext
): Promise<void> {
  context.state = "QUALIFYING";

  // Sprint 10 : adaptation minimale.
  // Le moteur Qualification existant sera branché ici.

  const qualification = {
    qualified: true,
  };

  context.qualification = qualification;

  context.logs.push("Qualification completed");

  context.results.push(qualification);
}
