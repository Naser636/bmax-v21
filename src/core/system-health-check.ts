import { SystemHealth } from "@/contracts/system-health";

export function createHealthCheck(
  component: string,
  healthy: boolean,
  message = "OK"
): SystemHealth {
  return { component, healthy, message };
}
