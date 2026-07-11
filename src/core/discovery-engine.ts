import { DiscoveryResult } from "@/contracts/discovery";
import { Connector } from "@/contracts/connector";

export function createConnector(
  name: string,
  type: "API" | "WEB"
): Connector {
  return {
    id: crypto.randomUUID(),
    name,
    type,
    enabled: true,
    createdAt: Date.now(),
  };
}

export class DiscoveryEngine {
  async execute(): Promise<DiscoveryResult> {
    return {
      source: "BOAMP",
      items: [],
    };
  }
}
