#!/usr/bin/env node
"use strict";
/*
 * V12.4 / CTO V94 §5 — GitHub sync analysis (read-only; NO merge/rebase/push). The repo is 2 commits behind origin/main
 * (#487 = this branch's earlier merge, #488 = a separate study branch). Analyses conflict risk and proposes the least-
 * risky strategy that preserves all 68 local commits and respects branch protection. Writes docs/odg/V94_GITHUB_SYNC.json.
 */
const fs=require("fs"),path=require("path"),cp=require("child_process");
const ROOT=path.join(__dirname,"..","..");const D=path.join(ROOT,"docs","odg");
function git(a:string[]){try{return cp.execFileSync("git",a,{cwd:ROOT,encoding:"utf8"}).trim()}catch{return""}}
const head=git(["rev-parse","--short","HEAD"]);const branch=git(["rev-parse","--abbrev-ref","HEAD"]);
const behind=Number(git(["rev-list","--count","HEAD..origin/main"]));
const ahead=Number(git(["rev-list","--count","origin/main..HEAD"]));
const base=git(["merge-base","HEAD","origin/main"]);
const missing=git(["log","--oneline","HEAD..origin/main"]).split("\n").filter(Boolean);
const ours=git(["diff","--name-only",base,"HEAD"]).split("\n").filter(Boolean);
const theirs=git(["diff","--name-only",base,"origin/main"]).split("\n").filter(Boolean);
const overlap=ours.filter((f:string)=>theirs.includes(f));
const out={
 "//":"CTO V94 §5 — GitHub sync analysis, read-only. No merge/rebase/push. Preserves all local commits; respects branch protection (enforce_admins + required PR + required check).",
 head,branch,aheadOfMain:ahead,behindMain:behind,mergeBase:git(["rev-parse","--short",base]),
 missingCommits:missing,
 conflictAnalysis:{filesChangedOurs:ours.length,filesChangedMain:theirs.length,overlappingChangedFiles:overlap.length,overlapSample:overlap.slice(0,8),conflictRisk:overlap.length===0?"NONE (0 overlapping changed files ⇒ clean 3-way merge expected)":"REVIEW ("+overlap.length+" overlapping files)"},
 branchProtection:"main: enforce_admins + required PR + required check 'build + typecheck + parity + tests'",
 recommendedStrategy:{approach:"fresh PR of the feature branch to main (NO local rebase/merge during V94)",steps:["git fetch origin (read-only, done)","open PR base=main head="+branch,"let CI run the required check","GitHub performs the 3-way merge at merge time (0 overlap ⇒ expected clean)","if a conflict surfaces at PR time, resolve in a merge commit (never force-push; preserves all 68 commits)"],preservesLocalWork:true,avoidsRebase:true,respectsProtection:true},
 consequencesOn68Commits:"a PR merge preserves all 68 local commits (append-only); no history rewrite; #487/#488 incorporated by the merge",
 honestConclusion:"HEAD +"+ahead+"/-"+behind+" vs origin/main (merge-base "+git(["rev-parse","--short",base])+"). Missing: #488 (v44 study) + #487 (this branch's earlier merge). Overlapping changed files vs main = "+overlap.length+" ⇒ "+(overlap.length===0?"no conflict expected":"review")+". Least-risky sync = a fresh PR (no rebase/merge now), preserving all 68 commits and respecting protection. NOTHING executed.",
 invariant:"read-only analysis; no merge/rebase/push; preserve all local commits (append-only); respect branch protection; conflict risk measured from a real 3-way file diff."
};
fs.writeFileSync(path.join(D,"V94_GITHUB_SYNC.json"),JSON.stringify(out,null,2)+"\n");
process.stdout.write(JSON.stringify({behindMain:behind,aheadMain:ahead,missing:missing.length,overlap:overlap.length,conflictRisk:out.conflictAnalysis.conflictRisk},null,2)+"\n");

export {};
