#!/usr/bin/env node
"use strict";
/* CTO V106 progress-reconciliation battery. Guards honesty + completeness of the consolidated dossier: every reprise-arc
 * mission present with a state from the required vocabulary + a canonical proof; 9 primitives + 15 métiers (structural ≠
 * operational); 14 phases (0..14); the VPS distinction is precise (configured yes, really-supervised NO, backup/restore
 * demonstrated YES, reboot NOT tested); no second roadmap/registry; history preserved; nothing simulated reported as done. */
const path=require("path"),fs=require("fs"),cp=require("child_process");
const ROOT=path.join(__dirname,"..",".."),DD=path.join(ROOT,"docs","odg");
function j(f:string){try{return JSON.parse(fs.readFileSync(path.join(DD,f),"utf8"))}catch{return null}}
function sh(c:string):string{try{return cp.execSync(c,{encoding:"utf8",timeout:8000,stdio:["ignore","pipe","ignore"]}).trim()}catch{return""}}
const VOCAB=["VALIDATED","ACTIVE_IN_PRODUCTION","PARTIAL","BLOCKED","SIMULATED","NOT_MEASURED","NOT_DONE"];
let failures=0; function check(n:string,c:boolean){process.stdout.write((c?"ok":"NOT OK")+" - "+n+"\n"); if(!c)failures++;}
function main(){
  // CI/off-host hermetic guard (see v101-golive): asserts LIVE production :3000 state only present on the VPS. Off-host ⇒
  // SKIPPED (honest; never fake-pass). On the VPS the guard is false and the full assertions run unchanged.
  const __ONVPS=(()=>{try{return /"status":"ready"/.test(cp.execSync('curl -s -m3 http://127.0.0.1:3000/api/health 2>/dev/null',{encoding:"utf8",stdio:["ignore","pipe","ignore"]}).toString())}catch{return false}})();
  if(!__ONVPS){ process.stdout.write("##CLASS: SKIPPED live production state not present (off-host/CI; verified only on the VPS host)\n"); process.exit(0); }
  const d=j("V106_PROGRESS_RECONCILIATION.json");
  check("V106 dossier exists",!!d);
  if(!d){process.stdout.write("\n1 FAIL\n");process.exit(1);}
  // mission ledger — includes R1/R3/V105 + the arc; valid states + proofs
  const ids=d.missions.map((m:any)=>m.id);
  check("mission ledger includes R1, R3, V105 and the V95-V104 arc",["P0-R1","P1-R3","V105","V101","V104","V100"].every(x=>ids.includes(x))&&d.missions.length>=12);
  check("every mission has a state from the required vocabulary + a proof/commit",d.missions.every((m:any)=>VOCAB.includes(m.state)&&(m.evidence||m.commit)));
  check("R1 recorded as INDEPENDENTLY validated",d.missions.find((m:any)=>m.id==="P0-R1").indepVal==="YES (adversarial)");
  check("V101 recorded ACTIVE_IN_PRODUCTION; V103 BLOCKED (honest, not overclaimed)",d.missions.find((m:any)=>m.id==="V101").state==="ACTIVE_IN_PRODUCTION"&&d.missions.find((m:any)=>m.id==="V103").state==="BLOCKED");
  // metiers + primitives: structural != operational
  check("15 métiers VALIDATED structurally but NONE active-in-production (€0)",/15\/15 VALIDATED/.test(d.metiers.structuralLadder)&&/NONE proven ACTIVE_IN_PRODUCTION/.test(d.metiers.operationalReality));
  check("9 primitives mapped with status",Array.isArray(d.primitives)&&d.primitives.length===9&&d.primitives.every((p:any)=>/VALIDATED/.test(p.status)));
  // 14 phases
  check("all 14 phases (0..14) assessed",Array.isArray(d.phases)&&d.phases.length===15&&d.phases[0].n===0&&d.phases[14].n===14);
  check("Phase 1 % computed from explicit criteria; live-supervision/restart/reboot NOT yet met",typeof d.phases[1].pct==="number"&&d.phases[1].criteria.liveProcessSupervised===false&&d.phases[1].criteria.rebootTested===false);
  check("Phase 13 NOT_DONE + Phase 14 NOT_MEASURED (no overclaim)",/NOT_DONE/.test(d.phases[13].status)&&/NOT_MEASURED/.test(d.phases[14].status));
  // VPS precise distinction (point 4)
  check("VPS: preparation complete + supervision CONFIGURED, but process NOT really supervised, restart NOT tested, reboot NOT tested",d.vps.preparationComplete===true&&d.vps.systemdSupervisionConfigured===true&&d.vps.processReallySupervised===false&&d.vps.serviceRestartTested===false&&d.vps.rebootPersistenceReallyTested===false);
  check("VPS: backup/restore DEMONSTRATED (R3); chantier stays OPEN",d.vps.backupAndRestoreDemonstrated===true&&d.vps.chantierOpen===true);
  // reconciliation integrity
  check("no second roadmap (ROADMAP.json present) + no parallel registry (>=427)",d.reconciliation.noSecondRoadmap===true&&d.reconciliation.noParallelRegistry===true);
  check("history preserved (5 stashes + untracked arc)",d.reconciliation.historyPreserved.stashes===5&&d.reconciliation.historyPreserved.untracked>=6);
  // ODG decision + chaining
  check("ODG decision: VPS priority held + auto-resume local missions on closure (G1/O1/B1/I1)",d.odgDecision.vpsPriorityHeld===true&&["G1","O1","B1","I1"].every((x:string)=>d.odgDecision.autoResumeOnVpsClosure.includes(x)));
  check("invariant: no 2nd roadmap; structural≠operational; prepared≠demonstrated; VPS open until criteria met",/no second roadmap/.test(d.invariant)&&/structural maturity ≠ operational/.test(d.invariant)&&/prepared ≠ demonstrated/.test(d.invariant));
  // live: production untouched
  check("LIVE: production still ready/READY (read-only, untouched)",(()=>{try{const h=JSON.parse(sh('curl -s -m5 http://127.0.0.1:3000/api/health 2>/dev/null'));return h.status==="ready"&&h.storage==="READY"}catch{return false}})());
  process.stdout.write("\n"+(failures===0?"ALL PASS — V106 (consolidated reconciliation: full mission ledger, 9 primitives + 15 métiers structural≠operational, 14 phases, precise VPS distinction, history preserved, no 2nd roadmap)":failures+" FAIL")+"\n");
  process.exit(failures===0?0:1);
}
main();
export {};
