import { ConnectorInterface } from "@/contracts/connector-interface";

export async function runConnectorPipeline(
  connectors: ConnectorInterface[]
): Promise<boolean> {
  for (const connector of connectors) {
    const ok = await connector.connect();
    if (!ok) return false;
  }

  return true;
}
