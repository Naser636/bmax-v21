import { RuntimeCLI } from "./runtime-cli";
import fs from "node:fs";

const runtime = new RuntimeCLI();

const result = runtime.run(
  "Build Runtime",
  "runtime.demo",
  "Runtime CLI"
);

fs.mkdirSync("runtime/generated", { recursive: true });

fs.writeFileSync(
  "runtime/generated/runtime-execution.json",
  JSON.stringify(result, null, 2)
);

console.log("======================================");
console.log("RUNTIME CLI READY");
console.log("runtime/generated/runtime-execution.json");
console.log("======================================");
