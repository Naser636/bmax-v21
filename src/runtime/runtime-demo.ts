import { RuntimeDaemon } from "./runtime-daemon";
import fs from "node:fs";

const runtime = new RuntimeDaemon();

const result = runtime.execute({
  objective: "Build Runtime",
  missionId: "runtime.demo",
  missionName: "Runtime Daemon"
});

fs.mkdirSync("runtime/generated", { recursive: true });

fs.writeFileSync(
  "runtime/generated/runtime-execution.json",
  JSON.stringify(result, null, 2)
);

console.log("======================================");
console.log("RUNTIME DAEMON READY");
console.log("runtime/generated/runtime-execution.json");
console.log("======================================");
