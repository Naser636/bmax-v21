import { SystemHealthEngine } from "@/core/system-health-engine";

const engine = new SystemHealthEngine();

const result = engine.execute([
  {
    component: "http",
    healthy: true,
    message: "OK",
  },
]);

console.assert(result.length === 1);

console.log("System Health Engine OK");
