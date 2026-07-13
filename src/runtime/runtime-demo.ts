import { RuntimeBootstrap } from "./runtime-bootstrap";
import fs from "node:fs";

const runtime = new RuntimeBootstrap();

const result = runtime.run({
  objective: "Build Runtime",
  missionId: "runtime.demo",
  missionName: "Runtime Bootstrap"
});

fs.mkdirSync("runtime/generated", { recursive: true });

fs.writeFileSync(
  "runtime/generated/runtime-execution.json",
  JSON.stringify(result, null, 2)
);

console.log("======================================");
console.log("RUNTIME BOOTSTRAP READY");
console.log("runtime/generated/runtime-execution.json");
console.log("======================================");
