import { monitorSystemHealth } from "@/core/system-health-monitor";

console.assert(
  monitorSystemHealth([
    {
      component: "http",
      healthy: true,
      message: "OK",
    },
  ])
);

console.log("System Health Monitor OK");
