import { SystemHealth } from "@/contracts/system-health";

export function shouldAlert(checks: SystemHealth[]): boolean {
  return checks.some(c => !c.healthy);
}
