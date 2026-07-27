#!/usr/bin/env node

const {spawnSync}=require("child_process");
const fs=require("fs");
const {authorizeMission}=require("../core/governance-kernel");
const {bootstrap}=require("./odg-bootstrap");
const checkpoint=require("../core/checkpoint-engine");
const {loadRuntimeContext}=require("../core/runtime-context-loader");

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
    // Guarantee RuntimeContext before the pipeline: the existing loader generates
    // runtime/generated/runtime-context.json on demand (via project-context-engine.js) if absent.
    runtimeContext=loadRuntimeContext(mission);
}catch(e){
    console.error("RuntimeContext : UNAVAILABLE ("+e.message+")");
}


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

// CHECKPOINT / RESUME
// Open (or resume) the durable checkpoint for this mission. `resumeIndex` is the first stage that is
// not already proven DONE: on a fresh run it is 0; after an interruption (network drop, killed
// provider, VPS reboot, Ctrl+C) it points past the proven-DONE prefix so no completed work re-runs.
const stageNames=pipeline.map(([name])=>name);
let {cp,resumeIndex}=checkpoint.begin(mission,stageNames);

// Persist an INTERRUPTED checkpoint on any abrupt stop so the next run resumes at the RUNNING stage.
// The signal handlers re-raise the default action after saving so exit codes stay conventional.
for(const sig of ["SIGINT","SIGTERM","SIGHUP"]){
    process.on(sig,()=>{
        checkpoint.interrupt(cp,sig);
        console.error(`\nSTOP: received ${sig} — checkpoint saved (resume with the same mission).`);
        process.exit(130);
    });
}
process.on("uncaughtException",(e)=>{
    checkpoint.interrupt(cp,"uncaughtException: "+(e&&e.message));
    throw e;
});

if(resumeIndex>0){
    console.log(`RESUMING : ${resumeIndex}/${stageNames.length} stage(s) already complete`);
    console.log("Skipping :",stageNames.slice(0,resumeIndex).join(", "));
}

for(let i=0;i<pipeline.length;i++){
    const [name,file]=pipeline[i];

    if(i<resumeIndex){
        continue; // proven DONE in a previous run — do not re-execute
    }

    console.log("\n>>>",name);
    cp=checkpoint.stageRunning(cp,i);

    const r=spawnSync(
        "node",
        [file,mission],
        {stdio:"inherit"}
    );

    if(r.status!==0){
        cp=checkpoint.stageFailed(cp,i,`${name} exited with status ${r.status}`);
        console.error("STOP:",name,"failed");
        process.exit(r.status);
    }

    cp=checkpoint.stageDone(cp,i);
}

checkpoint.complete(cp);

console.log("\n======================================");
console.log("PIPELINE SUCCESS");
console.log("======================================");
