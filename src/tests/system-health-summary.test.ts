import { summarizeHealth } from "@/core/system-health-summary";

const summary = summarizeHealth([
  {
    component: "http",
    healthy: true,
    message: "OK",
  },
]);

console.assert(summary === "1/1 healthy");

console.log("System Health Summary OK");
