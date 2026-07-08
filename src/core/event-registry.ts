export interface EventRecord {
  id: string;
  type: string;
  timestamp: number;
  payload: unknown;
}

const events: EventRecord[] = [];

export function addEvent(event: EventRecord): void {
  events.push(event);
}

export function getEvents(): EventRecord[] {
  return [...events];
}
