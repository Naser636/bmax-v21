#!/usr/bin/env node
const fs=require("fs");
const path=require("path");
const {spawnSync}=require("child_process");

const mission=process.argv[3];
if(process.argv[2]!=="mission"||!mission){
  console.error("Usage: node runtime/bin/odg.js mission <MISSION>");
  process.exit(1);
}

const src=path.join(__dirname,"../templates/project-context-engine.template.js");
const dst=path.join(__dirname,"../core/project-context-engine.js");

if(mission==="PROJECT_CONTEXT_ENGINE_V1" && !fs.existsSync(dst)){
  fs.copyFileSync(src,dst);
  console.log("[ODG] ProjectContext Engine installed.");
}

const r=spawnSync("node",["runtime/bin/odg-run.js",mission],{stdio:"inherit"});
process.exit(r.status??0);
