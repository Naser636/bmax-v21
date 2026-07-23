#!/usr/bin/env node

const {spawnSync}=require("child_process");
const fs=require("fs");
const {authorizeMission}=require("../core/governance-kernel");
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
