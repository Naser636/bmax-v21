import { RuntimeGovernor } from "./runtime-governor";
import fs from "node:fs";

const runtime = new RuntimeGovernor();

const result = runtime.execute({
  objective: "Autonomous Runtime",
  missionId: "runtime.demo",
  missionName: "Runtime Governor"
});

fs.mkdirSync("runtime/generated", { recursive: true });

fs.writeFileSync(
  "runtime/generated/runtime-execution.json",
  JSON.stringify(result, null, 2)
);

console.log("======================================");
console.log("RUNTIME GOVERNOR READY");
console.log("runtime/generated/runtime-execution.json");
console.log("======================================");
