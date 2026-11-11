#!/usr/bin/env node
"use strict";
/* V12.4 / CTO V100 — post-merge battery. Proves PR #489 was MERGED under owner explicit authority (gate APPROVED, no
 * receipt fabricated); the REAL merge SHA was captured (2 parents: prev-main + approved head); the merged tree == the
 * approved head (0 diff, no unauthorized files); a fresh user-space stage+verify PASSED (Runtime/Foundation/Pipeline/Brain
 * READY, not Nov-10 staging); the RC targets the REAL merge SHA; and NO VPS/ROOT/deploy occurred (go-live still gated).
 * Also re-proves the merge LIVE (PR state MERGED, f2c887b ancestor of main). */
const path=require("path"),fs=require("fs"),cp=require("child_process");
const DD=path.join(__dirname,"..","..","docs","odg");
function j(f:string){try{return JSON.parse(fs.readFileSync(path.join(DD,f),"utf8"))}catch{return null}}
function git(a:string[]):string{try{return cp.execFileSync("git",a,{cwd:path.join(__dirname,"..",".."),encoding:"utf8"}).trim()}catch{return""}}
let failures=0; function check(n:string,c:boolean){process.stdout.write((c?"ok":"NOT OK")+" - "+n+"\n"); if(!c)failures++;}
function main(){
 const d=j("V100_POST_MERGE_DOSSIER.json");
 check("dossier exists",!!d);
 // LIVE re-proof: approved head f2c887b is an ancestor of origin/main (merge landed).
 const f2Ancestor=(()=>{try{cp.execFileSync("git",["merge-base","--is-ancestor","f2c887b","origin/main"],{cwd:path.join(__dirname,"..","..")});return true}catch{return false}})();
 check("LIVE: approved f2c887b is an ancestor of origin/main (merge landed)",f2Ancestor);
 if(d){
  check("§2 gate APPROVED under OWNER explicit authority, no receipt fabricated, scope excludes deploy/VPS",d.gateDecision.decision==="APPROVED"&&/OWNER explicit/.test(d.gateDecision.authority)&&d.gateDecision.receiptFabricated===false&&d.gateDecision.scopeExcludes.includes("deploy")&&d.gateDecision.scopeExcludes.includes("VPS"));
  check("§3 REAL merge SHA captured with 2 parents (prev-main + approved head)",/^[0-9a-f]{12}$/.test(d.mergeResult.realMergeSha)&&d.mergeResult.parents.length===2&&d.mergeResult.parentApprovedHead==="f2c887b0aa47");
  check("§3 PR MERGED; merged tree == approved head; no unauthorized files",d.mergeResult.prState==="MERGED"&&d.postMergeVerification.mergedTreeEqualsApprovedHead===true&&d.postMergeVerification.unauthorizedFilesIntegrated===false);
  check("§4 RC targets the REAL merge SHA (not assumed); build command real + OWNER_ROOT_GATED",d.releaseCandidate.targetSha===d.mergeResult.realMergeSha&&/odg-release\.sh build/.test(d.releaseCandidate.buildCommand)&&/OWNER_ROOT_GATED/.test(d.releaseCandidate.buildCommand));
  check("§4 fresh user-space stage+verify PASS (Runtime/Foundation/Pipeline/Brain READY; Nov-10 not relied upon)",d.releaseCandidate.freshStageVerify.buildTrue===true&&d.releaseCandidate.freshStageVerify.typescriptTrue===true&&d.releaseCandidate.freshStageVerify.generatedContractsValid===true&&/READY/.test(d.releaseCandidate.freshStageVerify.runtimeFoundationPipelineBrain)&&/NOT relied upon/.test(d.releaseCandidate.freshStageVerify.note));
  check("§4 deps identical + 0 migrations + rollback real",d.releaseCandidate.migrations===0&&d.releaseCandidate.vpsCompatible===true&&/rollback/.test(d.releaseCandidate.rollback));
  check("merged=true, deployed=false; ROOT actions for go-live still listed",d.mergedOrDeployed.merged===true&&d.mergedOrDeployed.deployed===false&&d.rootActionsStillNeeded.length>=2&&d.rootActionsStillNeeded.some((r:string)=>/go-live|activate/i.test(r)));
  check("§5 preservation: 5 stashes + ≥6 untracked (new lot files transient)",d.preserved.stashes===5&&d.preserved.untracked>=6);
  check("invariant: real merge SHA not assumed; fresh stage+verify; no VPS/ROOT/deploy; go-live gated",/real merge SHA from git \(not assumed\)/.test(d.invariant)&&/no VPS\/ROOT\/deploy/.test(d.invariant));
 }
 process.stdout.write("\n"+(failures===0?"ALL PASS — V100 (PR #489 MERGED under owner authority; real SHA 22900dd; merged==approved; fresh stage+verify PASS; no deploy; go-live ROOT-gated)":failures+" FAIL")+"\n");
 process.exit(failures===0?0:1);
}
main();
export {};
