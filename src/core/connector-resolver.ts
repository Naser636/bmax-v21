import { ConnectorConfig } from "@/core/connector-config";
import { loadConnector } from "@/core/connector-loader";

export function resolveConnector(
  config: ConnectorConfig
) {
  return loadConnector(config);
}
