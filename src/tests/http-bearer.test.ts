import { withBearerToken } from "@/core/http-bearer";

const headers = withBearerToken({}, "token");

console.assert(headers.Authorization === "Bearer token");

console.log("HTTP Bearer OK");
