import { ConnectorInterface } from "@/contracts/connector-interface";

const connectors = new Map<string, ConnectorInterface>();

export function registerConnector(
  name: string,
  connector: ConnectorInterface
): void {
  connectors.set(name, connector);
}

export function getConnector(
  name: string
): ConnectorInterface | undefined {
  return connectors.get(name);
}

export function getConnectorNames(): string[] {
  return [...connectors.keys()];
}
