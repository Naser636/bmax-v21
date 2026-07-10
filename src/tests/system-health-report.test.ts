import { buildSystemHealthReport } from "@/core/system-health-report";

const report = buildSystemHealthReport([
  {
    component: "http",
    healthy: true,
    message: "OK",
  },
]);

console.assert(report.total === 1);
console.assert(report.healthy === 1);

console.log("System Health Report OK");
