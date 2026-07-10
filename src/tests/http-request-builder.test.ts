import { HttpRequestBuilder } from "@/core/http-request-builder";

const builder = new HttpRequestBuilder();

const request = builder.build(
  "GET",
  "https://example.com"
);

console.assert(request.method === "GET");
console.assert(request.url === "https://example.com");

console.log("HTTP Request Builder OK");
