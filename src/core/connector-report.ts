import { ConnectorEvent } from "@/core/connector-event";

export function createConnectorReport(
  events: ConnectorEvent[]
) {
  return {
    total: events.length,
    up: events.filter(e => e.status === "UP").length,
    down: events.filter(e => e.status === "DOWN").length,
  };
}
