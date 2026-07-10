import { ConnectorInterface } from "@/contracts/connector-interface";

export function selectHealthyConnector(
  connectors: ConnectorInterface[],
  health: boolean[]
): ConnectorInterface | undefined {
  return connectors.find((_, index) => health[index]);
}
