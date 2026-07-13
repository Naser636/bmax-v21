import { MissionRouter } from "./mission-router";
import fs from "node:fs";

const runtime = new MissionRouter();

const result = runtime.route({
  objective: "Execute Runtime Mission",
  missionId: "runtime.demo",
  missionName: "Mission Router Bootstrap"
});

fs.mkdirSync("runtime/generated", { recursive: true });

fs.writeFileSync(
  "runtime/generated/runtime-execution.json",
  JSON.stringify(result, null, 2)
);

console.log("======================================");
console.log("MISSION ROUTER READY");
console.log("runtime/generated/runtime-execution.json");
console.log("======================================");
