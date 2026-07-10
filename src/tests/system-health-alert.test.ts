import { shouldAlert } from "@/core/system-health-alert";

console.assert(
  shouldAlert([
    { component: "http", healthy: false, message: "DOWN" },
  ])
);

console.log("System Health Alert OK");
