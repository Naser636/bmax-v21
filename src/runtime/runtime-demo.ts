import { RuntimeSupervisor } from "./runtime-supervisor";
import fs from "node:fs";

const runtime = new RuntimeSupervisor();

const result = runtime.execute({
  objective: "Autonomous Runtime",
  missionId: "runtime.demo",
  missionName: "Runtime Supervisor"
});

fs.mkdirSync("runtime/generated", { recursive: true });

fs.writeFileSync(
  "runtime/generated/runtime-execution.json",
  JSON.stringify(result, null, 2)
);

console.log("======================================");
console.log("RUNTIME SUPERVISOR READY");
console.log("runtime/generated/runtime-execution.json");
console.log("======================================");
