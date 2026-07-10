import { SystemHealth } from "@/contracts/system-health";

export function exportHealth(
  checks: SystemHealth[]
): string {
  return JSON.stringify(checks);
}
