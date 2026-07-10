import { ConnectorInterface } from "@/contracts/connector-interface";

export async function checkConnectorHealth(
  connector: ConnectorInterface
): Promise<"UP" | "DOWN"> {
  return (await connector.health()) ? "UP" : "DOWN";
}
