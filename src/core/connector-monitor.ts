import { ConnectorInterface } from "@/contracts/connector-interface";

export async function monitorConnectors(
  connectors: ConnectorInterface[]
): Promise<Record<number, "UP" | "DOWN">> {
  const result: Record<number, "UP" | "DOWN"> = {};

  for (let i = 0; i < connectors.length; i++) {
    result[i] = (await connectors[i].health()) ? "UP" : "DOWN";
  }

  return result;
}
