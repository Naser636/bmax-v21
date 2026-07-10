import { ConnectorEvent } from "@/core/connector-event";

export function collectConnectorTelemetry(
  events: ConnectorEvent[]
) {
  return {
    events: events.length,
    lastEvent: events.at(-1) ?? null,
  };
}
