import { RuntimeAgent } from "./runtime-agent";
import fs from "node:fs";

const runtime = new RuntimeAgent();

const result = runtime.execute({
  objective: "Build Runtime",
  missionId: "runtime.demo",
  missionName: "Runtime Agent"
});

fs.mkdirSync("runtime/generated", { recursive: true });

fs.writeFileSync(
  "runtime/generated/runtime-execution.json",
  JSON.stringify(result, null, 2)
);

console.log("======================================");
console.log("RUNTIME AGENT READY");
console.log("runtime/generated/runtime-execution.json");
console.log("======================================");
