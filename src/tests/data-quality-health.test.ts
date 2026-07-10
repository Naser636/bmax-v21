import { isDataQualityHealthy } from "@/core/data-quality-health";

console.assert(isDataQualityHealthy(100));
console.assert(!isDataQualityHealthy(50));

console.log("Data Quality Health OK");
