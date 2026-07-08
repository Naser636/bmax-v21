import { getAuditEntries } from "@/core/audit-service";
import { getTimelineEvents } from "@/core/timeline-service";
import { getEvents } from "@/core/event-registry";

export function getTrace() {
  return {
    audit: getAuditEntries(),
    timeline: getTimelineEvents(),
    events: getEvents(),
  };
}
