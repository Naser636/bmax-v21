import { MissionDispatcher } from "./mission-dispatcher";
import fs from "node:fs";

const runtime = new MissionDispatcher();

const result = runtime.dispatch(
  "runtime.demo",
  "Mission Engine Dispatcher"
);

fs.mkdirSync("runtime/generated", { recursive: true });

fs.writeFileSync(
  "runtime/generated/runtime-execution.json",
  JSON.stringify(result, null, 2)
);

console.log("======================================");
console.log("MISSION DISPATCHER READY");
console.log("runtime/generated/runtime-execution.json");
console.log("======================================");
