import { BoampResult } from "@/core/boamp-result";

export interface IntegrationResult {
  healthy: boolean;
  results: BoampResult[];
}
