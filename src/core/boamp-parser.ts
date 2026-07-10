import { BoampResult } from "@/core/boamp-result";

export function parseBoampResults(data: unknown): BoampResult[] {
  return Array.isArray(data) ? (data as BoampResult[]) : [];
}
