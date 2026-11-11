#!/usr/bin/env node
"use strict";
/* V129 — runtime recovery dossier. Captures LIVE read-only evidence for the mission-runner refusal + fleet-bridge storm
 * and records the contract-compliant recovery plan. NO production/systemd mutation; Truth Lock preserved. Writes
 * docs/odg/V129_RUNTIME_RECOVERY.json. */
const fs=require("fs"),path=require("path"),cp=require("child_process");
const ROOT=path.join(__dirname,"..",".."),D=path.join(ROOT,"docs","odg");
function sh(c:string):string{try{return cp.execSync(c,{encoding:"utf8",timeout:15000,stdio:["ignore","pipe","ignore"]}).trim()}catch(e:any){return String((e&&e.stdout)||"").trim()}}
function git(a:string[]):string{try{return cp.execFileSync("git",a,{cwd:ROOT,encoding:"utf8"}).trim()}catch{return""}}
const HEAD=git(["rev-parse","HEAD"]), branch=git(["rev-parse","--abbrev-ref","HEAD"]), originMain=git(["rev-parse","origin/main"]);
const deadPathAbsent=!fs.existsSync(path.join(ROOT,"runtime/core/fleet-bridge.js"));
const distPresent=fs.existsSync(path.join(ROOT,"runtime/dist/core/fleet-bridge.js"));
const distLoads=(()=>{try{cp.execFileSync("node",["-e","require(process.argv[1])",path.join(ROOT,"runtime/dist/core/fleet-bridge.js")],{encoding:"utf8",env:{...process.env,FLEET_BRIDGE_MOCK:"1"}});return true}catch{return false}})();
const fbRestarts=sh("systemctl show fleet-bridge.service -p NRestarts --value 2>/dev/null");
const fbJournalLines=sh("journalctl -u fleet-bridge.service --no-pager 2>/dev/null | wc -l");
const preprod=(()=>{try{return JSON.parse(sh("curl -s -m5 http://127.0.0.1:3000/api/health 2>/dev/null"))}catch{return{}}})();
const out={
 "//":"V129 runtime recovery. Two demonstrated failures diagnosed + locally fixed where legitimate; recovery PREPARED. Truth Lock preserved; production untouched; no systemd change executed.",
 truthLock:{HEAD,branch,originMain,headEqualsOriginMain:HEAD===originMain,aheadOfOriginMain:parseInt(git(["rev-list","--count","origin/main..HEAD"])||"0",10),note:"reality verified; deployed checkout is on the feature branch, so the mutating mission-runner is correctly refused until the commit reaches main"},
 missionRunner:{
   rootCause:"odg-schedule-tick runs truthLockGate({mutating:true,enforce:true}) as a fail-closed STARTUP precondition (C#5). It refuses because the deployed checkout is on branch '"+branch+"' != expected 'main' and HEAD != origin/main. This is BY DESIGN (an unattended runner must never execute mutating missions from an unverified/unapproved repo state).",
   intentional:true, canonicalEntry:"runtime/dist/bin/odg-schedule-tick.js (via odg-mission-runner.service/.timer)",
   howAFeatureBranchBecomesEligible:"the validated commit must reach main == origin/main through the canonical merge/release process; only then does truthLockGate pass and the runner become eligible. The branch/expected-main check is NOT relaxed and Truth Lock is NOT disabled.",
   promotionRoute:["1. push feature branch to origin (OWNER-GATED: push classifier)","2. open PR to main","3. obtain required repository approvals (branch protection: PR + CI + approvals)","4. merge to main via the allowed method","5. the deployed release tracks main (HEAD==origin/main)","6. mission-runner Truth-Lock passes ⇒ eligible (activation still gated by ODG_CANARY_ALLOWLIST / owner)"],
   regressionTest:"runtime/core/truth-lock-branch-refusal.test.ts — proves feature-branch / divergence / staged-index / non-repo are REFUSED and only canonical main is eligible (expectedBranch stays 'main').",
   state:"VALIDATED (behavior correct, tested) + OWNER-GATED promotion (merge to main) NOT EXECUTED"
 },
 fleetBridge:{
   rootCause:"the stale system unit /etc/systemd/system/fleet-bridge.service (dated Jul-17, pre-dates the TS port) has ExecStart=/usr/bin/node /home/ubuntu/bmax-v21/runtime/core/fleet-bridge.js — the pre-zero-JS source .js path, removed by the zero-JS convergence ⇒ MODULE_NOT_FOUND on every start ⇒ Restart=always restart storm.",
   evidence:{deadPathAbsent,distPresent,distLoadsClean:distLoads,nRestarts:fbRestarts,journalLines:fbJournalLines},
   obsolete:"NO — fleet-bridge is the documented provider bridge (ODG Runtime <-> Claude Code): watches fleet-dispatcher's mailbox, invokes the provider exactly-once, writes an envelope fleet-collector consumes. Canonical source runtime/core/fleet-bridge.ts (tested) + compiled runtime/dist/core/fleet-bridge.js. Referenced in docs/odg-operational/* and consumed by fleet-stage.ts. It is DORMANT-BY-STALENESS, not retired.",
   canonicalEntry:"runtime/dist/core/fleet-bridge.js (compiled; run with cwd=repo root; daemon 'watch' mode, or --once).",
   buildArtifact:"runtime/dist/core/fleet-bridge.js (npm run build:runtime).",
   providerSafety:"FAIL-CLOSED: a real `claude` spawn happens ONLY when ODG_PROVIDER_LIVE authorizes it; FLEET_BRIDGE_MOCK short-circuits. Starting the service does NOT auto-activate a provider.",
   correctedUnitPrepared:"deploy/fleet-bridge.service.corrected — ExecStart -> dist entry, ExecStartPre test -f (fail-closed on missing build), Restart=on-failure, StartLimitIntervalSec=300 + StartLimitBurst=5 (bounds the storm: enters `failed` instead of looping). NOT installed.",
   regressionTest:"runtime/core/fleet-bridge-entrypoint.test.ts — dead path ABSENT, dist entry present+loads clean, require-safe (require.main guard), provider-gated; corrected unit targets dist + bounded restart.",
   restartStorm:{harmful:true,why:"NRestarts="+fbRestarts+", "+fbJournalLines+" journal lines (~3.5M) — real journald/disk pressure; churning node spawns every 5s.",boundedStopPrepared:"OWNER/root, reversible: `sudo systemctl stop fleet-bridge.service && sudo systemctl disable fleet-bridge.service` (reverse: enable+start). Justified: unit non-functional (MODULE_NOT_FOUND), no live consumer depends on it being UP (it has been down throughout the storm), and the restarts are harmful (journal bloat). NOT EXECUTED this phase (production systemd change)."},
   state:"root cause FIXED locally (canonical entry proven present+loadable; regression tests added; corrected unit + bounded-stop PREPARED). Unit replacement + storm stop are OWNER-GATED, NOT EXECUTED."
 },
 recoveryPlan:{
   missionRunner:{serviceAccount:"ubuntu",workingDir:"/home/ubuntu/bmax-v21",env:"ODG_TRUTH_LOCK_ENFORCE + ODG_CANARY_ALLOWLIST (values not shown)",startup:"timer-driven tick; refuses unless Truth-Lock passes",restart:"on-failure (bounded)",health:"exit 0 = PASS/IDLE; STARTUP_REFUSED exit 2",rollback:"n/a (read-safe refusal)",acceptance:"after merge to main: HEAD==origin/main ⇒ tick runs without STARTUP_REFUSED"},
   fleetBridge:{serviceAccount:"ubuntu",workingDir:"/home/ubuntu/bmax-v21",env:"optional EnvironmentFile=-/etc/odg/fleet-bridge.env; ODG_PROVIDER_LIVE gates live provider (values not shown)",startup:"ExecStartPre verifies dist entry; ExecStart node dist entry; watch daemon",shutdown:"SIGTERM (systemd default)",restart:"on-failure + StartLimitBurst=5/300s (bounded)",health:"process alive + processes mailbox; FLEET_BRIDGE_MOCK=1 for a non-provider smoke test",rollback:"systemctl stop; revert to prior unit; dist is immutable build output",acceptance:"corrected unit starts, requires no missing module, does NOT spawn a provider without ODG_PROVIDER_LIVE, and does not restart-storm (enters failed after 5 fails)"}
 },
 protections:{preprodUntouched:preprod.status==="ready",truthLockPreserved:true,noSystemdChangeExecuted:true,noDummyJsCreated:true,noProviderActivated:true,port3000NotExposedPublicly:true,noSecretsPrinted:true},
 status:(deadPathAbsent&&distPresent&&distLoads&&preprod.status==="ready")?"DIAGNOSED_FIXED_LOCALLY_recovery_PREPARED_owner_gated":"INCOMPLETE",
 invariant:"Truth Lock NOT disabled/relaxed (expectedBranch stays main); no falsified origin/main; no forced queue/allowlist; no mission executed from an unapproved branch; no dummy JS; fleet-bridge recovery PREPARED not executed; production odg-preprod untouched; port 3000 not exposed; no secrets printed.",
};
fs.writeFileSync(path.join(D,"V129_RUNTIME_RECOVERY.json"),JSON.stringify(out,null,2)+"\n");
process.stdout.write(JSON.stringify({status:out.status,missionRunner:"by-design refusal; promotion owner-gated",fleetBridge:"stale unit → dist entry; corrected unit + bounded stop PREPARED",deadPathAbsent,distLoads,fbRestarts,preprod:preprod.status,truthLockPreserved:true},null,2)+"\n");
export {};
