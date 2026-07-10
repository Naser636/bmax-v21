import { HttpClient } from "@/contracts/http-client";
import { UniversalHttpClient } from "@/core/http-client";

export function createHttpClient(): HttpClient {
  return new UniversalHttpClient();
}
