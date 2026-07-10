import { ConnectorInterface } from "@/contracts/connector-interface";

export async function getFirstAvailableConnector(
  connectors: ConnectorInterface[]
): Promise<ConnectorInterface | undefined> {
  for (const connector of connectors) {
    if (await connector.health()) {
      return connector;
    }
  }

  return undefined;
}
