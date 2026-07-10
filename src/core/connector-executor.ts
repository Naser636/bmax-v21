import { ConnectorInterface } from "@/contracts/connector-interface";

export async function executeConnector(
  connector: ConnectorInterface
): Promise<boolean> {
  return connector.connect();
}
