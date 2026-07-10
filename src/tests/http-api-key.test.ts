import { withApiKey } from "@/core/http-api-key";

const headers = withApiKey({}, "secret");

console.assert(headers["X-API-Key"] === "secret");

console.log("HTTP API Key OK");
