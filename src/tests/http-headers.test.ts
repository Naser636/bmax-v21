import { HttpHeaders } from "@/core/http-headers";

const headers: HttpHeaders = {
  Authorization: "Bearer token",
  Accept: "application/json",
};

console.assert(headers.Authorization.startsWith("Bearer"));

console.log("HTTP Headers OK");
