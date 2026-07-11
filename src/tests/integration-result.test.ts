import { IntegrationResult } from "@/core/integration-result";

const result: IntegrationResult = {
  healthy: true,
  results: [],
};

console.assert(result.healthy);

console.log("Integration Result OK");
