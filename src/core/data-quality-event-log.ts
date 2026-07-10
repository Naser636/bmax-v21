import { DataQualityEvent } from "@/core/data-quality-event";

const events: DataQualityEvent[] = [];

export function addDataQualityEvent(event: DataQualityEvent): void {
  events.push(event);
}

export function getDataQualityEvents(): DataQualityEvent[] {
  return events;
}
