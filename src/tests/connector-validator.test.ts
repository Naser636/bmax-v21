import { validateConnectorConfig } from "@/core/connector-validator";

console.assert(
  validateConnectorConfig({
    name: "api",
    type: "API",
    enabled: true,
    timeout: 5000,
  })
);

console.log("Connector Validator OK");
