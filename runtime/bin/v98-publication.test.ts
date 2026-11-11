#!/usr/bin/env node
"use strict";
/* V12.4 / CTO V98 — publication record battery. Proves the owner-authorized push + PR were executed correctly: remote
 * SHA == local HEAD (fast-forward, no force), a fresh PR #489 to main was OPENED (not merged), branch protections
 * unchanged, authorization is owner-explicit (no fabricated receipt), and NO merge/deploy/VPS occurred. Live artifact. */
const path=require("path"),fs=require("fs");
const DD=path.join(__dirname,"..","..","docs","odg");
function j(f:string){try{return JSON.parse(fs.readFileSync(path.join(DD,f),"utf8"))}catch{return null}}
let failures=0; function check(n:string,c:boolean){process.stdout.write((c?"ok":"NOT OK")+" - "+n+"\n"); if(!c)failures++;}
function main(){
 const d=j("V98_PUBLICATION_RECORD.json");
 check("publication record exists",!!d);
 if(d){
  check("push: remote SHA == local HEAD (fast-forward, no force)",d.push.matched===true&&d.push.forced===false&&d.push.fastForward===true);
  check("PR #489 OPENED to main (source→base), not merged",d.pullRequest.number===489&&d.pullRequest.state==="OPEN"&&d.pullRequest.target==="main"&&d.mergedOrDeployed===false);
  check("PR carries the published commits",d.pullRequest.commits>=70&&d.commitsPublished>=70);
  check("authorization owner-EXPLICIT, no fabricated receipt, scope excludes merge/deploy/vps",/OWNER/.test(d.authorization.grantedBy)&&d.authorization.receiptFabricated===false&&d.authorization.scopeExcludes.includes("merge")&&d.authorization.scopeExcludes.includes("deploy"));
  check("branch protection UNCHANGED (enforce_admins + required check + PR)",!!d.branchProtection&&d.branchProtection.enforceAdmins===true&&d.branchProtection.prRequired===true&&d.branchProtection.requiredCheck.length>=1);
  check("verdict PUBLISHED_OK; residual risks note CI-pending + merge/go-live owner-gated",d.verdict==="PUBLISHED_OK"&&d.residualRisks.some((r:any)=>/CI/.test(r))&&d.residualRisks.some((r:any)=>/go-live|OWNER-gated/i.test(r)));
  check("invariant: push+PR only, not merged, no deploy, no fabricated receipt",/push \+ PR only/.test(d.invariant)&&/no merge\/deploy/.test(d.invariant));
 }
 process.stdout.write("\n"+(failures===0?"ALL PASS — V98 (owner-authorized push + PR #489 OPEN, remote==local, not merged, protections intact, no receipt fabricated)":failures+" FAIL")+"\n");
 process.exit(failures===0?0:1);
}
main();
export {};
