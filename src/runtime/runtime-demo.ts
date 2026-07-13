import { RuntimeDirector } from "./runtime-director";
import fs from "node:fs";

const runtime = new RuntimeDirector();

const result = runtime.execute({
  objective: "Autonomous Runtime",
  missionId: "runtime.demo",
  missionName: "Runtime Director"
});

fs.mkdirSync("runtime/generated", { recursive: true });

fs.writeFileSync(
  "runtime/generated/runtime-execution.json",
  JSON.stringify(result, null, 2)
);

console.log("======================================");
console.log("RUNTIME DIRECTOR READY");
console.log("runtime/generated/runtime-execution.json");
console.log("======================================");
