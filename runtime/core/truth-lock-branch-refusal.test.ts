#!/usr/bin/env node
"use strict";
/* V129 §1/§4 regression — the mission-runner's Truth-Lock STARTUP gate MUST refuse an unapproved branch. Drives the
 * canonical truthLockGate (same control odg-schedule-tick uses) via its injectable git `exec` seam — deterministic, no
 * real git. Proves: a feature branch / HEAD≠origin/main / staged index is REFUSED for a MUTATING run; only canonical
 * main == origin/main with an empty index is allowed; read-only is recorded (not blocked). This locks the behavior so
 * the branch can NEVER be silently changed to the feature branch to "make the runner pass". */
const { truthLockGate } = require("./truth-lock-gate.js");
let failures=0; function check(n:string,c:boolean){process.stdout.write((c?"ok":"NOT OK")+" - "+n+"\n"); if(!c)failures++;}
// fake git exec seam: map the exact arg vectors truthLockGate.gatherGitState uses.
function fakeGit(branch:string, head:string, originMain:string|null, stagedFiles:string[]=[]){
  return (args:string[])=>{
    const a=args.join(" ");
    if (a==="rev-parse --is-inside-work-tree") return "true";
    if (a==="rev-parse --abbrev-ref HEAD") return branch;
    if (a==="rev-parse HEAD") return head;
    if (a==="rev-parse origin/main") return originMain;
    if (a==="diff --cached --name-only") return stagedFiles.join("\n");
    return null;
  };
}
function main(){
  // (1) the REAL production reality: feature branch, HEAD diverged ⇒ REFUSED for a mutating run
  const diverged=truthLockGate({mutating:true, enforce:true, exec:fakeGit("excellence/v3-wave3-demonstrators-20261101","a".repeat(40),"b".repeat(40))});
  check("feature branch + HEAD≠origin/main ⇒ BLOCKED (mutating)", diverged.blocked===true && diverged.verdict.ok===false);
  check("violations name BOTH the unexpected branch and the divergence", diverged.verdict.violations.some((v:string)=>/unexpected branch/.test(v)) && diverged.verdict.violations.some((v:string)=>/diverges from origin\/main/.test(v)));
  // (2) canonical main == origin/main, empty index ⇒ ALLOWED
  const ok=truthLockGate({mutating:true, enforce:true, exec:fakeGit("main","c".repeat(40),"c".repeat(40))});
  check("main == origin/main + empty index ⇒ NOT blocked (eligible)", ok.blocked===false && ok.verdict.ok===true);
  // (3) main but STAGED changes ⇒ REFUSED (never risk incorporating staged work)
  const staged=truthLockGate({mutating:true, enforce:true, exec:fakeGit("main","c".repeat(40),"c".repeat(40),["x.ts","y.ts"])});
  check("main but staged index ⇒ BLOCKED (staged changes violation)", staged.blocked===true && staged.verdict.violations.some((v:string)=>/staged change/.test(v)));
  // (4) not a repo ⇒ REFUSED
  const norepo=truthLockGate({mutating:true, enforce:true, exec:(args:string[])=> args.join(" ")==="rev-parse --is-inside-work-tree" ? "false" : null});
  check("not a git repo ⇒ BLOCKED", norepo.blocked===true && norepo.verdict.ok===false);
  // (5) origin/main unresolvable ⇒ REFUSED
  const noorigin=truthLockGate({mutating:true, enforce:true, exec:fakeGit("main","c".repeat(40),null)});
  check("origin/main unresolvable ⇒ BLOCKED", noorigin.blocked===true);
  // (6) READ-ONLY run is NOT blocked even when diverged (recorded for observability only) — the gate is scoped to mutating
  const ro=truthLockGate({mutating:false, enforce:true, exec:fakeGit("excellence/x","a".repeat(40),"b".repeat(40))});
  check("read-only mission ⇒ NOT blocked (verdict recorded, not enforced)", ro.blocked===false);
  // (7) Truth-Lock is NOT disabled: expected branch is 'main' (never the feature branch)
  const P=require("./truth-lock.js"); check("DEFAULT policy expectedBranch is 'main' (never relaxed to the feature branch)", P.DEFAULT_TRUTH_LOCK_POLICY.expectedBranch==="main");
  process.stdout.write("\n"+(failures===0?"ALL PASS — Truth-Lock STARTUP gate refuses unapproved branch / divergence / staged index; only canonical main is eligible (not disabled, not relaxed)":failures+" FAIL")+"\n");
  process.exit(failures===0?0:1);
}
main();
export {};
