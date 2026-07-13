import { RuntimeKernel } from "./runtime-kernel";
import fs from "node:fs";

const runtime = new RuntimeKernel();

const result = runtime.execute(
  "runtime.demo",
  "Mission Engine Kernel"
);

fs.mkdirSync("runtime/generated", { recursive: true });

fs.writeFileSync(
  "runtime/generated/runtime-execution.json",
  JSON.stringify(result, null, 2)
);

console.log("======================================");
console.log("RUNTIME KERNEL READY");
console.log("runtime/generated/runtime-execution.json");
console.log("======================================");
