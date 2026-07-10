import { Connector } from "@/contracts/connector";

const connectors: Connector[] = [];

export function addConnector(connector: Connector): void {
  connectors.push(connector);
}

export function getConnectors(): readonly Connector[] {
  return connectors;
}
