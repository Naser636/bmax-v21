import { validateHealth } from "@/core/system-health-validator";

console.assert(
  validateHealth([
    {
      component: "http",
      healthy: true,
      message: "OK",
    },
  ])
);

console.log("System Health Validator OK");
