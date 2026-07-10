import { computeDataQualityMetrics } from "@/core/data-quality-metrics";

const metrics = computeDataQualityMetrics([]);

console.assert(metrics.score === 100);

console.log("Data Quality Metrics OK");
