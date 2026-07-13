import { RuntimeEntry } from "./runtime-entry";
import fs from "node:fs";

const runtime = new RuntimeEntry();

const result = runtime.execute({
  objective: "Autonomous Runtime",
  missionId: "runtime.demo",
  missionName: "Runtime Entry"
});

fs.mkdirSync("runtime/generated", { recursive: true });

fs.writeFileSync(
  "runtime/generated/runtime-execution.json",
  JSON.stringify(result, null, 2)
);

console.log("======================================");
console.log("RUNTIME ENTRY READY");
console.log("runtime/generated/runtime-execution.json");
console.log("======================================");
