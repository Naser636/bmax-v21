import { HttpHeaders } from "@/core/http-headers";

export function withBearerToken(
  headers: HttpHeaders,
  token: string
): HttpHeaders {
  return {
    ...headers,
    Authorization: `Bearer ${token}`,
  };
}
