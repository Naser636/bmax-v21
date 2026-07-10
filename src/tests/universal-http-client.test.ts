import { UniversalHttpClient } from "@/core/http-client";

const client = new UniversalHttpClient();

console.assert(client instanceof UniversalHttpClient);

console.log("Universal HTTP Client OK");
