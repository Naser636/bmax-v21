import { ConnectorConfig } from "@/core/connector-config";
import { loadConnector } from "@/core/connector-loader";

export function bootstrapConnectors(
  configs: ConnectorConfig[]
) {
  return configs.map(loadConnector);
}
