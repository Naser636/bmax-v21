import { SystemHealth } from "@/contracts/system-health";

export function buildHealthDashboard(
  checks: SystemHealth[]
) {
  return {
    total: checks.length,
    healthy: checks.filter(c => c.healthy).length,
  };
}
