import { ConnectorInterface } from "@/contracts/connector-interface";
import { checkConnectorHealth } from "@/core/connector-health-engine";

export async function getConnectorHealth(
  connector: ConnectorInterface
) {
  return checkConnectorHealth(connector);
}
