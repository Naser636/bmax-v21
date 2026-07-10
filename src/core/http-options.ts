import { HttpHeaders } from "@/core/http-headers";

export interface HttpOptions {
  headers?: HttpHeaders;
  timeout?: number;
}
