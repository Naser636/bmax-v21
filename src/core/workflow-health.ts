import { MissionContext } from "@/core/mission-context";

export async function executeHealth(
  context: MissionContext
): Promise<boolean> {
  // Sprint 10 : adaptation minimale.
  // Le moteur Health existant sera branché ici.

  const healthy = true;

  context.health = {
    healthy,
  };

  context.logs.push(
    `Health check: ${healthy ? "OK" : "FAILED"}`
  );

  return healthy;
}
