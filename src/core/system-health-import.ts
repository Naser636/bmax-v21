import { SystemHealth } from "@/contracts/system-health";

export function importHealth(
  json: string
): SystemHealth[] {
  return JSON.parse(json) as SystemHealth[];
}
