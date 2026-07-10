import { ConnectorConfig } from "@/core/connector-config";

export function validateConnectorConfig(
  config: ConnectorConfig
): boolean {
  return (
    config.name.length > 0 &&
    config.timeout > 0
  );
}
