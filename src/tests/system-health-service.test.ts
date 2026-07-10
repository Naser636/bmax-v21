import { SystemHealthService } from "@/core/system-health-service";

const service = new SystemHealthService([]);

console.assert(service.getAll().length === 0);

console.log("System Health Service OK");
