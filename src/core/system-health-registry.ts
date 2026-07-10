import { SystemHealth } from "@/contracts/system-health";

const registry = new Map<string, SystemHealth>();

export function registerHealth(
  health: SystemHealth
): void {
  registry.set(health.component, health);
}

export function getHealth(
  component: string
): SystemHealth | undefined {
  return registry.get(component);
}
