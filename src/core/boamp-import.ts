import { BoampResult } from "@/core/boamp-result";

export function importBoamp(json: string): BoampResult[] {
  return JSON.parse(json) as BoampResult[];
}
