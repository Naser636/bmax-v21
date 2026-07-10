import { SystemHealth } from "@/contracts/system-health";

export function summarizeHealth(
  checks: SystemHealth[]
): string {
  return `${checks.filter(c => c.healthy).length}/${checks.length} healthy`;
}
