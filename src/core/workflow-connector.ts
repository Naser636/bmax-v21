import { MissionContext } from "@/core/mission-context";

export async function executeConnector(
  context: MissionContext
): Promise<void> {
  context.state = "CONNECTING";

  // Sprint 10 : adaptation minimale.
  // Le connecteur réel sera branché ici.

  const connector = {
    name: "BOAMP",
    available: true,
  };

  context.connector = connector;

  context.logs.push(
    `Connector executed: ${connector.name}`
  );

  context.results.push(connector);
}
