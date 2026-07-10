import { SystemHealthEvent } from "@/core/system-health-event";

const event: SystemHealthEvent = {
  component: "http",
  timestamp: Date.now(),
  healthy: true,
};

console.assert(event.healthy);

console.log("System Health Event OK");
