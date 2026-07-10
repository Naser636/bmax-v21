import { BoampResult } from "@/core/boamp-result";

export function buildBoampDashboard(results: BoampResult[]) {
  return {
    total: results.length,
  };
}
