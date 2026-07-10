import { HttpResponse } from "@/core/http-response";
import { isSuccessStatus } from "@/core/http-status";

export function validateResponse<T>(
  response: HttpResponse<T>
): boolean {
  return isSuccessStatus(response.status);
}
