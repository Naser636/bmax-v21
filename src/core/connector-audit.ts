import { ConnectorEvent } from "@/core/connector-event";

export function auditConnector(
  events: ConnectorEvent[]
) {
  return {
    audited: events.length,
    hasFailures: events.some(e => e.status === "DOWN"),
  };
}
