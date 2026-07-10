import { BoampResult } from "@/core/boamp-result";

export function summarizeBoamp(results: BoampResult[]): string {
  return `${results.length} results`;
}
