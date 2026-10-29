// END-TO-END DEMO: run the opening's 14 shots through the ODG pipeline. The "generation" is SIMULATED
// (deterministic placeholders — NO real media, NO paid tool, NO footage). This proves the ORCHESTRATION/
// accounting/gate/retry/continuity/rights CONTROL LOGIC only. It is NOT a film and produces NO audiovisual asset.
import { writeFileSync } from "node:fs";
import { BudgetLedger, makeShot, recordGeneration, acceptanceGate, classifyDefect, retryPlan,
  continuityCheck, rightsReleaseCheck, releaseGate } from "./film-pipeline.mjs";

const CRITERIA = { faceMatchMin:4, requireNoDrift:true, requireLipsyncIfDialogue:true, requireExport:true };
const budget = new BudgetLedger(4000);
budget.commit(350, "benchmark envelope");

// 14-shot opening (cost model: video shot €3.2/gen, still €0.4/gen — SIMULATED credit prices)
const plan = [
  ["S1","still",false],["S2","video",false],["S3","still",false],["S4","still",false],["S5","video",false],
  ["S6","video",false],["S7","video",false],["S8","video",false],["S9","still",false],["S10","still",true],
  ["S11","still",false],["S12","video",false],["S13","still",true],["S14","still",false],
];
const COST = { video:3.2, still:0.4 };
const shots = plan.map(([id,kind,dialogue]) => makeShot(id,"1",{kind,prompt:`opening ${id}`,dialogue}));
// deterministic simulated QC: shot S6 (hero VFX) fails attempt 1 (continuity), passes attempt 2.
function simQC(shot, attempt) {
  if (shot.id==="S6" && attempt===1) return { faceMatch:5, costumeDrift:false, continuityBreak:true, exported:true };
  return { faceMatch:5, costumeDrift:false, lipsyncOk: shot.dialogue?true:undefined, exported:true };
}
const MAX_RETRY = 3;
const trace = [];
for (const shot of shots) {
  let accepted=false;
  while (!accepted) {
    budget.spend(COST[shot.kind], `gen ${shot.id} (sim)`, {fromCommitted:true});
    recordGeneration(shot, { costEur: COST[shot.kind], outputBytes: 0 }); // outputBytes 0 = SIMULATED, no real media
    const qc = simQC(shot, shot.attempts);
    const g = acceptanceGate(shot, qc, CRITERIA);
    if (g.pass) { accepted=true; trace.push({id:shot.id, attempts:shot.attempts, result:"ACCEPTED", cost:shot.costEur}); }
    else {
      const d = classifyDefect(g.failed); const r = retryPlan(shot, MAX_RETRY);
      shot.defects.push({attempt:shot.attempts, failed:g.failed, defect:d.defect});
      trace.push({id:shot.id, attempts:shot.attempts, result:"REJECTED", defect:d.defect, failed:g.failed, plan:r.action});
      if (r.action==="ESCALATE") { shot.status="ESCALATED"; break; }
      shot.status="REVISING"; shot.version+=1; // targeted retry of THIS shot only (no scene restart)
    }
  }
}
const characters = { ASTRID:{introduced:true,lockedRef:true}, OLAF:{introduced:true,lockedRef:true},
  HELGI:{introduced:true,lockedRef:true}, MERYT:{introduced:true,lockedRef:true} };
shots[0].characters=["ASTRID","OLAF"]; shots[9].characters=["ASTRID"]; shots[12].characters=["MERYT"];
const cont = continuityCheck(shots, characters);
const assets = shots.map(s=>({id:s.id, licence:"ownership", aiDisclosed:true})); // simulated clean rights
const rights = rightsReleaseCheck(assets);
const rel = releaseGate(shots, rights, budget);

const run = {
  note: "SIMULATED orchestration run — NO real media generated; proves control logic only.",
  budget: budget.snapshot(), shotsTotal: shots.length,
  accepted: shots.filter(s=>s.status==="ACCEPTED").length,
  retried: shots.filter(s=>s.attempts>1).length,
  totalSimCost: Math.round(shots.reduce((a,s)=>a+s.costEur,0)*100)/100,
  continuity: cont, rights: {ok:rights.ok}, release: rel,
  trace,
};
writeFileSync(new URL("./production-run.json", import.meta.url), JSON.stringify(run,null,1));
console.log(JSON.stringify({budget:run.budget, accepted:`${run.accepted}/${run.shotsTotal}`, retried:run.retried,
  totalSimCost:run.totalSimCost, continuityOk:cont.ok, rightsOk:rights.ok, release:rel.release}, null, 1));
console.log(rel.release ? "PIPELINE RUN: release-gate OPEN (all shots accepted, rights clear, in budget) — SIMULATED"
  : "PIPELINE RUN: release-gate CLOSED — "+rel.reasons.join("; "));
