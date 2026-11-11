#!/usr/bin/env node
"use strict";
/* M3 (Phase 7) — metier-orchestration battery. Proves O1+G1 composition: dependency-respecting parallel waves, G1 resource
 * caps enforced per métier (a cap-breaching métier is DENIED not executed), synthetic+acted:false, determinism, purity;
 * and that the real V108 dossier orchestrates 15 métiers (14 executed synthetic, 1 cap-denied). */
const O = require("./metier-orchestration.js");
const fs=require("fs"), path=require("path");
let failures=0; function check(n:string,c:boolean){process.stdout.write((c?"ok":"NOT OK")+" - "+n+"\n"); if(!c)failures++;}
const solver=(m:any)=>({metier:m.id, artifact:"SYNTHETIC:"+m.id});
function main(){
  const metiers=[
    {id:"a", weight:1, cost:1, provider:"local"},
    {id:"b", deps:["a"], weight:1, cost:1, provider:"local"},
    {id:"c", weight:1, cost:9, provider:"local"},   // cost 9 > perMission 5 ⇒ denied
    {id:"d", weight:1, cost:1, provider:"local"},
  ];
  const caps={perMission:5, perProvider:{caps:{local:100}}, global:100};
  const r=O.orchestrate(metiers, {maxConcurrency:2, resourceBudget:10, caps, solver, nowMs:0});
  check("synthetic:true + acted:false (no real action)", r.synthetic===true && r.acted===false);
  check("dependency respected: b runs in a strictly later wave than a", r.executed.find((e:any)=>e.id==="b").wave > r.executed.find((e:any)=>e.id==="a").wave);
  check("G1 cap ENFORCED: 'c' (cost 9 > perMission 5) DENIED, not executed", r.capDenied.some((x:any)=>x.id==="c"&&x.reasons.includes("MISSION_CAP")) && !r.executed.some((e:any)=>e.id==="c"));
  check("admitted métiers executed with SYNTHETIC output", r.executed.find((e:any)=>e.id==="a").output.artifact==="SYNTHETIC:a");
  check("executed count = scheduled - capDenied", r.stats.executed===r.stats.scheduled-r.capDenied.length);
  check("totalSpend = sum of admitted costs (c excluded)", r.totalSpend===3);  // a1+b1+d1
  // determinism + frozen
  check("deterministic", JSON.stringify(O.orchestrate(metiers,{maxConcurrency:2,resourceBudget:10,caps,solver,nowMs:0}))===JSON.stringify(r));
  check("output frozen", Object.isFrozen(r) && Object.isFrozen(r.executed) && Object.isFrozen(r.capDenied));
  // solver throwing is isolated
  const r2=O.orchestrate([{id:"x",cost:1,provider:"local"}], {maxConcurrency:1,resourceBudget:10,caps:{perMission:5,perProvider:{caps:{local:9}}},solver:()=>{throw new Error("boom");},nowMs:0});
  check("solver throw isolated (error recorded, not crash)", r2.executed[0].error && r2.executed[0].output===undefined);
  // DEP_DENIED propagation (independent-validator fix): a dependent of a cap-denied métier must NOT execute
  const dd=O.orchestrate([{id:"dep",cost:9,provider:"local"},{id:"child",deps:["dep"],cost:1,provider:"local"},{id:"grandchild",deps:["child"],cost:1,provider:"local"}], {maxConcurrency:1,resourceBudget:10,caps:{perMission:5,perProvider:{caps:{local:100}}},solver,nowMs:0});
  check("dep cap-denied ⇒ child + grandchild SKIPPED (DEP_DENIED), NOT executed (executed never implies satisfied deps)", dd.capDenied.some((c:any)=>c.id==="dep") && dd.skippedDueToDep.some((s:any)=>s.id==="child"&&s.reason==="DEP_DENIED") && dd.skippedDueToDep.some((s:any)=>s.id==="grandchild") && !dd.executed.some((e:any)=>e.id==="child"||e.id==="grandchild"));
  // empty / invalid
  check("empty métiers ⇒ empty orchestration, no crash", O.orchestrate([], {maxConcurrency:2,solver}).executed.length===0);
  // REAL dossier
  const d=JSON.parse(fs.readFileSync(path.join(__dirname,"..","..","docs","odg","V108_METIER_ORCHESTRATION.json"),"utf8"));
  check("REAL dossier: 15/15 métiers scheduled, 14 executed (synthetic), acted:false", d.stats.scheduled===15 && d.stats.executed===14 && d.synthetic===true && d.acted===false);
  check("REAL dossier: G1 cap enforcement demonstrated (P12-streaming MISSION_CAP)", d.demonstratesCapEnforcement===true);
  check("REAL dossier: honesty — orchestration real, work SYNTHETIC (no real clients/revenue)", /SYNTHETIC/.test(d.honesty) && /NOT real/.test(d.honesty));
  process.stdout.write("\n"+(failures===0?"ALL PASS — metier-orchestration M3 (O1 waves + G1 caps, 15 métiers synthetic+capped, dep-respecting, acted:false)":failures+" FAIL")+"\n");
  process.exit(failures===0?0:1);
}
main();
export {};
