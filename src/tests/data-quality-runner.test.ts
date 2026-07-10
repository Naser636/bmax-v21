import { runDataQualification } from "@/core/data-quality-runner";

console.assert(runDataQualification([]).length === 0);

console.log("Data Quality Runner OK");
