import { SystemHealth } from "@/contracts/system-health";

export function getOverallHealthStatus(
  checks: SystemHealth[]
): "HEALTHY" | "DEGRADED" {
  return checks.every(c => c.healthy)
    ? "HEALTHY"
    : "DEGRADED";
}
