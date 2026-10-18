#!/usr/bin/env node
const fs=require("fs");
const path=require("path");

function read(file,fallback={}){
  try{return JSON.parse(fs.readFileSync(file,"utf8"));}
  catch{return fallback;}
}

const status=read("runtime/generated/runtime-status.json");
const state=read("runtime/generated/runtime-state.json");
const caps=read("runtime/generated/capability-registry.json");
const ledger=read("runtime/generated/mission-ledger.json",{entries:[]});
const queue=read("runtime/generated/runtime-mission-queue.json",{queue:[]});

const lastMission=(ledger.entries||[]).at(-1)?.mission||"N/A";
const next=queue.queue.find(m=>m.status==="PENDING");
// Outstanding gaps (real missions with no runnable objectives) are work remaining even when the
// executable queue is empty — surface them so "Next Mission" is never a false SYSTEM_READY. The
// state builder is authoritative for both the honest nextMission and the converged flag.
const outstanding=Array.isArray(state.outstanding)?state.outstanding:[];
const converged=state.converged===true;

console.log("======================================");
console.log("ODG FOUNDATION DASHBOARD");
console.log("======================================");
console.log("Runtime            :",status.runtime??"UNKNOWN");
console.log("Foundation         :",status.foundation??"UNKNOWN");
console.log("Converged          :",converged?"YES":"NO");
console.log("Capabilities       :",(caps.capabilities||[]).length);
// CM-4: report the count's HONEST decomposition so "capabilities" is never read as business capabilities.
// Fail-safe: a classifier error never breaks the status output.
try{
  const {classify}=require(path.resolve(process.cwd(),"scripts","capability-classify.js"));
  const k=classify((caps.capabilities||[]).map(c=>typeof c==="string"?c:(c.id||c.name||c.capability||"")));
  console.log("  classified       :","business="+k.businessCandidate,"· mission-derived="+k.missionDerived,"· nl-generated="+k.nlGenerated+(k.duplicates.length?" · dup="+k.duplicates.length:"")+(k.coherent?" · coherent":" · INCOHERENT"));
}catch{/* classifier optional — never break status */}
console.log("Missing            :",(caps.missingCapabilities||[]).length);
console.log("Last Mission       :",lastMission);
console.log("Next Mission       :",next?.mission??state.nextMission??"SYSTEM_READY");
console.log("Objective          :",next?.objective??"-");
console.log("Goal               :",next?.goal??"-");
console.log("Queue Remaining    :",queue.queue.filter(m=>m.status==="PENDING").length);
console.log("Outstanding Gaps   :",outstanding.length);
for(const o of outstanding){
  console.log("  -",o.mission,"—",o.reason,o.repairNominated?"(repair nominated)":"");
}
console.log("======================================");
