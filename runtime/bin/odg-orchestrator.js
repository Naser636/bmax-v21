#!/usr/bin/env node
const fs=require("fs");

function read(file,fallback={}){
  try{return JSON.parse(fs.readFileSync(file,"utf8"));}
  catch{return fallback;}
}

const queue=read("runtime/generated/runtime-mission-queue.json",{queue:[]});
const next=queue.queue.find(m=>m.status==="PENDING");

if(!next){
  console.log(JSON.stringify({
    status:"READY",
    message:"No pending mission."
  },null,2));
  process.exit(0);
}

const contract={
  generatedAt:new Date().toISOString(),
  status:"MISSION_ACCEPTED",
  mission:next.mission,
  objective:next.objective,
  goal:next.goal,
  state:"QUALIFIED",
  authorized:true
};

fs.writeFileSync(
  "runtime/generated/current-mission.json",
  JSON.stringify(contract,null,2)
);

console.log(JSON.stringify(contract,null,2));
