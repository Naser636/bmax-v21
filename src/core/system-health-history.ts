import { SystemHealth } from "@/contracts/system-health";

const history: SystemHealth[] = [];

export function addHealthHistory(
  health: SystemHealth
): void {
  history.push(health);
}

export function getHealthHistory(): SystemHealth[] {
  return history;
}
