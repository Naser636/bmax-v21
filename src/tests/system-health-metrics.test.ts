import { computeHealthMetrics } from "@/core/system-health-metrics";

const metrics = computeHealthMetrics([
  { component: "http", healthy: true, message: "OK" },
]);

console.assert(metrics.total === 1);
console.assert(metrics.healthy === 1);

console.log("System Health Metrics OK");
