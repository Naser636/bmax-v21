import { integrationService } from "@/core/integration-service";

export async function integrationDemo() {
  return integrationService("informatique");
}
