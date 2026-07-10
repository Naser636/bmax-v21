import { BoampEvent } from "@/core/boamp-event";

const events: BoampEvent[] = [];

export function addBoampEvent(event: BoampEvent) {
  events.push(event);
}

export function getBoampEvents() {
  return events;
}
