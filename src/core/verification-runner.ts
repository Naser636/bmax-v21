import { Connector } from "@/contracts/connector";
import { initializeVerification } from "@/core/verification-service";

export function runVerification(connector: Connector) {
  return initializeVerification(connector.name, 0.95);
}
