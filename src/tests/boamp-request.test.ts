import { BoampRequest } from "@/core/boamp-request";

const request: BoampRequest = { query: "informatique" };

console.assert(request.query === "informatique");

console.log("BOAMP Request OK");
