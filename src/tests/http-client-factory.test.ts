import { createHttpClient } from "@/core/http-client-factory";

const client = createHttpClient();

console.assert(client !== undefined);

console.log("HTTP Client Factory OK");
