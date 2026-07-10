import { ConnectorInterface } from "@/contracts/connector-interface";

export async function getConnectorStatistics(
  connectors: ConnectorInterface[]
) {
  const health = await Promise.all(
    connectors.map(c => c.health())
  );

  return {
    total: connectors.length,
    healthy: health.filter(Boolean).length,
    unhealthy: health.filter(v => !v).length,
  };
}
