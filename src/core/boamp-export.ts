import { BoampResult } from "@/core/boamp-result";

export function exportBoamp(results: BoampResult[]): string {
  return JSON.stringify(results);
}
