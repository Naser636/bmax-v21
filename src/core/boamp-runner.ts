import { DefaultBoampConnector } from "@/core/boamp-connector";

export async function runBoampSearch(query: string) {
  return new DefaultBoampConnector().search(query);
}
