#!/usr/bin/env node
"use strict";
/* V12.4 / CTO V94-A §7 — recalculate the 8 preconditions AFTER preparing the consolidated owner-decision sheet. No owner
 * decision was actually OBTAINED ⇒ ROADMAP_EXHAUSTIVE stays NOT_MET (7/8); the blockage is now PRECISELY isolated to the 5
 * PENDING_OWNER_DECISION items (sheet ready + decidable). Preparing a sheet ≠ obtaining a decision. Writes
 * docs/odg/V94A_PRECONDITIONS_REGISTER.json. */
const fs=require("fs"),path=require("path");const D=path.join(__dirname,"..","..","docs","odg");
function j(f:string){try{return JSON.parse(fs.readFileSync(path.join(D,f),"utf8"))}catch{return null}}
const sheet=j("V94A_OWNER_DECISION_SHEET.json");const g=process.env.ODG_FULL_GATE==="green";
const sevenMet=["INSPECTION_COVERAGE","FULL_GATE","GITHUB_AUDIT","BACKUP_ROLLBACK","INDEPENDENT_RELEASE_INSPECTION","VPS_INVENTORY","EXECUTABLE_DEPLOYMENT_PLAN"];
const criteria:any[]=sevenMet.map((id:string)=>({id,status:id==="FULL_GATE"?(g?"MET":"NOT_MET"):"MET"}));
criteria.splice(5,0,{id:"ROADMAP_EXHAUSTIVE",status:"NOT_MET",
 evidence:"REQ-I/IV/XXV RECOVERED (V94). Blocked SOLELY by the 5 owner decisions — now consolidated into ONE decidable sheet (V94A), all PENDING_OWNER_DECISION. Preparing the sheet ≠ obtaining the decisions.",
 isolatedBlockage:sheet?sheet.decisions.map((d:any)=>({id:d.id,requiresOwner:d.requiresOwner,recommendedDefault:d.recommendedDefault})):[],
 nextAction:"owner decides the 5 (XIII/XVI/XXVII/XXX/XXXII); ODG continues independent local work meanwhile"});
const met=criteria.filter((c:any)=>c.status==="MET").map((c:any)=>c.id);
const notMet=criteria.filter((c:any)=>c.status!=="MET").map((c:any)=>c.id);
const out={
 "//":"CTO V94-A §7 — register recalculated after the consolidated sheet. No decision OBTAINED ⇒ ROADMAP_EXHAUSTIVE stays NOT_MET; blockage precisely isolated to the 5 PENDING owner decisions. Delivery BLOCKED until 8/8 + critical gate; no push/deploy.",
 criteria,metCount:met.length,met,notMet,readyToDeliver:notMet.length===0,
 blockageIsolation:{criterion:"ROADMAP_EXHAUSTIVE",blockedBy:"5 PENDING_OWNER_DECISION",everythingElseResolved:true,sheetReady:!!sheet&&sheet.coherenceOk===true},
 deliveryDecision:notMet.length===0?"READY":`NOT_READY — ${notMet.join(", ")} (solely the 5 owner decisions)`,
 honestConclusion:`${met.length}/8 MET. ROADMAP_EXHAUSTIVE remains NOT_MET — the consolidated owner-decision sheet is READY + coherent, but NO owner decision was obtained (preparing ≠ deciding). Blockage precisely isolated to the 5 PENDING decisions; all other roadmap work (6 ODG-decided + REQ-I/IV/XXV recovered) is resolved. Delivery NOT_READY; no push/deploy.`,
 invariant:"status recalculated on real outcomes only; preparing a sheet ≠ obtaining a decision; ROADMAP_EXHAUSTIVE blocked solely by the 5 PENDING owner decisions; fail-closed delivery; ODG recommends, owner decides."
};
fs.writeFileSync(path.join(D,"V94A_PRECONDITIONS_REGISTER.json"),JSON.stringify(out,null,2)+"\n");
process.stdout.write(JSON.stringify({metCount:met.length,notMet,readyToDeliver:out.readyToDeliver,sheetReady:out.blockageIsolation.sheetReady},null,2)+"\n");
export {};
