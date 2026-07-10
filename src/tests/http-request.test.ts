import { HttpRequest } from "@/core/http-request";

const request: HttpRequest = {
  method: "GET",
  url: "https://example.com",
};

console.assert(request.method === "GET");

console.log("HTTP Request OK");
