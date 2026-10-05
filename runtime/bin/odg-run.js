#!/usr/bin/env node

const {spawnSync}=require("child_process");
const fs=require("fs");
const path=require("path");
const {authorizeMission}=require("../core/governance-kernel");

// SAMURAI OUTPUT MODE (IMPLEMENT_SAMURAI_OUTPUT_MODE / IMPLEMENT_SUMMARY_OUTPUT_MODE).
//
// By DEFAULT the pipeline prints a compact one-line-per-stage summary (~20-30 lines total) and
// streams every stage's full stdout/stderr to an artifact log under runtime/generated/logs/ instead
// of the console. Set ODG_VERBOSE=1 to restore the historical behaviour (every stage streamed live
// via stdio:"inherit") — the exact same env-flag convention the runtime already uses for ODG_FLEET /
// ODG_CONTRACT_ON_DEMAND. No stage logic, ordering or checkpoint behaviour changes; only where each
// stage's detailed output is written.
const VERBOSE=process.env.ODG_VERBOSE==="1"||process.env.ODG_VERBOSE==="true";
function fmtDuration(ms){
    return ms>=1000?(ms/1000).toFixed(1)+"s":ms+"ms";
}
const {bootstrap}=require("./odg-bootstrap");
const checkpoint=require("../core/checkpoint-engine");
const stageEffect=require("../core/stage-effect");
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
console.log("ODG RUNTIME PIPELINE :",mission);
console.log("======================================");

// Detailed per-stage output is teed here in summary (default) mode so the console stays a ~20-30
// line summary while the full pipeline transcript is always preserved as an inspectable artifact.
const LOG_DIR=path.join("runtime","generated","logs");
const RUN_LOG=path.join(LOG_DIR,mission+".run.log");
if(!VERBOSE){
    fs.mkdirSync(LOG_DIR,{recursive:true});
    fs.writeFileSync(RUN_LOG,"ODG RUNTIME PIPELINE — "+mission+"\n");
    console.log("Output     : summary (full log →",RUN_LOG+")");
}else{
    console.log("Output     : verbose (ODG_VERBOSE=1)");
}

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

    cp=checkpoint.stageRunning(cp,i);
    const started=Date.now();

    let r;
    if(VERBOSE){
        // Historical behaviour: stream every stage live to the console.
        console.log("\n>>>",name);
        r=spawnSync("node",[file,mission],{stdio:"inherit"});
    }else{
        // Summary behaviour: capture the stage transcript, append it to the run-log artifact, and
        // print a single result line. On failure the captured tail is still surfaced to the console
        // so a broken run is never silent even in summary mode.
        r=spawnSync("node",[file,mission],{encoding:"utf8"});
        const transcript=(r.stdout||"")+(r.stderr||"");
        fs.appendFileSync(RUN_LOG,`\n===== >>> ${name} (exit ${r.status}) =====\n${transcript}`);
    }
    const elapsed=Date.now()-started;

    if(r.status!==0){
        cp=checkpoint.stageFailed(cp,i,`${name} exited with status ${r.status}`);
        if(!VERBOSE){
            const transcript=(r.stdout||"")+(r.stderr||"");
            const tail=transcript.trim().split("\n").slice(-20).join("\n");
            console.error(`>>> ${name}  FAIL  (${fmtDuration(elapsed)})`);
            if(tail)console.error("--- last output ---\n"+tail+"\n-------------------");
            console.error("Full log   :",RUN_LOG);
        }
        console.error("STOP:",name,"failed");
        process.exit(r.status);
    }

    // RC-1: a zero exit code is NOT proof the stage produced its effect. For a stage with a declared
    // output artifact, require it to exist (non-empty) before DONE; otherwise HALT exactly like a
    // non-zero exit (stageFailed + exit) so DONE can never mark an effect-less stage. Undeclared
    // (conditional / non-blocking) stages are unconstrained — historical exit-0 => DONE is preserved.
    if(!stageEffect.stageEffectOk(name,path.join("runtime","generated"))){
        cp=checkpoint.stageFailed(cp,i,name+" exited 0 but produced no effect artifact ("+stageEffect.STAGE_OUTPUTS[name]+")");
        if(!VERBOSE){
            console.error(">>> "+name+"  FAIL  ("+fmtDuration(elapsed)+")  — no effect artifact");
            console.error("Full log   :",RUN_LOG);
        }
        console.error("STOP:",name,"exited 0 without its effect artifact ("+stageEffect.STAGE_OUTPUTS[name]+")");
        process.exit(1);
    }

    if(!VERBOSE){
        console.log(`>>> ${name.padEnd(28)} OK   (${fmtDuration(elapsed)})`);
    }
    cp=checkpoint.stageDone(cp,i);
}

checkpoint.complete(cp);

console.log("\n======================================");
console.log("PIPELINE SUCCESS —",stageNames.length+"/"+stageNames.length,"stages");
if(!VERBOSE){
    console.log("Full log   :",RUN_LOG);
}
console.log("======================================");
