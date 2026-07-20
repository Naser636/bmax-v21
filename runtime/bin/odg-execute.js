const fs=require("fs");

(async()=>{

const {RuntimeExecutor}=await import("../../src/runtime/runtime-executor.ts");

const runtime=new RuntimeExecutor();

const result=runtime.execute(
"runtime.demo",
"Sprint13 Demonstration"
);

fs.writeFileSync(
"runtime/generated/runtime-execution.json",
JSON.stringify(result,null,2)
);

console.log("MISSION EXECUTED");
console.log("runtime/generated/runtime-execution.json");

})();
