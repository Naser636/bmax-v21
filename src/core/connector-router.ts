import { ConnectorInterface } from "@/contracts/connector-interface";

export function routeConnector(
  connectors: ConnectorInterface[],
  index: number
): ConnectorInterface | undefined {
  return connectors[index];
}
