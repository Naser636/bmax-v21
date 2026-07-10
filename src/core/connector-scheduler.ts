import { ConnectorInterface } from "@/contracts/connector-interface";

export async function runConnectorScheduler(
  connectors: ConnectorInterface[]
): Promise<boolean[]> {
  return Promise.all(
    connectors.map(c => c.health())
  );
}
