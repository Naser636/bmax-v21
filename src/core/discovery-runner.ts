import { Mission } from "@/contracts/mission";
import { initializeConnector } from "@/core/discovery-service";

export function runDiscovery(mission: Mission) {
  const connector = initializeConnector(
    mission.title,
    "WEB"
  );

  return connector;
}
