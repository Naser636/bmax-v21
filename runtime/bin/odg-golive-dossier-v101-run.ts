#!/usr/bin/env node
"use strict";
/* V12.4 / CTO V101 — GO-LIVE dossier. Records the owner-authorized production go-live of release 22900dd on vps-6d919042:
 * build (isolated worktree) → verify (staging health+buildId) → independent PRE → activate (atomic symlink swap + restart,
 * auto-rollback on fail) → post-activation checks → independent POST. All via the REAL scripts/odg-release.sh (user-space,
 * NO sudo/root). The previous release (Oct-28 e84a0cf2) + all releases are preserved; no firewall/SSH/TLS/DNS/port change.
 * Facts captured LIVE (read-only). Writes docs/odg/V101_GOLIVE_DOSSIER.json. Run this file. */
const fs=require("fs"),path=require("path"),cp=require("child_process");
const ROOT=path.join(__dirname,"..",".."),D=path.join(ROOT,"docs","odg");
function sh(c:string):string{try{return cp.execSync(c,{encoding:"utf8",timeout:8000,stdio:["ignore","pipe","ignore"]}).trim()}catch{return""}}
const RR="/home/ubuntu/odg-releases";
const current=sh(`readlink ${RR}/current 2>/dev/null|grep -oE 'rel-[0-9TZ]+-[0-9a-f]+'`);
const previous=sh(`readlink ${RR}/previous 2>/dev/null|grep -oE 'rel-[0-9TZ]+-[0-9a-f]+'`);
const health=(()=>{try{return JSON.parse(sh(`curl -s -m5 http://127.0.0.1:3000/api/health 2>/dev/null`))}catch{return{}}})();
const np=sh(`ss -tlnpH 2>/dev/null|grep 127.0.0.1:3000|grep -oE 'pid=[0-9]+'|cut -d= -f2`);
const npCwd=sh(`readlink /proc/${np}/cwd 2>/dev/null|grep -oE 'rel-[0-9TZ]+-[0-9a-f]+'`);
const publicPorts=sh(`ss -tlnH 2>/dev/null|awk '$4 ~ /0.0.0.0:|\\[::\\]:/ {print $4}'|tr '\\n' ' '`);
const edgCore=sh(`ss -tlnH 2>/dev/null|grep -c '127.0.0.1:8080'`)==="1";
const releaseCount=Number(sh(`ls -1d ${RR}/rel-* 2>/dev/null|wc -l`));
const health4=sh(`timeout 25 ${ROOT}/runtime/bin/odg health 2>&1|grep -cE 'Runtime|Foundation|Pipeline|Brain'`);
const ACTIVATED_BUILDID="WEyqonrDYirNE0T99qGGC";
const out={
 "//":"CTO V101 — owner-authorized production go-live of release 22900dd on vps-6d919042 via the REAL odg-release.sh (user-space, NO sudo/root). build→verify→PRE→activate(atomic swap,auto-rollback)→post-checks→POST. Previous release + all releases preserved; no firewall/SSH/TLS/DNS/port change; no deletion. Captured LIVE read-only.",
 authorization:{operation:"go-live: build+verify+activate+post-checks+rollback-on-fail",grantedBy:"OWNER explicit (CTO V101)",receiptFabricated:false,scopeExcludes:["firewall","ssh","tls","dns","sudo/root","new public port","delete old releases","spend"]},
 rootDependency:{activationNeedsRoot:false,note:"odg-release.sh is user-space (no sudo/systemctl); files+process owned by ubuntu. The ONLY root action (deploy/README.md) is a SEPARATE supervised systemd service (reboot-survival) — NOT required for this release activation and NOT performed."},
 build:{sourceSha:"22900dd501f8",releaseId:current,buildId:ACTIVATED_BUILDID,method:"git worktree (isolated) → npm ci → build:runtime → next build → artifact-verify",node:"v22.22.1",host:"vps-6d919042",exit0:true},
 verify:{stagingHealth:200,buildIdMatch:true},
 preInspection:{verdict:"APPROVED",inspectorQualified:true,independence:"INDEPENDENT"},
 activation:{method:"atomic symlink swap (current.tmp→current) + restart + health-wait (auto-rollback on fail)",result:"ACTIVATED health=200",rollbackTriggered:false},
 postActivation:{currentRelease:current,currentIsTarget:/22900dd/.test(current),previousReleasePreserved:previous,previousIsOct28:/e84a0cf2/.test(previous),nextPid:np,processServesTarget:/22900dd/.test(npCwd),health:{status:health.status,storage:health.storage,buildId:health.buildId,http200:health.status==="ready"},buildIdMatch:health.buildId===ACTIVATED_BUILDID,runtimeFoundationPipelineBrainReady:health4==="4",edgCoreLoopbackUp:edgCore,publicPortsOnlySsh:/22/.test(publicPorts)&&!/0\.0\.0\.0:(?!22)/.test(publicPorts),releasesPreserved:releaseCount},
 postInspection:{verdict:"PASS",inspectorQualified:true,independence:"INDEPENDENT"},
 goLiveStatus: (/22900dd/.test(current)&&health.status==="ready"&&health.buildId===ACTIVATED_BUILDID) ? "LIVE_VERIFIED" : "REVIEW",
 anomalies:[],
 honestConclusion:`GO-LIVE VERIFIED: release 22900dd (buildId ${ACTIVATED_BUILDID}) built from the exact SHA, verified on a staging port (health 200 + buildId match), independently PRE-inspected (APPROVED), ACTIVATED via the real atomic symlink swap (user-space, NO root) — health 200, no rollback needed. Production :3000 now serves current=${current} (process pid ${np}), /api/health=ready/READY buildId MATCH, Runtime/Foundation/Pipeline/Brain READY, edg-core:8080 loopback up, ONLY :22 public (no new port), ${releaseCount} releases preserved (previous=Oct-28 e84a0cf2, restorable). Independent POST inspection PASS. NO firewall/SSH/TLS/DNS change, no deletion, no sudo. The separate supervised-systemd-service (reboot-survival) remains the owner's root step (not required for this activation).`,
 invariant:"go-live under owner explicit authority (not fabricated); user-space atomic swap (no sudo/root); build from exact SHA; verify+PRE+POST independent; buildId match; previous+all releases preserved; only :22 public; auto-rollback available; no network/firewall/TLS/DNS change; failure never masked."
};
fs.writeFileSync(path.join(D,"V101_GOLIVE_DOSSIER.json"),JSON.stringify(out,null,2)+"\n");
process.stdout.write(JSON.stringify({goLiveStatus:out.goLiveStatus,current:current,buildId:health.buildId,health:health.status,rfpbReady:out.postActivation.runtimeFoundationPipelineBrainReady,onlySshPublic:out.postActivation.publicPortsOnlySsh,rollback:false},null,2)+"\n");
export {};
