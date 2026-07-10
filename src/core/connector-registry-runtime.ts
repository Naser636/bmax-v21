import { ConnectorRuntime } from "@/core/connector-runtime";

const runtimes = new Map<string, ConnectorRuntime>();

export function registerRuntime(
  name: string,
  runtime: ConnectorRuntime
): void {
  runtimes.set(name, runtime);
}

export function getRuntime(
  name: string
): ConnectorRuntime | undefined {
  return runtimes.get(name);
}
