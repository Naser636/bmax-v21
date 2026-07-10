import { ConnectorInterface } from "@/contracts/connector-interface";
import { runConnectorPipeline } from "@/core/connector-pipeline";

export async function runConnectorOrchestrator(
  connectors: ConnectorInterface[]
): Promise<boolean> {
  return runConnectorPipeline(connectors);
}
