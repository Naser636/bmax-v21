import { getDashboardState } from "@/core/dashboard-adapter";

const dashboard = getDashboardState();

console.assert(dashboard.capability !== undefined);
console.assert(dashboard.decision !== undefined);
console.assert(dashboard.trace !== undefined);

console.log("Dashboard test OK");
