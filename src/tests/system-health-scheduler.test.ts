import { SystemHealthScheduler } from "@/core/system-health-scheduler";

const scheduler = new SystemHealthScheduler(60000);

console.assert(scheduler.intervalMs === 60000);

console.log("System Health Scheduler OK");
