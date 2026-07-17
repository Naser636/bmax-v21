#!/usr/bin/env node

const fs=require("fs");

const registry=JSON.parse(
    fs.readFileSync(
        "runtime/generated/capability-registry.json",
        "utf8"
    )
);

const pipeline=[
    ["Mission Interpreter","runtime/core/mission-interpreter.js"],
    ["Mission Loader","runtime/core/mission-loader.js"],
    ["Execution Planner","runtime/core/execution-planner.js"],
    ["Capability Registry","runtime/core/capability-registry.js"],
    ["Knowledge Engine","runtime/core/knowledge-engine.js"]
];

if((registry.available||[]).includes("ProjectContext Engine")){
    pipeline.push([
        "ProjectContext Engine",
        "runtime/core/project-context-engine.js"
    ]);
}

pipeline.push(
    ["Decision Engine","runtime/core/decision-engine.js"],
    ["Patch Engine","runtime/core/patch-engine.js"],
    ["Patch Executor","runtime/core/patch-executor.js"],
    ["Validation Engine","runtime/core/validation-engine.js"],
    ["Mission Ledger","runtime/core/mission-ledger.js"]
);

fs.writeFileSync(
    "runtime/generated/runtime-pipeline.json",
    JSON.stringify(pipeline,null,2)
);

console.log("PIPELINE BUILDER READY");
console.log("Stages :",pipeline.length);

module.exports=pipeline;
