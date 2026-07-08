export interface TimelineEvent {
  timestamp: number;
  type: string;
  message: string;
}

const timeline: TimelineEvent[] = [];

export function addTimelineEvent(event: TimelineEvent): void {
  timeline.push(event);
}

export function getTimeline(): TimelineEvent[] {
  return [...timeline];
}
