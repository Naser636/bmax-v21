import { DefaultBoampConnector } from "@/core/boamp-connector";

const connector = new DefaultBoampConnector();

export function getBoampConnector() {
  return connector;
}
