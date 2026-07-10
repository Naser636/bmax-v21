import { SystemHealthEvent } from "@/core/system-health-event";

const events: SystemHealthEvent[] = [];

export function addHealthEvent(event: SystemHealthEvent) {
  events.push(event);
}

export function getHealthEvents() {
  return events;
}
