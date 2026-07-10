import { DataQualityService } from "@/core/data-quality-service";

const service = new DataQualityService([]);

console.assert(service.getAll().length === 0);

console.log("Data Quality Service OK");
