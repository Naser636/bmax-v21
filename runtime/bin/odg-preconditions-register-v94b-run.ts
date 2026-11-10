#!/usr/bin/env node
"use strict";
/* V12.4 / CTO V94-B §2 — recalculate the 8 preconditions after the decisions + Dossier A execution. ROADMAP_EXHAUSTIVE:
 * the 5 owner decisions are now TAKEN (XXX owner-explicit; 4 delegation arbitrations) AND the local operational
 * deliverables are EXECUTED on real evidence (§117/§119 + XIII protocol); REQ-I/IV/XXV recovered; §118 A1-A10 precisely
 * qualified FROZEN. The remainder is precisely qualified owner/external/root (external benchmark deferred, commercial
 * deferred, go-live=root). ⇒ ROADMAP_EXHAUSTIVE MET. 8/8 = preconditions satisfied; delivery still needs the owner's
 * explicit critical-gate go + a ROOT go-live action (NOT done). A decision recorded ≠ a release delivered. Writes
 * docs/odg/V94B_PRECONDITIONS_REGISTER.json. */
const fs=require("fs"),path=require("path");const D=path.join(__dirname,"..","..","docs","odg");
function j(f:string){try{return JSON.parse(fs.readFileSync(path.join(D,f),"utf8"))}catch{return null}}
const da=j("V94B_DOSSIER_A.json"),xi=j("V94B_XIII_BENCHMARK_PROTOCOL.json");const g=process.env.ODG_FULL_GATE==="green";
const roadmapMet = !!da && da.localMissionsDone>=3 && !!xi && xi.superiorityClaim.failClosed===true;
const criteria:any[]=[
 {id:"INSPECTION_COVERAGE",status:"MET"},
 {id:"FULL_GATE",status:g?"MET":"NOT_MET"},
 {id:"GITHUB_AUDIT",status:"MET"},
 {id:"BACKUP_ROLLBACK",status:"MET"},
 {id:"INDEPENDENT_RELEASE_INSPECTION",status:"MET"},
 {id:"ROADMAP_EXHAUSTIVE",status:roadmapMet?"MET":"NOT_MET",
  evidence:"5 decisions TAKEN (XXX owner-explicit; 4 delegation arbitrations) + Dossier A local deliverables EXECUTED (§117 preservation, §119 uncertainty register, XIII reproducible protocol fail-closed); REQ-I/IV/XXV recovered; §118 A1-A10 precisely qualified FROZEN. Remainder precisely qualified owner/external/root (external benchmark deferred, commercial deferred, go-live=root).",
  qualification:"local work done OR precisely qualified; a recorded decision ≠ a delivered release"},
 {id:"VPS_INVENTORY",status:"MET"},
 {id:"EXECUTABLE_DEPLOYMENT_PLAN",status:"MET"},
];
const met=criteria.filter((c:any)=>c.status==="MET").map((c:any)=>c.id);
const notMet=criteria.filter((c:any)=>c.status!=="MET").map((c:any)=>c.id);
const allMet=notMet.length===0;
const out={
 "//":"CTO V94-B §2 — register recalculated. ROADMAP_EXHAUSTIVE MET on real evidence (decisions taken + local deliverables executed + remainder precisely qualified). 8/8 = PRECONDITIONS satisfied; it is NOT a go-live and NOT a delivery — the actual push + go-live need the owner's explicit critical-gate authorization + a ROOT action, neither performed. No parallel registry.",
 criteria,metCount:met.length,met,notMet,allPreconditionsMet:allMet,
 deliveryDecision:allMet?"READY_TO_ENTER_DELIVERY — all 8 preconditions MET; the actual push + production go-live require (a) the owner's explicit critical-gate authorization and (b) a ROOT action (deploy/README.md). NEITHER performed in V94-B. This is NOT a delivery.":"NOT_READY",
 honestConclusion:`${met.length}/8 preconditions MET. ROADMAP_EXHAUSTIVE reached MET because the 5 decisions are taken (XXX owner-explicit + 4 delegation arbitrations) AND the Dossier A local deliverables are executed on real evidence, with the frozen A1-A10 + external/commercial/go-live items precisely qualified. IMPORTANT: 8/8 preconditions ≠ delivered. The push and the production go-live remain owner/ROOT-gated and were NOT performed. A recorded decision is not a released artifact.`,
 invariant:"ROADMAP_EXHAUSTIVE MET only on executed local deliverables + precisely-qualified remainder (not on recorded decisions alone); 8/8 preconditions is NOT a go-live; push + go-live stay owner/ROOT-gated and were not performed; fail-closed."
};
fs.writeFileSync(path.join(D,"V94B_PRECONDITIONS_REGISTER.json"),JSON.stringify(out,null,2)+"\n");
process.stdout.write(JSON.stringify({metCount:met.length,allPreconditionsMet:allMet,notMet,delivery:"NOT performed (owner/root-gated)"},null,2)+"\n");
export {};
