import { ConnectorInterface } from "@/contracts/connector-interface";

export async function startConnectors(
  connectors: ConnectorInterface[]
) {
  return Promise.all(connectors.map(c => c.connect()));
}

export async function stopConnectors(
  connectors: ConnectorInterface[]
) {
  return Promise.all(connectors.map(c => c.disconnect()));
}
