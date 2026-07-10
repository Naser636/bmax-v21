import { exportHealth } from "@/core/system-health-export";

const json = exportHealth([]);

console.assert(json === "[]");

console.log("System Health Export OK");
