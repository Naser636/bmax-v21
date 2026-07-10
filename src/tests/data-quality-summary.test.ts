import { summarizeDataQuality } from "@/core/data-quality-summary";

console.assert(summarizeDataQuality([]) === "0 records");

console.log("Data Quality Summary OK");
