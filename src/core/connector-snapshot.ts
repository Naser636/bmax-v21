import { ConnectorEvent } from "@/core/connector-event";

export function createConnectorSnapshot(
  events: ConnectorEvent[]
) {
  return [...events];
}
