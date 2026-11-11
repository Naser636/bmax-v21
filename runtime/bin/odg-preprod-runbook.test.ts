#!/usr/bin/env node
"use strict";
/* PATH A runbook safety battery. Guards scripts/odg-preprod-cutover-runbook.sh: it is CHECK-ONLY by default (cannot
 * mutate without an explicit --execute), contains NO sudo/polkit bypass, has pre-checks (healthy current + intact release
 * + clean unit verify + no odg-app boot conflict) and a health-gated AUTO-ROLLBACK, uses the blessed `systemctl start
 * odg-preprod`, and its --check path runs without touching production. */
const path=require("path"),fs=require("fs"),cp=require("child_process");
const ROOT=path.join(__dirname,"..","..");
function rd(p:string):string{try{return fs.readFileSync(path.join(ROOT,p),"utf8")}catch{return""}}
function sh(c:string):string{try{return cp.execSync(c,{encoding:"utf8",timeout:30000,stdio:["ignore","pipe","ignore"]}).trim()}catch(e:any){return String((e&&e.stdout)||"").trim()}}
let failures=0; function check(n:string,c:boolean){process.stdout.write((c?"ok":"NOT OK")+" - "+n+"\n"); if(!c)failures++;}
function main(){
  const R=rd("scripts/odg-preprod-cutover-runbook.sh");
  check("runbook exists",R.length>0);
  check("CHECK-ONLY by default (MODE=check unless --execute)",/MODE=check/.test(R)&&/--execute/.test(R)&&/if \[ "\$MODE" = check \]/.test(R));
  check("uses the BLESSED system unit (systemctl start odg-preprod.service)",/systemctl start odg-preprod\.service/.test(R));
  check("NO sudo/polkit bypass in the runbook",!/sudo|pkexec|polkit/.test(R));
  check("pre-checks present: healthy current + release intact + unit verify + odg-app boot-conflict guard",/health_ok \|\| fail/.test(R)&&/BUILD_ID/.test(R)&&/systemd-analyze verify/.test(R)&&/default\.target\.wants\/odg-app\.service/.test(R));
  check("health-gated AUTO-ROLLBACK present (restores service on failure)",/rollback\(\)/.test(R)&&/odg-app-launch\.sh/.test(R)&&/ROLLBACK OK/.test(R));
  check("post-check verifies ready/READY + buildId + systemd MainPID ownership",/MainPID/.test(R)&&/EXPECT_BUILD/.test(R)&&/health_ok && build_ok/.test(R));
  // V106-audit hardenings (must not regress):
  check("HARDENING: exact port match (no :3000 substring over-match of :30000)",/127\\\.0\\\.0\\\.1:\$\{PORT\}\(\[\^0-9\]\|\$\)/.test(R)&&!/grep "127\.0\.0\.1:\$PORT"/.test(R));
  check("HARDENING: systemd availability gated before start (is-system-running running|degraded)",/is-system-running/.test(R)&&/running\|degraded/.test(R));
  check("HARDENING: TOCTOU — PID re-derived + re-health-checked immediately before kill",/PID=\$\(cur_pid\)[\s\S]*kill "\$PID"/.test(R)&&/ABORT at cutover/.test(R));
  check("bash syntax valid",sh("bash -n "+path.join(ROOT,"scripts/odg-preprod-cutover-runbook.sh")+" && echo OK")==="OK");
  // behavioral: the --check path is non-mutating (production pid unchanged before/after)
  const before=sh("ss -tlnpH 2>/dev/null | grep 127.0.0.1:3000 | grep -oE 'pid=[0-9]+' | cut -d= -f2 || true");
  const out=sh("bash "+path.join(ROOT,"scripts/odg-preprod-cutover-runbook.sh"));
  const after=sh("ss -tlnpH 2>/dev/null | grep 127.0.0.1:3000 | grep -oE 'pid=[0-9]+' | cut -d= -f2 || true");
  check("--check path is NON-MUTATING (production pid unchanged, no cutover)",/PRECHECKS OK/.test(out)&&/CHECK-ONLY/.test(out)&&before===after&&before!=="");
  process.stdout.write("\n"+(failures===0?"ALL PASS — Path A runbook is check-only by default, no root bypass, pre-checks + auto-rollback + ownership post-check, --check non-mutating":failures+" FAIL")+"\n");
  process.exit(failures===0?0:1);
}
main();
export {};
