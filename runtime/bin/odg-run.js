#!/usr/bin/env node

const {spawnSync}=require("child_process");
const fs=require("fs");
const {authorizeMission}=require("../core/governance-kernel");
const {bootstrap}=require("./odg-bootstrap");

// COLD-START PREP (Runtime Bootstrap)
// Ensure the git-ignored runtime/generated directory and its single orphan
// prerequisite (project-context.json) exist BEFORE anything reads or writes
// there — including the pipeline-builder require below, which writes
// runtime/generated/runtime-pipeline.json at import time (a fresh clone has no
// runtime/generated dir, since git does not track empty directories).
// bootstrap() is idempotent: on an already-populated tree it is a no-op, so the
// pipeline, stage ordering and existing outputs are all unchanged.
bootstrap();

const pipeline=require("../core/pipeline-builder");

const mission=process.argv[2]||"BUILD_RUNTIME";



const governance=authorizeMission(mission);

let runtimeContext=null;
try{
    runtimeContext=JSON.parse(
        fs.readFileSync("runtime/generated/runtime-context.json","utf8")
    );
}catch{}


if(!governance.authorized){
    console.error("STOP: Mission refused by Governance Kernel");
    process.exit(1);
}

console.log("Governance : AUTHORIZED");
console.log("Next State :",governance.nextStates.join(", "));

if(runtimeContext){
    console.log("RuntimeContext : READY");
    console.log("Project Files  :",runtimeContext.project.files);
    console.log("Project Dirs   :",runtimeContext.project.directories);
}

console.log("======================================");
console.log("ODG RUNTIME PIPELINE");
console.log("======================================");

for(const [name,file] of pipeline){

    console.log("\n>>>",name);

    const r=spawnSync(
        "node",
        [file,mission],
        {stdio:"inherit"}
    );

    if(r.status!==0){
        console.error("STOP:",name,"failed");
        process.exit(r.status);
    }
}

console.log("\n======================================");
console.log("PIPELINE SUCCESS");
console.log("======================================");
