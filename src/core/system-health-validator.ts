import { SystemHealth } from "@/contracts/system-health";

export function validateHealth(
  checks: SystemHealth[]
): boolean {
  return checks.every(c => c.component.length > 0);
}
