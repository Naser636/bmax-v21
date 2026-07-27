#!/usr/bin/env node
const fs=require("fs");
const path=require("path");
const {spawnSync}=require("child_process");

const mission=process.argv[3];
if(process.argv[2]!=="mission"||!mission){
  console.error("Usage: node runtime/bin/odg.js mission <MISSION>");
  process.exit(1);
}

// CONVERGENCE ROUTE — `node runtime/bin/odg.js mission RUNTIME_FULL_AUTONOMY_EXECUTION` (and any
// mission JSON declaring mode:"convergence") is not a single mission: it drives the whole Runtime to
// convergence. Delegate to the Convergence Orchestrator instead of the single-mission pipeline.
// Non-breaking: every other mission name still runs odg-run.js exactly as before. This mirrors the
// same routing the bash `odg mission` case performs via mission-cli.ts, so both entrypoints agree.
function isConvergenceMission(name){
  if(name==="RUNTIME_FULL_AUTONOMY_EXECUTION") return true;
  try{
    const spec=JSON.parse(fs.readFileSync(path.join(__dirname,"..","missions",`${name}.json`),"utf8"));
    return spec && spec.mode==="convergence";
  }catch{ return false; }
}
if(isConvergenceMission(mission)){
  const c=spawnSync("node",[path.join(__dirname,"odg-converge.js")],{stdio:"inherit"});
  process.exit(c.status??0);
}

const src=path.join(__dirname,"../templates/project-context-engine.template.js");
const dst=path.join(__dirname,"../core/project-context-engine.js");

if(mission==="PROJECT_CONTEXT_ENGINE_V1" && !fs.existsSync(dst)){
  fs.copyFileSync(src,dst);
  console.log("[ODG] ProjectContext Engine installed.");
}

const r=spawnSync("node",["runtime/bin/odg-run.js",mission],{stdio:"inherit"});
process.exit(r.status??0);
