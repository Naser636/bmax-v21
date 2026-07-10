import { ConnectorConfig } from "@/core/connector-config";
import { createConnector } from "@/core/connector-factory";

export function loadConnector(config: ConnectorConfig) {
  return createConnector(config.type);
}
