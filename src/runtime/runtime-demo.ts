import { RuntimeShell } from "./runtime-shell";
import fs from "node:fs";

const runtime = new RuntimeShell();

const result = runtime.execute({
  objective: "Build Runtime",
  missionId: "runtime.demo",
  missionName: "Runtime Shell"
});

fs.mkdirSync("runtime/generated", { recursive: true });

fs.writeFileSync(
  "runtime/generated/runtime-execution.json",
  JSON.stringify(result, null, 2)
);

console.log("======================================");
console.log("RUNTIME SHELL READY");
console.log("runtime/generated/runtime-execution.json");
console.log("======================================");
