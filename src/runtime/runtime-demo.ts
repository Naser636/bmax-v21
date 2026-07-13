import { MissionController } from "./mission-controller";
import fs from "node:fs";

const runtime = new MissionController();

const result = runtime.execute({
  id: "runtime.demo",
  name: "Mission Controller Bootstrap"
});

fs.mkdirSync("runtime/generated", { recursive: true });

fs.writeFileSync(
  "runtime/generated/runtime-execution.json",
  JSON.stringify(result, null, 2)
);

console.log("======================================");
console.log("MISSION CONTROLLER READY");
console.log("runtime/generated/runtime-execution.json");
console.log("======================================");
