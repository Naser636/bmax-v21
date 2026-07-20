#!/usr/bin/env node

const {spawnSync}=require("child_process");

const mission=process.argv[2]||"BUILD_RUNTIME";

const pipeline=[
["Mission Loader","runtime/core/mission-loader.js"],
["Execution Planner","runtime/core/execution-planner.js"],
["Capability Registry","runtime/core/capability-registry.js"]
];

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
