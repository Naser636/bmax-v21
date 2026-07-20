#!/usr/bin/env node

const fs=require("fs");

// COLD-START FALLBACK (runtime-context.json)
// runtime-context.json is produced by the conditional ProjectContext Engine
// stage. When that stage does not run (fresh clone / empty runtime/generated, or
// a registry that does not enable ProjectContext Engine) the file is absent.
// runtimeContext is used ONLY by the two console.log lines below (Context Files /
// Context Dirs) and does NOT feed patch-plan.json. Fall back to an empty,
// zero-valued structure so the pipeline continues without inventing runtime data
// and without altering any generated output.
const RUNTIME_CONTEXT_PATH="runtime/generated/runtime-context.json";
const runtimeContext=fs.existsSync(RUNTIME_CONTEXT_PATH)
    ?JSON.parse(fs.readFileSync(RUNTIME_CONTEXT_PATH,"utf8"))
    :{project:{files:0,directories:0}};

const decision=JSON.parse(
fs.readFileSync("runtime/generated/decision.json","utf8")
);

const registry=JSON.parse(
fs.readFileSync("runtime/generated/capability-registry.json","utf8")
);

const patch={
    generatedAt:new Date().toISOString(),
    mission:decision.mission,
    status:"READY",
    priority:decision.priority,
    actions:decision.actions,
    summary:{
        analyzedFiles:decision.metrics.sourceFiles,
        missingCapabilities:registry.missingCapabilities.length
    },
    patches:decision.actions.map((action,index)=>({
        id:index+1,
        action,
        priority:decision.priority,
        status:"PLANNED"
    }))
};

fs.writeFileSync(
"runtime/generated/patch-plan.json",
JSON.stringify(patch,null,2)
);

console.log("======================================");
console.log("PATCH ENGINE v3");
console.log("======================================");
console.log("Mission  :",patch.mission);
console.log("Context Files :",runtimeContext.project.files);
console.log("Context Dirs  :",runtimeContext.project.directories);
console.log("Priority :",patch.priority);
console.log("Actions  :",patch.actions.length);

for(const a of patch.actions)
    console.log(" -",a);

console.log("======================================");
