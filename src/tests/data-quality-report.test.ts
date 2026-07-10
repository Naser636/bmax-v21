import { buildDataQualityReport } from "@/core/data-quality-report";

const report = buildDataQualityReport([]);

console.assert(report.total === 0);

console.log("Data Quality Report OK");
