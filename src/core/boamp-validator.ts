import { BoampResult } from "@/core/boamp-result";

export function validateBoampResult(result: BoampResult): boolean {
  return result.id.length > 0 && result.title.length > 0;
}
