import { BoampResult } from "@/core/boamp-result";

export function filterBoampResults(results: BoampResult[]): BoampResult[] {
  return results.filter(r => r.id.length > 0);
}
