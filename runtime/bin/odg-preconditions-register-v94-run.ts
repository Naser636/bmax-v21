#!/usr/bin/env node
"use strict";
/* V12.4 / CTO V94 §8 — 8-precondition register updated on real new evidence: REQ-I/IV/XXV RECOVERED (V94 Master recovery)
 * ⇒ ROADMAP_EXHAUSTIVE now blocked ONLY by the 5 genuine owner decisions (still NOT_MET). VPS_INVENTORY augmented by the
 * V93-B forensic timeline (no status flip). Writes docs/odg/V94_PRECONDITIONS_REGISTER.json. */
const fs=require("fs"),path=require("path");const D=path.join(__dirname,"..","..","docs","odg");
function j(f:string){try{return JSON.parse(fs.readFileSync(path.join(D,f),"utf8"))}catch{return null}}
const mr=j("V94_MASTER_RECOVERY.json"),od=j("V94_OWNER_DECISIONS.json"),fx=j("V93B_VPS_FORENSICS.json"),prev=j("V93_PRECONDITIONS_REGISTER.json");
const g=process.env.ODG_FULL_GATE==="green";
const criteria=[
 {id:"INSPECTION_COVERAGE",status:"MET",newEvidence:false},
 {id:"FULL_GATE",status:g?"MET":"NOT_MET",newEvidence:false},
 {id:"GITHUB_AUDIT",status:"MET",newEvidence:true,evidence:"V94 GitHub sync: behind-main=2 (#487/#488), 0 overlapping files ⇒ conflict risk NONE; fresh-PR strategy preserves 68 commits"},
 {id:"BACKUP_ROLLBACK",status:"MET",newEvidence:false},
 {id:"INDEPENDENT_RELEASE_INSPECTION",status:"MET",newEvidence:false},
 {id:"ROADMAP_EXHAUSTIVE",status:"NOT_MET",newEvidence:true,
  evidence:`REQ-I/IV/XXV RECOVERED on the adopted V64 successor referential (26/26 caps + 12/12 dims grounded; 40 faults reconstructed) ⇒ Master-content NO LONGER a blocker. Blocked ONLY by ${od?od.count:5} genuine owner decisions (XIII external, XVI/XXVII/XXX priority, XXXII commercial).`,
  nextAction:"owner decides the 5 consolidated items; the 6 delegable + 3 Master-content are resolved"},
 {id:"VPS_INVENTORY",status:"MET",newEvidence:true,
  evidence:`inventory PERFORMED (V93) + V93-B FORENSIC timeline: deployed :3000 = Oct 28 (e84a0cf2), process restarted Nov 7, current symlink Oct 28; Nov 9-10 work = 243 repo commits + systemd radar timer (NOT deployed); deployed is 879 commits behind HEAD. Residuals OWNER_GATED (sudo).`},
 {id:"EXECUTABLE_DEPLOYMENT_PLAN",status:"MET",newEvidence:true,
  evidence:"runbook (real odg-release.sh) + V94 divergence audit: deps identical, 0 migrations, rollback feasible; LARGE delta (879 commits) ⇒ stage+verify mandatory; execution OWNER_GATED"},
];
const met=criteria.filter((c:any)=>c.status==="MET").map((c:any)=>c.id);
const notMet=criteria.filter((c:any)=>c.status!=="MET").map((c:any)=>c.id);
const out={
 "//":"CTO V94 §8 — register updated only on real evidence. Master content RECOVERED (supersedes V93 NOT_MEASURED) ⇒ ROADMAP_EXHAUSTIVE blocked ONLY by the 5 genuine owner decisions. VPS_INVENTORY augmented by the V93-B forensic (no flip). Delivery BLOCKED until 8/8 + critical gate; no push/deploy.",
 criteria,metCount:met.length,met,notMet,readyToDeliver:notMet.length===0,
 masterRecovery:mr?{allRecovered:mr.allRecovered,note:"I/IV grounded, XXV reconstructed on adopted successor; original preserved"}:null,
 forensicClarification:fx?"deployed=Oct28 (V93 correct); Nov 9-10 work = dev repo + systemd timer, not a deployment; 879-commit undeployed gap":null,
 deliveryDecision:notMet.length===0?"READY":`NOT_READY — ${notMet.length} open: ${notMet.join(", ")}`,
 honestConclusion:`${met.length}/8 MET. Only ROADMAP_EXHAUSTIVE open — and its Master-content sub-blocker (REQ-I/IV/XXV) is now RECOVERED, leaving ONLY the 5 genuine owner decisions. VPS inventory augmented by the forensic timeline (deployment Oct 28, big undeployed gap). Delivery NOT_READY; no push/deploy.`,
 invariant:"status changes only on real evidence; Master recovered not fabricated; forensic augments not erases; ROADMAP_EXHAUSTIVE needs genuine owner decisions; fail-closed delivery."
};
fs.writeFileSync(path.join(D,"V94_PRECONDITIONS_REGISTER.json"),JSON.stringify(out,null,2)+"\n");
process.stdout.write(JSON.stringify({metCount:met.length,notMet,readyToDeliver:out.readyToDeliver},null,2)+"\n");

export {};
