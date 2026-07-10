import { createConnector } from "@/core/discovery-engine";
import { addConnector } from "@/core/connector-registry";

export function initializeConnector(
  name: string,
  type: "API" | "WEB"
) {
  const connector = createConnector(name, type);
  addConnector(connector);
  return connector;
}
