import { BoampSearchService } from "@/core/boamp-search-service";

const service = new BoampSearchService();

console.assert(service.connector !== undefined);

console.log("BOAMP Search Service OK");
