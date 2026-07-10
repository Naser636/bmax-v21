import { ConnectorInterface } from "@/contracts/connector-interface";

export async function collectConnectorMetrics(
  connectors: ConnectorInterface[]
) {
  const healthy = await Promise.all(
    connectors.map(c => c.health())
  );

  return {
    total: connectors.length,
    healthy: healthy.filter(Boolean).length,
  };
}
