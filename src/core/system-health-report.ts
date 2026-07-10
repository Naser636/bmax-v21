import { SystemHealth } from "@/contracts/system-health";

export function buildSystemHealthReport(
  checks: SystemHealth[]
) {
  return {
    total: checks.length,
    healthy: checks.filter(c => c.healthy).length,
    unhealthy: checks.filter(c => !c.healthy).length,
  };
}
