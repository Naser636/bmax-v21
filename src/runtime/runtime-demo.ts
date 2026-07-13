import { RuntimeExecutor } from "./runtime-executor";
import fs from "node:fs";

const runtime = new RuntimeExecutor();

const result = runtime.execute(
  "runtime.demo",
  "Mission Engine Bootstrap"
);

fs.mkdirSync("runtime/generated", { recursive: true });

fs.writeFileSync(
  "runtime/generated/runtime-execution.json",
  JSON.stringify(result, null, 2)
);

console.log("======================================");
console.log("MISSION ENGINE READY");
console.log("runtime/generated/runtime-execution.json");
console.log("======================================");
