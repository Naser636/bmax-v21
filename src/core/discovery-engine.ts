import { Connector } from "@/contracts/connector";

export function createConnector(
  name: string,
  type: Connector["type"]
): Connector {
  return {
    id: crypto.randomUUID(),
    name,
    type,
    enabled: true,
    createdAt: Date.now(),
  };
}
