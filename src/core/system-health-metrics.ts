import { SystemHealth } from "@/contracts/system-health";

export function computeHealthMetrics(checks: SystemHealth[]) {
  const healthy = checks.filter(c => c.healthy).length;

  return {
    total: checks.length,
    healthy,
    failed: checks.length - healthy,
    ratio: checks.length === 0 ? 1 : healthy / checks.length,
  };
}
