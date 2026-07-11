import { isBoampHealthy } from "@/core/boamp-health";

export function integrationHealth(): boolean {
  return isBoampHealthy();
}
