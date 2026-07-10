import {
  addHealthEvent,
  getHealthEvents,
} from "@/core/system-health-event-log";

addHealthEvent({
  component: "http",
  timestamp: Date.now(),
  healthy: true,
});

console.assert(getHealthEvents().length === 1);

console.log("System Health Event Log OK");
