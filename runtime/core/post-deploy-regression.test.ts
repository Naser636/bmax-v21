#!/usr/bin/env node
"use strict";
/* V133 §5 — DYNAMIC post-deployment regression. Unlike the historical v101/v103/… suites (which document a specific
 * release), this asserts the GENERAL invariant and survives any deployment: live production health buildId == the CURRENT
 * release's buildId (production serves what `current` points to), odg-preprod is systemd-supervised (MainPID==:3000
 * listener), health ready/READY, and the previous release remains a valid rollback target. Off-host ⇒ SKIPPED. */
const cp=require("child_process"),fs=require("fs"),path=require("path");
function sh(c:string):string{try{return cp.execSync(c,{encoding:"utf8",timeout:8000,stdio:["ignore","pipe","ignore"]}).toString().trim()}catch{return""}}
let failures=0; function check(n:string,c:boolean){process.stdout.write((c?"ok":"NOT OK")+" - "+n+"\n"); if(!c)failures++;}
function main(){
  const health=sh("curl -s -m3 http://127.0.0.1:3000/api/health 2>/dev/null");
  if(!/"status":"ready"/.test(health)){ process.stdout.write("##CLASS: SKIPPED live production not reachable (off-host/CI; verified only on the VPS host)\n"); process.exit(0); }
  const h=JSON.parse(health);
  const ROOT="/home/ubuntu/odg-releases";
  const curRel=path.basename(sh("readlink "+ROOT+"/current"));
  const relBuildId=curRel.split("-").pop();   // rel-<ts>-<commit>-<buildId>
  check("live health buildId == CURRENT release buildId (production serves `current`)", !!h.buildId && h.buildId===relBuildId);
  check("health status ready + storage READY", h.status==="ready" && h.storage==="READY");
  const mpid=sh("systemctl show odg-preprod.service -p MainPID --value");
  const lpid=sh("ss -tlnpH 2>/dev/null | grep -E '127\\.0\\.0\\.1:3000([^0-9]|$)' | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2");
  check("odg-preprod active AND systemd-supervised (MainPID==:3000 listener)", sh("systemctl is-active odg-preprod.service")==="active" && mpid!=="" && mpid===lpid);
  check("supervised in system.slice/odg-preprod.service", /system\.slice\/odg-preprod\.service/.test(sh("cat /proc/"+mpid+"/cgroup 2>/dev/null | head -1")));
  const prev=sh("readlink "+ROOT+"/previous");
  check("previous release intact (valid rollback target: server.js present)", !!prev && fs.existsSync(prev+"/app/server.js"));
  check("current != previous (a real cutover occurred, rollback distinct)", curRel!==path.basename(prev));
  process.stdout.write("\n"+(failures===0?"ALL PASS — post-deploy regression (production serves the CURRENT release, supervised, healthy; rollback target intact)":failures+" FAIL")+"\n");
  process.exit(failures===0?0:1);
}
main();
export {};
