import { RuntimeOS } from "./runtime-os";
import fs from "node:fs";

const runtime = new RuntimeOS();

const result = runtime.run({
  objective: "Build Runtime",
  missionId: "runtime.demo",
  missionName: "Runtime OS"
});

fs.mkdirSync("runtime/generated", { recursive: true });

fs.writeFileSync(
  "runtime/generated/runtime-execution.json",
  JSON.stringify(result, null, 2)
);

console.log("======================================");
console.log("RUNTIME OS READY");
console.log("runtime/generated/runtime-execution.json");
console.log("======================================");
