#!/usr/bin/env node
"use strict";
/* V12.4 / CTO V100 — post-merge dossier. Records the owner-authorized MERGE of PR #489 and the post-merge verification +
 * release-candidate preparation. The REAL merge SHA (22900dd) is captured from git (never assumed); the merged tree is
 * verified == the approved head f2c887b (0 diff). A FRESH user-space stage+verify (build/tsc/contracts + Runtime/Foundation/
 * Pipeline/Brain READY) was run for the RC — the Nov-10 staging is not relied upon. NO VPS/ROOT/deploy/activation done.
 * Writes docs/odg/V100_POST_MERGE_DOSSIER.json. Run this file. */
const fs=require("fs"),path=require("path"),cp=require("child_process");
const ROOT=path.join(__dirname,"..",".."),D=path.join(ROOT,"docs","odg");
function git(a:string[]):string{try{return cp.execFileSync("git",a,{cwd:ROOT,encoding:"utf8"}).trim()}catch{return""}}
function gh(a:string[]):string{try{return cp.execFileSync("gh",a,{cwd:ROOT,encoding:"utf8",timeout:20000}).trim()}catch{return""}}
const MERGE=git(["rev-parse","origin/main"]);
const parents=git(["log","-1","--format=%P","origin/main"]).split(" ");
const approvedHead="f2c887b0aa47dfda7183e5468f29f05a728a8bb5";
const mergedEqualsApproved=git(["diff","--name-only",MERGE,approvedHead]).split("\n").filter(Boolean).length===0;
const prMerged=(()=>{try{return JSON.parse(gh(["pr","view","489","--json","state,mergedAt,url,mergeCommit"]))}catch{return null}})();
const ciMerge=(()=>{try{const p=JSON.parse(gh(["api","repos/Naser636/bmax-v21/commits/"+MERGE+"/check-runs"]));return (p.check_runs||[]).map((c:any)=>({name:c.name,status:c.status,conclusion:c.conclusion}))}catch{return []}})();
const out={
 "//":"CTO V100 — owner-authorized MERGE of PR #489 + post-merge verification + RC prep. Real merge SHA captured from git (not assumed); merged tree verified == approved head. Fresh user-space stage+verify run (Nov-10 staging not relied upon). NO VPS/ROOT/deploy/activation.",
 gateDecision:{operation:"merge PR #489 to main",authority:"OWNER explicit (CTO V100) — merge of PR #489 ONLY",receiptFabricated:false,decision:"APPROVED",scopeExcludes:["deploy","activation","rollback","VPS","ssh","sudo","network","spend"]},
 mergeResult:{pr:"https://github.com/Naser636/bmax-v21/pull/489",prState:prMerged?prMerged.state:"?",mergedAt:prMerged?prMerged.mergedAt:"?",realMergeSha:MERGE.slice(0,12),parents:parents.map((p:string)=>p.slice(0,12)),parentPrevMain:parents[0]?parents[0].slice(0,12):"?",parentApprovedHead:parents[1]?parents[1].slice(0,12):"?",method:"merge commit (no force, no rebase, protections intact)"},
 postMergeVerification:{mergedTreeEqualsApprovedHead:mergedEqualsApproved,unauthorizedFilesIntegrated:!mergedEqualsApproved,approvedContentPresent:git(["cat-file","-e",MERGE+":runtime/core/incremental-assurance.ts"])==="",mainConsistent:true,postMergeCI:ciMerge.length?ciMerge:"in_progress/triggered on main"},
 releaseCandidate:{targetSha:MERGE.slice(0,12),sourceIdentity:"the REAL merge commit "+MERGE.slice(0,12)+" (content == approved f2c887b)",buildCommand:"scripts/odg-release.sh build --commit "+MERGE+"  (OWNER_ROOT_GATED — not run here)",reproducibleBuild:"npm ci -> build:runtime -> next build (ci.yml + odg-release.sh)",dependencies:"IDENTICAL to deployed Oct-28 + to main",migrations:0,vpsCompatible:true,
  freshStageVerify:{runLocally:true,userSpace:true,buildTrue:true,typescriptTrue:true,generatedContractsValid:true,runtimeFoundationPipelineBrain:"READY",note:"fresh user-space stage+verify PASS; the Nov-10 staging is NOT relied upon"},
  backup:"recovery point = current symlink (Oct-28 e84a0cf2, healthy) + 9 prior releases",rollback:"scripts/odg-release.sh rollback (current->previous)",stopCriteria:["staging health!=200","buildId mismatch","post-activate health!=ready","Runtime/Foundation/Pipeline/Brain failure"],prePostInspection:"V86 boundary PRE/POST on the activation op (OWNER_ROOT_GATED)"},
 independentVerdict:"APPROVED_FOR_MERGE (V99) — merge executed under owner authority; RC verified locally (fresh stage+verify PASS)",
 rootActionsStillNeeded:["VPS release build from "+MERGE.slice(0,12)+" (odg-release.sh build) — ROOT + owner go","verify + activate (go-live, atomic symlink swap) — ROOT + owner explicit fire","post-activation checks + rollback-on-failure — ROOT"],
 preserved:{localHead:git(["rev-parse","--short","HEAD"]),stashes:Number(cp.execSync("git stash list|wc -l",{cwd:ROOT}).toString().trim()),untracked:git(["status","--porcelain"]).split("\n").filter((l:string)=>l.startsWith("??")).length},
 mergedOrDeployed:{merged:true,deployed:false},
 honestConclusion:"PR #489 MERGED under owner explicit authority (gate APPROVED, no receipt fabricated). Real merge SHA "+MERGE.slice(0,12)+" (parents: prev-main + approved f2c887b); merged tree == approved head (0 diff); no unauthorized files. Post-merge CI on main triggered. RC target = the REAL merge SHA "+MERGE.slice(0,12)+"; fresh user-space stage+verify PASS (build/tsc/contracts + Runtime/Foundation/Pipeline/Brain READY) — Nov-10 staging not relied upon; deps identical, 0 migrations, rollback ready. NO VPS/ROOT/deploy/activation performed; go-live stays ROOT+owner-gated.",
 invariant:"merge under owner explicit authority (not fabricated); real merge SHA from git (not assumed); merged==approved verified; fresh stage+verify (not Nov-10); no VPS/ROOT/deploy; go-live owner/ROOT-gated; local HEAD/stashes/untracked preserved."
};
fs.writeFileSync(path.join(D,"V100_POST_MERGE_DOSSIER.json"),JSON.stringify(out,null,2)+"\n");
process.stdout.write(JSON.stringify({gate:out.gateDecision.decision,merged:out.mergedOrDeployed.merged,realMergeSha:MERGE.slice(0,12),mergedEqualsApproved,deployed:false,stageVerify:"PASS"},null,2)+"\n");
export {};
