import { DataQualityMonitor } from "@/core/data-quality-monitor";

const monitor = new DataQualityMonitor();

console.assert(monitor.isHealthy());

console.log("Data Quality Monitor OK");
