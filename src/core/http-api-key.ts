import { HttpHeaders } from "@/core/http-headers";

export function withApiKey(
  headers: HttpHeaders,
  apiKey: string
): HttpHeaders {
  return {
    ...headers,
    "X-API-Key": apiKey,
  };
}
