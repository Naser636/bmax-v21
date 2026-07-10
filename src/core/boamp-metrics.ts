import { BoampResult } from "@/core/boamp-result";

export function computeBoampMetrics(results: BoampResult[]) {
  return {
    total: results.length,
  };
}
