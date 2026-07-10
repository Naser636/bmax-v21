import { runSystemHealth } from "@/core/system-health-runner";

const result = runSystemHealth([]);

console.assert(result.length === 0);

console.log("System Health Runner OK");
