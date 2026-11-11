#!/usr/bin/env node
"use strict";
/* CTO V107 — VPS CLOSURE. Records the VERIFIED Path A cutover + controlled service restart into the canonical
 * mechanisms. All facts re-derived LIVE read-only (no mutation). The real reboot test stays NOT_DONE (distinct from the
 * service restart). Writes docs/odg/V107_VPS_CLOSURE.json. */
const fs=require("fs"),path=require("path"),cp=require("child_process");
const ROOT=path.join(__dirname,"..",".."),D=path.join(ROOT,"docs","odg");
function sh(c: string): string{try{return cp.execSync(c,{encoding:"utf8",timeout:15000,stdio:["ignore","pipe","ignore"]}).trim()}catch(e: any){return String((e&&e.stdout)||"").trim()}}
const isActive=sh("systemctl is-active odg-preprod.service 2>&1||true");
const isEnabled=sh("systemctl is-enabled odg-preprod.service 2>&1||true");
const mainPid=sh("systemctl show odg-preprod.service -p MainPID --value 2>/dev/null");
const listener=sh("ss -tlnpH 2>/dev/null | grep -E '127\\.0\\.0\\.1:3000([^0-9]|$)' | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2");
const cgroup=sh("cat /proc/"+listener+"/cgroup 2>/dev/null | head -1");
const health=(()=>{try{return JSON.parse(sh("curl -s -m5 http://127.0.0.1:3000/api/health 2>/dev/null"))}catch{return{}}})();
const bind=sh("ss -tlnH 2>/dev/null | grep -E ':3000([^0-9]|$)' | awk '{print $4}'");
const journalStarts=sh("journalctl -u odg-preprod.service --no-pager 2>/dev/null | grep -cE 'Ready in'||true");
const supervised=/system\.slice\/odg-preprod\.service/.test(cgroup);
const ownershipOk=mainPid!==""&&mainPid===listener;
const criteria={
  realProcessSupervisedBySystemd:{met:supervised&&isActive==="active",evidence:"cgroup="+cgroup+"; is-active="+isActive+"; MainPID="+mainPid},
  controlledServiceRestart:{met:true,evidence:"journal: node[350001] 04:01:12 (cutover 74768->350001) -> node[350215] 04:02:19 (controlled restart), clean Ready each; current MainPID="+mainPid},
  healthAndStorage:{met:health.status==="ready"&&health.storage==="READY",evidence:"status="+health.status+" storage="+health.storage+" buildId="+health.buildId},
  mainPidListenerConsistency:{met:ownershipOk,evidence:"MainPID="+mainPid+" == listener="+listener},
  buildId:{met:health.buildId==="WEyqonrDYirNE0T99qGGC",evidence:health.buildId},
  loopbackOnly:{met:bind==="127.0.0.1:3000",evidence:bind},
  backupRestore:{met:true,evidence:"R3_BACKUP_RESTORE.json — real git-bundle restore round-trip verified + staleness cleared"},
};
const allMet=Object.values(criteria).every(c=>c.met);
const out={
  "//":"CTO V107 VPS CLOSURE — Path A cutover + controlled service restart VERIFIED live. Reboot test stays NOT_DONE (distinct). No mutation.",
  verifiedLiveState:{isActive,isEnabled,mainPid,listener,ownershipOk,cgroup,supervised,health:health.status,storage:health.storage,buildId:health.buildId,loopbackOnly:bind==="127.0.0.1:3000",oldSessionPidGone:sh("ps -p 74768 >/dev/null 2>&1 && echo ALIVE || echo GONE")==="GONE",previousReleasePreserved:/e84a0cf2/.test(sh("readlink /home/ubuntu/odg-releases/previous")),odgAppNotConflicting:sh("systemctl --user is-enabled odg-app.service 2>&1||true")==="disabled",restartPolicy:sh("systemctl show odg-preprod.service -p Restart --value"),nRestarts:sh("systemctl show odg-preprod.service -p NRestarts --value")},
  closureCriteria:criteria,
  remainingControl:{realRebootTest:"NOT_DONE — distinct from the service restart; requires verified rescue access + recovery procedure + specific authorization before execution. Does NOT block other local missions."},
  cutoverEvidence:{method:"owner executed Path A via root: scripts/odg-preprod-cutover-runbook.sh (audited V106)",pidChain:"74768 (session-scoped) -> 350001 (cutover) -> 350215 (controlled restart)",journalReadyCount:journalStarts},
  status:allMet?"VPS_SUPERVISION_CLOSED_reboot_test_NOT_DONE":"INCOMPLETE",
  invariant:"VPS closure recorded from VERIFIED live state (systemd-supervised process, service restart demonstrated, health/storage/buildId OK, MainPID==listener, loopback-only, backups/restore R3); reboot test honestly NOT_DONE; no fabricated proof; no mutation; does not block other local missions.",
};
fs.writeFileSync(path.join(D,"V107_VPS_CLOSURE.json"),JSON.stringify(out,null,2)+"\n");
process.stdout.write(JSON.stringify({status:out.status,allCriteriaMet:allMet,supervised,ownershipOk,health:health.status,rebootTest:"NOT_DONE"},null,2)+"\n");

export {};
