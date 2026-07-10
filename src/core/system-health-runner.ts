import { SystemHealthEngine } from "@/core/system-health-engine";
import { SystemHealth } from "@/contracts/system-health";

export function runSystemHealth(
  checks: SystemHealth[]
) {
  return new SystemHealthEngine().execute(checks);
}
