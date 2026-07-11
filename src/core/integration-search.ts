import { runBoampSearch } from "@/core/boamp-runner";

export async function integrationSearch(query: string) {
  return runBoampSearch(query);
}
