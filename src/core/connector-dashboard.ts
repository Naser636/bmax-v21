import { ConnectorEvent } from "@/core/connector-event";

export function buildConnectorDashboard(
  events: ConnectorEvent[]
) {
  return {
    total: events.length,
    online: events.filter(e => e.status === "UP").length,
    offline: events.filter(e => e.status === "DOWN").length,
  };
}
