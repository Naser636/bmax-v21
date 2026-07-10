import { getBoampConnector } from "@/core/boamp-registry";

console.assert(getBoampConnector() !== undefined);

console.log("BOAMP Registry OK");
