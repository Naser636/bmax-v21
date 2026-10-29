import { BudgetLedger, makeShot, recordGeneration, acceptanceGate, dependentsUnlocked,
  classifyDefect, retryPlan, continuityCheck, rightsReleaseCheck, releaseGate, sha256,
  runtimeEstimate, editPlanCheck, exportDurationGate } from "./film-pipeline.mjs";
let p=0,f=0; const ck=(n,c)=>{console.log((c?"PASS ":"FAIL ")+n);c?p++:f++;};

// Budget: refuses crossing the cap
const b=new BudgetLedger(4000);
b.commit(350,"benchmark"); ck("commit tracked", b.snapshot().committed===350 && b.remaining()===3650);
b.spend(210,"benchmark-credits",{fromCommitted:true}); ck("spend from committed", b.spent===210 && b.committed===140);
let refused=false; try{ b.spend(4000,"stock"); }catch{ refused=true; } ck("spend over cap REFUSED", refused && b.spent===210);
ck("negative spend throws", (()=>{try{b.spend(-1,"x");return false}catch{return true}})());

// Shot ledger + provenance
const s=makeShot("S6","1",{kind:"video",prompt:"wave->sand morph",dialogue:false});
recordGeneration(s,{costEur:3.2,outputBytes:1024});
ck("generation records cost+provenance+status", s.costEur===3.2 && s.attempts===1 && /^[0-9a-f]{64}$/.test(s.provenance) && s.status==="GENERATED");

// Acceptance gate fail-closed
const g1=acceptanceGate(s,{faceMatch:5,costumeDrift:false,exported:true},{faceMatchMin:4,requireNoDrift:true,requireExport:true});
ck("gate accepts a clean shot", g1.pass && s.status==="ACCEPTED");
const s2=makeShot("S7","1",{kind:"video",dialogue:true}); recordGeneration(s2,{costEur:3,outputBytes:1});
const g2=acceptanceGate(s2,{faceMatch:2,costumeDrift:true,lipsyncOk:false,exported:false},{faceMatchMin:4,requireNoDrift:true,requireLipsyncIfDialogue:true,requireExport:true});
ck("gate rejects + lists failures", !g2.pass && g2.failed.length>=3 && s2.status==="REJECTED");
const g3=acceptanceGate(makeShot("X","1",{}),undefined,{faceMatchMin:4});
ck("gate fail-closed on missing QC", !g3.pass);

// Dependents blocked until prereq accepted
const dep=dependentsUnlocked({id:"S8"},[s,s2],{S8:["S6","S7"]});
ck("dependent blocked by un-accepted prereq (S7)", !dep.unlocked && dep.blockedBy.includes("S7"));

// Defect classify + bounded retry
ck("classify continuity defect", classifyDefect(["costume/proportion-drift"]).defect==="CONTINUITY");
ck("classify quality defect", classifyDefect(["faceMatch<4"]).defect==="QUALITY");
const sr=makeShot("S9","1",{}); sr.attempts=1;
ck("retry within cap", retryPlan(sr,3).action==="RETRY");
sr.attempts=3; ck("retry escalates at cap (no scene restart)", retryPlan(sr,3).action==="ESCALATE");

// Continuity register
const cc=continuityCheck([{id:"S1",characters:["ASTRID","GHOST"]}],{ASTRID:{introduced:true,lockedRef:true},GHOST:{introduced:false}});
ck("continuity flags un-introduced character", !cc.ok && cc.violations.some(v=>v.includes("GHOST")));

// Rights/release
const rr=rightsReleaseCheck([{id:"A1",licence:"ownership",aiDisclosed:true},{id:"A2",licence:"right-to-use",aiDisclosed:true}]);
ck("rights blocks non-ownership-clear asset", !rr.ok && rr.blockers.some(x=>x.includes("A2")));
const rgBad=releaseGate([s,s2],{ok:true,blockers:[]},b); ck("release blocked while a shot is REJECTED", !rgBad.release);
const rgOk=releaseGate([s],{ok:true,blockers:[]},b); ck("release allowed when all accepted + rights ok + in budget", rgOk.release);

// Runtime estimator + edit-plan check
ck("runtimeEstimate 400 shots @9s ≈ 60min", runtimeEstimate(400,{avgShotSec:9})===60);
ck("editPlanCheck flags an empty scene", editPlanCheck([{id:"SC1",shotIds:["a","b"]},{id:"SC2",shotIds:["c"]}],["a","b"],{}).emptyScenes.includes("SC2"));
const ep=editPlanCheck([{id:"SC1",shotIds:Array.from({length:400},(_,i)=>"s"+i)}], Array.from({length:400},(_,i)=>"s"+i), {targetMin:60,tolMin:1,avgShotSec:9});
ck("editPlanCheck: 400 accepted shots within 60±1 min", ep.ok && ep.withinTarget && ep.estMin===60);
const epShort=editPlanCheck([{id:"SC1",shotIds:["a","b"]}],["a","b"],{targetMin:60,tolMin:1});
ck("editPlanCheck: under-length flagged (not within target)", epShort.withinTarget===false);

// Export-duration gate (no false "film produced": fail-closed)
ck("exportGate fail-closed when no file exists (our current reality)", exportDurationGate({exists:false}).ok===false);
ck("exportGate rejects wrong duration (45:00)", exportDurationGate({exists:true,filePath:"/x.mp4",durationSec:2700}).ok===false);
ck("exportGate rejects null duration", exportDurationGate({exists:true,filePath:"/x.mp4"}).ok===false);
ck("exportGate passes only a real file at ~60:00", exportDurationGate({exists:true,filePath:"/film.mp4",durationSec:3590}).ok===true);
ck("exportGate rejects empty object", exportDurationGate({}).ok===false);

console.log(`\nFILM-PIPELINE TESTS: ${f===0?"PASS":"FAIL"} (pass=${p} fail=${f})`);
process.exit(f?1:0);
