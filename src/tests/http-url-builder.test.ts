import { buildUrl } from "@/core/http-url-builder";

const url = buildUrl(
  "https://example.com",
  {
    search: "api",
    page: 2,
  }
);

console.assert(url.includes("search=api"));
console.assert(url.includes("page=2"));

console.log("HTTP URL Builder OK");
