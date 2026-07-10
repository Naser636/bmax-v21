import { createHealthCheck } from "@/core/system-health-check";

const check = createHealthCheck("http", true);

console.assert(check.healthy);

console.log("System Health Check OK");
