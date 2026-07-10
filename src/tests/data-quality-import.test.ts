import { importDataQuality } from "@/core/data-quality-import";

console.assert(importDataQuality("[]").length === 0);

console.log("Data Quality Import OK");
