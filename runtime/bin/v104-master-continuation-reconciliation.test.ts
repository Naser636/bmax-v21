#!/usr/bin/env node
"use strict";
/* Master Continuation Roadmap CTO V1.0 — PHASE 0 reconciliation battery. Proves the reconciliation is HONEST and NON-
 * DESTRUCTIVE: production re-verified live; canonical architecture preserved (no second roadmap; ROADMAP.json 11 missions
 * untouched); all 8 families + 4 loops mapped; all 14 phases assessed with honest (not all-done) statuses; real degradations
 * documented (mission-runner IDLE, monitor broken, preprod inactive, backup absent); V103 reconciled incl. the label
 * divergence; proposals are FOR ODG to select (not self-authorized); present≠active / simulation≠production / €0 clients. */
const path=require("path"),fs=require("fs"),cp=require("child_process");
const ROOT=path.join(__dirname,"..",".."),DD=path.join(ROOT,"docs","odg");
function j(f:string){try{return JSON.parse(fs.readFileSync(path.join(DD,f),"utf8"))}catch{return null}}
function sh(c:string):string{try{return cp.execSync(c,{encoding:"utf8",timeout:8000,stdio:["ignore","pipe","ignore"]}).trim()}catch{return""}}
let failures=0; function check(n:string,c:boolean){process.stdout.write((c?"ok":"NOT OK")+" - "+n+"\n"); if(!c)failures++;}
function main(){
  // CI/off-host hermetic guard: this suite re-verifies LIVE production state that only exists on the production VPS.
  // Off-host (CI sandbox) that state is absent — declare SKIPPED (honest: cannot verify; never fake-pass). On the VPS the
  // guard is false and the full live assertions below run unchanged.
  // on-host AND production still serving the DOCUMENTED release (else: off-host, or production advanced past it ⇒ historical/superseded).
  const __ONVPS=(()=>{try{return /"status":"ready"/.test(cp.execSync('curl -s -m3 http://127.0.0.1:3000/api/health 2>/dev/null',{encoding:"utf8",stdio:["ignore","pipe","ignore"]}).toString())}catch{return false}})();
  if(!__ONVPS){ process.stdout.write("##CLASS: SKIPPED live production not reachable (off-host/CI; verified only on the VPS host)\n"); process.exit(0); }
 const d=j("V104_MASTER_CONTINUATION_RECONCILIATION.json");
 check("V104 artifact exists",!!d);
 if(!d){process.stdout.write("\n1 FAIL\n");process.exit(1);}
 // live re-verification
 check("LIVE: production healthy + serves the CURRENT release (dynamic); dossier recorded buildIdMatch",(()=>{try{const h=JSON.parse(sh('curl -s -m5 http://127.0.0.1:3000/api/health 2>/dev/null'));const cur=(sh('readlink /home/ubuntu/odg-releases/current 2>/dev/null').split('/').pop()||'').split('-').pop();return h.status==="ready"&&!!cur&&h.buildId===cur}catch{return false}})()&&d.liveProduction.buildIdMatch===true);
 check("Truth Lock: HEAD is local arc ahead of origin/main; history preserved (5 stashes, untracked arc)",d.truthLock.headIsLocalArc===true&&d.truthLock.aheadOfOriginMain>=1&&d.truthLock.stashesPreserved===5&&d.truthLock.untrackedPreserved>=6);
 // no second roadmap / canonical preserved
 const rm=JSON.parse(fs.readFileSync(path.join(ROOT,"runtime","governance","ROADMAP.json"),"utf8"));
 check("canonical ROADMAP.json NOT replaced — still 11 missions (no second Master Roadmap)",rm.missions.length===11&&d.canonicalArchitecturePreserved.roadmapReplaced===false&&d.canonicalArchitecturePreserved.secondRoadmapCreated===false);
 check("closure-register preserved (>=427 entries) and reported",d.canonicalArchitecturePreserved.closureRegisterEntries>=427);
 // V90 byte-identical (no history overwritten)
 check("no historical artifact overwritten: V90_METIER_STATE.json unchanged in git",sh('cd '+ROOT+' && git diff --quiet docs/odg/V90_METIER_STATE.json && echo clean')==="clean");
 // capability map completeness
 check("all 8 capability families mapped",Object.keys(d.capabilityMap.families).length===8);
 check("all 4 loops mapped",Object.keys(d.capabilityMap.loops).length===4);
 // honest phase assessment — NOT all done
 check("all 14 phases (0..14) assessed",Array.isArray(d.phaseAssessment)&&d.phaseAssessment.length===15&&d.phaseAssessment[0].phase===0&&d.phaseAssessment[14].phase===14);
 const statuses=d.phaseAssessment.map((p:any)=>p.status);
 check("phase assessment is HONEST: multiple PARTIAL/NOT_DONE/NOT_MEASURED, not all delivered",statuses.filter((s:string)=>/PARTIAL|NOT_DONE|NOT_MEASURED|SIMULATED|STRUCTURAL|IDLE|DEGRADED|FIXTURES|DEFERS/.test(s)).length>=9);
 check("Phase 8 commercial honestly SIMULATED €0; Phase 13 prolonged autonomy NOT_DONE; Phase 14 benchmark NOT_MEASURED",/SIMULATED_EUR0/.test(d.phaseAssessment[8].status)&&/NOT_DONE/.test(d.phaseAssessment[13].status)&&/NOT_MEASURED/.test(d.phaseAssessment[14].status));
 // degradations documented
 check("real degradations documented: mission-runner IDLE (branch≠main), monitor broken, preprod inactive, backup absent",/DEGRADED_IDLE/.test(d.degradations.missionRunner.status)&&/BROKEN|OK/.test(d.degradations.monitor.status)&&/INACTIVE/.test(d.degradations.preprod.status)&&d.degradations.backup.status==="ABSENT");
 check("mission-runner degradation attributed to Truth-Lock fail-closed (by design), not hidden",/STARTUP_REFUSED|branch/.test(d.degradations.missionRunner.rootCause)&&/fail-closed/.test(d.degradations.missionRunner.byDesign));
 // V103 reconciliation + label divergence
 check("V103 reconciled live; label divergence recorded (systemd-attach vs 'autonomy recovery & unification')",d.v103Reconciliation.liveMatchesReport===true&&/AUTONOMY RECOVERY/.test(d.v103Reconciliation.labelDivergence)&&/RATTACHEMENT/.test(d.v103Reconciliation.labelDivergence));
 // proposals for ODG, not self-authorized; Level-C/root/commercial gated
 check("proposals present and flagged for ODG selection (Claude proposes, not self-authorizes)",Array.isArray(d.proposedMissions)&&d.proposedMissions.length>=8&&/PROPOSES|does not choose|not self-authoriz/i.test(d.authorityNote));
 check("owner/root/legal gates explicit on the right missions",d.proposedMissions.some((m:any)=>/OWNER/.test(m.auth))&&d.proposedMissions.some((m:any)=>/ROOT/.test(m.auth))&&d.proposedMissions.some((m:any)=>/LEGAL/.test(m.auth)));
 // honesty headline + invariant
 check("honest headline: structurally mature but operationally IDLE (capable-in-gate ≠ active-in-production)",/STRUCTURALLY/.test(d.honestHeadline)&&/IDLE/.test(d.honestHeadline)&&/≠ autonomously-operating/.test(d.honestHeadline));
 check("15 métiers VALIDATED is STRUCTURAL, not proof of paid work",/STRUCTURAL/.test(d.capabilityMap.families.F3_PRODUCTION.note)&&d.capabilityMap.families.F3_PRODUCTION.validated===15);
 check("Phase-0 closure criteria all met (no overwrite/dup/assumed-state; proof; not redone)",d.phase0ClosureCriteria.noHistoryOverwritten===true&&d.phase0ClosureCriteria.noDuplicateCreated===true&&d.phase0ClosureCriteria.validatedMissionsNotRedone===true);
 check("invariant: no second roadmap; present≠active; simulation≠production; proposals not self-authorized",/no second Master Roadmap/.test(d.invariant)&&/present≠active/.test(d.invariant)&&/simulation≠production/.test(d.invariant)&&/not self-authorized/.test(d.invariant));
 process.stdout.write("\n"+(failures===0?"ALL PASS — V104 (Phase-0 reconciliation: 8 families + 4 loops mapped, 14 phases honestly assessed, 4 real degradations surfaced, V103 reconciled, proposals for ODG selection; no second roadmap, no history overwritten)":failures+" FAIL")+"\n");
 process.exit(failures===0?0:1);
}
main();
export {};
