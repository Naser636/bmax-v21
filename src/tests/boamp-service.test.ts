import { BoampService } from "@/core/boamp-service";

const service = new BoampService([]);

console.assert(service.getAll().length === 0);

console.log("BOAMP Service OK");
