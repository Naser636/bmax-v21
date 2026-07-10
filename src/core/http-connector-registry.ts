import { HttpConnectorAdapter } from "@/core/http-connector-adapter";

const registry = new Map<string, HttpConnectorAdapter>();

export function registerHttpConnector(
  name: string,
  adapter: HttpConnectorAdapter
): void {
  registry.set(name, adapter);
}

export function getHttpConnector(
  name: string
): HttpConnectorAdapter | undefined {
  return registry.get(name);
}
