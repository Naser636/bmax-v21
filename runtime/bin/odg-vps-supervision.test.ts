#!/usr/bin/env node
"use strict";
/* VPS supervision chantier battery. Guards the root-free supervision assets + their SAFETY: the launcher forces
 * loopback bind and sets the storage env (⇒ storage READY); the cutover script is DRY-RUN by default (cannot kill
 * production without an explicit --execute) and has auto-rollback; the canonical user unit exists; and the dossier
 * honestly records that the live cutover was NOT executed autonomously and the reboot test was NOT performed. Also
 * re-verifies production is still pristine (read-only). */
const path=require("path"),fs=require("fs"),cp=require("child_process");
const ROOT=path.join(__dirname,"..",".."),DD=path.join(ROOT,"docs","odg");
function rd(p:string):string{try{return fs.readFileSync(path.join(ROOT,p),"utf8")}catch{return""}}
function exists(p:string):boolean{return fs.existsSync(path.join(ROOT,p))}
function j(f:string){try{return JSON.parse(fs.readFileSync(path.join(DD,f),"utf8"))}catch{return null}}
function sh(c:string):string{try{return cp.execSync(c,{encoding:"utf8",timeout:8000,stdio:["ignore","pipe","ignore"]}).trim()}catch{return""}}
let failures=0; function check(n:string,c:boolean){process.stdout.write((c?"ok":"NOT OK")+" - "+n+"\n"); if(!c)failures++;}
function main(){
  // launcher: loopback-forced + storage env + release-agnostic
  const L=rd("scripts/odg-app-launch.sh");
  check("scripts/odg-app-launch.sh exists",exists("scripts/odg-app-launch.sh"));
  check("launcher FORCES loopback (HOSTNAME=127.0.0.1, not a :- default that never applies)",/export HOSTNAME=127\.0\.0\.1/.test(L)&&!/HOSTNAME=\$\{HOSTNAME:-/.test(L));
  check("launcher sets storage env ⇒ storage READY (ODG_CLIENT_STORE + ODG_RUNTIME_STATE_DIR)",/ODG_CLIENT_STORE=/.test(L)&&/ODG_RUNTIME_STATE_DIR=/.test(L)&&/server\.js/.test(L));
  check("launcher is release-agnostic (follows current symlink)",/odg-releases\/current\/app/.test(L));
  // cutover: safe by default
  const C=rd("scripts/odg-app-cutover.sh");
  check("scripts/odg-app-cutover.sh exists",exists("scripts/odg-app-cutover.sh"));
  check("cutover is DRY-RUN by default — requires explicit --execute to kill production",/DRY=1/.test(C)&&/--execute/.test(C)&&/if \[ "\$DRY" = 1 \]/.test(C));
  check("cutover has health-gated AUTO-ROLLBACK",/rollback\(\)/.test(C)&&/nohup/.test(C)&&/health_ok/.test(C));
  check("cutover refuses to proceed unless current is healthy first (point 8)",/health_ok \|\| \{ echo "ABORT/.test(C));
  // canonical user unit
  const U=rd("deploy/odg-app.service");
  check("deploy/odg-app.service canonical unit exists (user service, Restart=on-failure, WantedBy=default.target)",exists("deploy/odg-app.service")&&/Restart=on-failure/.test(U)&&/WantedBy=default\.target/.test(U));
  // dossier honesty
  const d=j("V105_VPS_SUPERVISION.json");
  check("V105 dossier exists",!!d);
  if(d){
    check("dossier: replacement DEMONSTRATED immediately possible (storage READY, loopback, supervised)",d.liveDemonstration.replacementImmediatelyPossible===true&&d.liveDemonstration.storage==="READY"&&d.liveDemonstration.loopbackOnly===true);
    check("dossier HONEST: live cutover NOT executed autonomously",d.cutover.executedAutonomously===false&&/NON-intrusive|owner go-ahead|Path A/.test(d.cutover.reason));
    check("dossier HONEST: reboot test NOT PERFORMED (point 9)",d.rebootPersistence.rebootTestPerformed===false&&/NOT PERFORMED/.test(d.rebootPersistence.rebootTestStatus));
    check("dossier: V103 root blockage + both legitimate paths recorded",/polkit/.test(d.v103RootBlockage.exact)&&!!d.v103RootBlockage.legitimatePaths.A_preferred_one_root_action&&!!d.v103RootBlockage.legitimatePaths.B_root_free_prepared_demonstrated);
    check("dossier: boot-conflict avoided (odg-app NOT enabled; odg-preprod is boot supervisor)",/NOT enabled/.test(d.rebootPersistence.bootConflictAvoided));
    check("dossier: no root/polkit/sudo bypass; no reboot",/no root.*bypass/.test(d.invariant)&&/no reboot/.test(d.invariant));
  }
  // live: production pristine, no stray demo units
  check("LIVE: production :3000 still healthy/READY (untouched)",(()=>{try{const h=JSON.parse(sh('curl -s -m5 http://127.0.0.1:3000/api/health 2>/dev/null'));return h.status==="ready"&&h.storage==="READY"}catch{return false}})());
  check("no ACTIVE/running odg-app demo units left (stopped/dead transients are fine)",sh("systemctl --user list-units 'odg-app-demo*' --state=active --no-legend 2>/dev/null | grep -c odg-app-demo || true")==="0");
  process.stdout.write("\n"+(failures===0?"ALL PASS — VPS supervision (root-free path demonstrated; launcher loopback+storage correct; cutover dry-run-safe + auto-rollback; honest: cutover not auto-executed, reboot test not performed; production pristine)":failures+" FAIL")+"\n");
  process.exit(failures===0?0:1);
}
main();
export {};
