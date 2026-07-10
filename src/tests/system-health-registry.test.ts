import {
  registerHealth,
  getHealth,
} from "@/core/system-health-registry";

registerHealth({
  component: "http",
  healthy: true,
  message: "OK",
});

console.assert(getHealth("http")?.healthy);

console.log("System Health Registry OK");
