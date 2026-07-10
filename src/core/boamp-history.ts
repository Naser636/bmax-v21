import { BoampResult } from "@/core/boamp-result";

const history: BoampResult[][] = [];

export function addBoampHistory(results: BoampResult[]) {
  history.push(results);
}

export function getBoampHistory() {
  return history;
}
