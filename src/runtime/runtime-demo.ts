import { RuntimeHost } from "./runtime-host";
import fs from "node:fs";

const runtime = new RuntimeHost();

const result = runtime.run({
  objective: "Build Runtime",
  missionId: "runtime.demo",
  missionName: "Runtime Host"
});

fs.mkdirSync("runtime/generated", { recursive: true });

fs.writeFileSync(
  "runtime/generated/runtime-execution.json",
  JSON.stringify(result, null, 2)
);

console.log("======================================");
console.log("RUNTIME HOST READY");
console.log("runtime/generated/runtime-execution.json");
console.log("======================================");
