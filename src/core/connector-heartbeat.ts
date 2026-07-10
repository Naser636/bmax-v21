import { ConnectorInterface } from "@/contracts/connector-interface";

export async function heartbeatConnector(
  connector: ConnectorInterface
): Promise<boolean> {
  return connector.health();
}
