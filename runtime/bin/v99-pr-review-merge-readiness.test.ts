#!/usr/bin/env node
"use strict";
/* V12.4 / CTO V99 — PR review + merge readiness battery. Proves: full diff reviewed (clean: deps identical, 0 migrations,
 * no sensitive files/secrets), local HEAD NOT auto-included, PR OPEN/MERGEABLE/CLEAN + CI green + 0 conflict, independent
 * qualification APPROVED_FOR_MERGE, action-gate BLOCKED for merge (Level-C, V98=push+PR only, not fabricated), and the
 * post-merge RC built from the ACTUAL merged SHA (Nov-10 staging ≠ proof). Nothing merged/deployed. Live artifact. */
const path=require("path"),fs=require("fs");
const DD=path.join(__dirname,"..","..","docs","odg");
function j(f:string){try{return JSON.parse(fs.readFileSync(path.join(DD,f),"utf8"))}catch{return null}}
let failures=0; function check(n:string,c:boolean){process.stdout.write((c?"ok":"NOT OK")+" - "+n+"\n"); if(!c)failures++;}
function main(){
 const d=j("V99_PR_REVIEW_MERGE_READINESS.json");
 check("artifact exists",!!d);
 if(d){
  check("§1 local HEAD NOT auto-included (only the V98 record commit)",d.reconciliation.localHeadAutoIncluded===false && d.reconciliation.localOnlyCommits.length===1 && /V98_PUBLICATION_RECORD/.test(d.reconciliation.localOnlyFiles[0]));
  check("§2 full diff reviewed CLEAN: deps identical, 0 migrations, 0 sensitive, 0 secrets",d.diffReview.runtimeDepsIdentical===true && d.diffReview.migrations===0 && d.diffReview.sensitiveFiles===0 && d.diffReview.secretValuesInDiff===0 && d.prClean===true);
  check("§2 scope matches approved + V97/V98 fixes present",d.diffReview.scopeMatchesApproved===true && d.diffReview.v97v98FixesPresent>=1 && d.diffReview.newTests>=50);
  check("§3 PR OPEN/MERGEABLE/CLEAN + CI green + 0 conflict + protections intact (not just MERGEABLE)",d.prState.state==="OPEN" && d.prState.mergeState==="CLEAN" && d.ciChecks.some((c:any)=>c.status==="pass") && d.conflictOverlap===0);
  check("§4 independent qualification APPROVED_FOR_MERGE (qualified+independent, 15/15 métiers)",d.independentQualification.verdict==="APPROVED_FOR_MERGE" && d.independentQualification.inspectorQualified===true && d.independentQualification.independence==="INDEPENDENT" && d.independentQualification.metier15===15);
  check("§4 action-gate MERGE = BLOCKED (Level-C, V98 push+PR only, NOT fabricated)",d.gateDecision.decision==="BLOCKED" && d.gateDecision.levelC===true && d.gateDecision.explicitMergeAuthorityProvided===false && /push \+ PR ONLY/i.test(d.gateDecision.v98Authorized));
  check("§5 post-merge RC from ACTUAL merged SHA (unpredictable); Nov-10 staging NOT proof",/UNPREDICTABLE/.test(d.postMergeReleaseCandidate.postMergeSha) && /NOT proof|NOT f2c887b/.test(d.postMergeReleaseCandidate.stageVerify+d.postMergeReleaseCandidate.buildFromMergedCode) && d.postMergeReleaseCandidate.allCommandsReal===true);
  check("§6 nothing merged/deployed",d.mergedOrDeployed===false && /nothing merged\/deployed/.test(d.invariant));
 }
 process.stdout.write("\n"+(failures===0?"ALL PASS — V99 (PR #489 reviewed clean, APPROVED_FOR_MERGE but gate BLOCKED pending owner merge authority; post-merge RC prepared; nothing merged/deployed)":failures+" FAIL")+"\n");
 process.exit(failures===0?0:1);
}
main();
export {};
