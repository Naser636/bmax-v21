import { RuntimeAutopilot } from "./runtime-autopilot";
import fs from "node:fs";

const runtime = new RuntimeAutopilot();

const result = runtime.run({
  objective: "Autonomous Runtime",
  missionId: "runtime.demo",
  missionName: "Runtime Autopilot"
});

fs.mkdirSync("runtime/generated", { recursive: true });

fs.writeFileSync(
  "runtime/generated/runtime-execution.json",
  JSON.stringify(result, null, 2)
);

console.log("======================================");
console.log("RUNTIME AUTOPILOT READY");
console.log("runtime/generated/runtime-execution.json");
console.log("======================================");
