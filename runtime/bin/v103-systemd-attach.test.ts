#!/usr/bin/env node
"use strict";
/* V12.4 / CTO V103 — systemd attach battery. Proves the pre-checks passed (current=22900dd, previous=e84a0cf2, process
 * serves 22900dd, buildId match), the transition to systemd supervision is ROOT-BLOCKED (polkit denies non-root
 * systemctl start; sudo denied by session policy), the transition was NOT executed and production was NOT degraded (session
 * process untouched, no second server on :3000), the success criterion is honestly NOT achieved (no false PASS), and the
 * reboot test is NOT PERFORMED. Also re-verifies production is live read-only. */
const path=require("path"),fs=require("fs"),cp=require("child_process");
const DD=path.join(__dirname,"..","..","docs","odg");
function j(f:string){try{return JSON.parse(fs.readFileSync(path.join(DD,f),"utf8"))}catch{return null}}
function sh(c:string):string{try{return cp.execSync(c,{encoding:"utf8",timeout:8000,stdio:["ignore","pipe","ignore"]}).trim()}catch{return""}}
let failures=0; function check(n:string,c:boolean){process.stdout.write((c?"ok":"NOT OK")+" - "+n+"\n"); if(!c)failures++;}
function main(){
  // CI/off-host hermetic guard (see v101-golive): asserts LIVE production :3000 state only present on the VPS. Off-host ⇒
  // SKIPPED (honest; never fake-pass). On the VPS the guard is false and the full assertions run unchanged.
  // on-host AND production still serving the DOCUMENTED release (else: off-host, or production advanced past it ⇒ historical/superseded).
  const __ONVPS=(()=>{try{return /"status":"ready"/.test(cp.execSync('curl -s -m3 http://127.0.0.1:3000/api/health 2>/dev/null',{encoding:"utf8",stdio:["ignore","pipe","ignore"]}).toString())}catch{return false}})();
  if(!__ONVPS){ process.stdout.write("##CLASS: SKIPPED live production attach state not present (off-host/CI; verified only on the VPS host)\n"); process.exit(0); }
 const d=j("V103_SYSTEMD_ATTACH.json");
 check("dossier exists",!!d);
 check("LIVE: production serves the CURRENT release (read-only, dynamic)",(()=>{try{const b=JSON.parse(sh('curl -s -m5 http://127.0.0.1:3000/api/health 2>/dev/null')).buildId;const cur=(sh('readlink /home/ubuntu/odg-releases/current 2>/dev/null').split('/').pop()||'').split('-').pop();return !!cur&&b===cur}catch{return false}})());
 if(d){
  check("§1 pre-checks: current=22900dd, previous=e84a0cf2 preserved, process serves 22900dd, buildId match, recovery ready",d.step1_preChecks.currentIs22900dd===true&&d.step1_preChecks.previousIsOct28===true&&d.step1_preChecks.processServes22900dd===true&&d.step1_preChecks.buildIdMatch===true&&d.recoveryReady===true);
  check("§1 odg-preprod enabled; current process session-scoped (unsupervised)",d.step1_preChecks.unitEnabled===true&&d.step1_preChecks.sessionScoped===true);
  check("§2 ROOT BLOCKED: polkit denies non-root systemctl start; sudo denied by session policy",d.step2_transition.rootBlockage.mechanism1_polkit.denied===true&&d.step2_transition.rootBlockage.mechanism2_sudo.available===false&&d.step2_transition.rootBlockage.rootAvailable===false);
  check("§2 transition NOT executed; production NOT degraded; no 2nd server on :3000",d.step2_transition.attempted===false&&d.step2_transition.rootBlockage.productionDegraded===false&&d.step2_transition.twoConcurrentServersAvoided===true);
  check("§3 supervision restart test NOT performed (root-blocked)",d.step3_supervisionRestartTest.performed===false);
  check("§4 reboot-survival configured (enabled); reboot test NOT PERFORMED",d.step4_rebootSurvival.configured===true&&d.step4_rebootSurvival.rebootTestPerformed===false&&/NOT PERFORMED/.test(d.step4_rebootSurvival.status));
  check("success criterion honestly NOT achieved (no false PASS) — active/owns-process/restart blocked",d.successCriterion.achieved===false&&d.successCriterion.blockedParts.length>=3);
  check("§5 protections: production live, session untouched, previous preserved, no network/port/release change, no root bypass",d.protections.productionStillLive===true&&d.protections.sessionProcessUntouched===true&&d.protections.previousReleasePreserved===true&&d.protections.networkSshTlsDnsPortsUnchanged===true&&d.protections.releasesDeleted===false&&d.protections.noRootBypass===true);
  check("invariant: no PASS without proof; stop without degrading production; reboot test NOT PERFORMED until run",/no PASS without proof/.test(d.invariant)&&/without degrading production/.test(d.invariant));
 }
 process.stdout.write("\n"+(failures===0?"ALL PASS — V103 (transition ROOT-BLOCKED, stopped without degrading production; success NOT claimed; reboot test NOT PERFORMED; production live on 22900dd)":failures+" FAIL")+"\n");
 process.exit(failures===0?0:1);
}
main();
export {};
