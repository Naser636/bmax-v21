import { ConnectorEvent } from "@/core/connector-event";

const history: ConnectorEvent[] = [];

export function addHistory(event: ConnectorEvent): void {
  history.push(event);
}

export function getHistory(): ConnectorEvent[] {
  return history;
}
