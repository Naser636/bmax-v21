import { BoampResult } from "@/core/boamp-result";

export function normalizeBoampResult(result: BoampResult): BoampResult {
  return {
    ...result,
    title: result.title.trim(),
  };
}
