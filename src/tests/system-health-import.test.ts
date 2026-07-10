import { importHealth } from "@/core/system-health-import";

const data = importHealth("[]");

console.assert(data.length === 0);

console.log("System Health Import OK");
