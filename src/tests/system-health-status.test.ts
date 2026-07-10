import { getOverallHealthStatus } from "@/core/system-health-status";

console.assert(
  getOverallHealthStatus([
    { component: "http", healthy: true, message: "OK" },
  ]) === "HEALTHY"
);

console.log("System Health Status OK");
