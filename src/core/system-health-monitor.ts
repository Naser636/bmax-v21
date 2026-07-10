import { SystemHealth } from "@/contracts/system-health";

export function monitorSystemHealth(
  checks: SystemHealth[]
): boolean {
  return checks.every(c => c.healthy);
}
