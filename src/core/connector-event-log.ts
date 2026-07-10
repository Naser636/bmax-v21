import { ConnectorEvent } from "@/core/connector-event";

const events: ConnectorEvent[] = [];

export function addConnectorEvent(event: ConnectorEvent): void {
  events.push(event);
}

export function getConnectorEvents(): ConnectorEvent[] {
  return events;
}
