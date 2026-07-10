import { buildDataQualityDashboard } from "@/core/data-quality-dashboard";

const dashboard = buildDataQualityDashboard([]);

console.assert(dashboard.total === 0);

console.log("Data Quality Dashboard OK");
