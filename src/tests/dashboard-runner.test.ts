import { runDashboard } from "@/core/dashboard-runner";

const dashboard = runDashboard();

console.assert(dashboard.capability !== undefined);
console.assert(dashboard.decision !== undefined);
console.assert(Array.isArray(dashboard.values));
console.assert(Array.isArray(dashboard.audits));

console.log("Dashboard Runner OK");
