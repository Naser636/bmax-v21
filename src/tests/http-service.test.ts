import { createHttpClient } from "@/core/http-client-factory";
import { HttpService } from "@/core/http-service";

const service = new HttpService(createHttpClient());

console.assert(service.clientInstance !== undefined);

console.log("HTTP Service OK");
