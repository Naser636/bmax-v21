import { buildHealthDashboard } from "@/core/system-health-dashboard";

const dashboard = buildHealthDashboard([
  {
    component: "http",
    healthy: true,
    message: "OK",
  },
]);

console.assert(dashboard.total === 1);

console.log("System Health Dashboard OK");
