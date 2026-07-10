import { ConnectorConfig } from "@/core/connector-config";

export function canUseConnector(
  config: ConnectorConfig
): boolean {
  return config.enabled;
}
