import { HttpHeaders } from "@/core/http-headers";
import { HttpRequest } from "@/core/http-request";

export class HttpRequestBuilder {
  build(
    method: "GET" | "POST",
    url: string,
    headers: HttpHeaders = {},
    body?: unknown
  ): HttpRequest {
    return {
      method,
      url,
      headers,
      body,
    };
  }
}
