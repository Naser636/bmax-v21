import { ConnectorInterface } from "@/contracts/connector-interface";

const cache = new Map<string, ConnectorInterface>();

export function cacheConnector(
  name: string,
  connector: ConnectorInterface
): void {
  cache.set(name, connector);
}

export function getCachedConnector(
  name: string
): ConnectorInterface | undefined {
  return cache.get(name);
}
