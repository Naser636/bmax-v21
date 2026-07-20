#!/usr/bin/env node

const fs=require("fs");
const {spawnSync}=require("child_process");

function loadRuntimeContext(mission="BUILD_RUNTIME"){

    const file="runtime/generated/runtime-context.json";

    if(!fs.existsSync(file)){
        console.log("[RuntimeContext] Cache missing -> generating...");
        const r=spawnSync(
            "node",
            ["runtime/core/project-context-engine.js",mission],
            {stdio:"inherit"}
        );

        if(r.status!==0){
            throw new Error("Unable to generate RuntimeContext.");
        }
    }

    const context=JSON.parse(
        fs.readFileSync(file,"utf8")
    );

    if(
        !context.project ||
        typeof context.project.files!=="number" ||
        typeof context.project.directories!=="number"
    ){
        throw new Error("Invalid RuntimeContext.");
    }

    return context;
}

module.exports={loadRuntimeContext};
