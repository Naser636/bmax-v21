import { ConnectorInterface } from "@/contracts/connector-interface";

export async function dispatchConnector(
  connector: ConnectorInterface
): Promise<boolean> {
  return connector.connect();
}
