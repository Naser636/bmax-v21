#!/usr/bin/env node
"use strict";
/* V108 M3 (Phase 7) — demonstrate the 15 métiers running operationally via O1 (parallel waves) + G1 (resource caps),
 * on CLEARLY SYNTHETIC data, capped resources, no real action. Writes docs/odg/V108_METIER_ORCHESTRATION.json. */
const fs=require("fs"),path=require("path");
const ROOT=path.join(__dirname,"..",".."),D=path.join(ROOT,"docs","odg");
const ORCH=require(path.join(ROOT,"runtime","core","metier-orchestration.js"));
// Representative cross-métier scenario (deps model a research→data→analysis→report + build→release flow). SYNTHETIC.
const METIERS=[
  {id:"P4-data", weight:2, cost:2, provider:"local"},
  {id:"P13-aiinfra", weight:2, cost:2, provider:"local"},
  {id:"P1-fullstack", weight:2, cost:2, provider:"local"},
  {id:"P3-security", weight:1, cost:1, provider:"local"},
  {id:"P2-ai", deps:["P4-data","P13-aiinfra"], weight:3, cost:3, provider:"anthropic"},
  {id:"P5-devplatform", deps:["P1-fullstack"], weight:2, cost:2, provider:"local"},
  {id:"P8-semver", deps:["P1-fullstack"], weight:1, cost:1, provider:"local"},
  {id:"P6-eval", deps:["P2-ai"], weight:2, cost:2, provider:"anthropic"},
  {id:"P7-sre", weight:1, cost:1, provider:"local"},
  {id:"P9-finops", weight:1, cost:1, provider:"local"},
  {id:"P10-regulatory", deps:["P6-eval"], weight:1, cost:1, provider:"local"},
  {id:"P11-document", deps:["P6-eval"], weight:1, cost:1, provider:"local"},
  {id:"P12-streaming", weight:2, cost:7, provider:"local"},   // cost 7 > perMission cap 5 ⇒ G1 DENIES (leaf: no dependents)
  {id:"P14-devex", weight:1, cost:1, provider:"local"},
  {id:"P15-workflow", deps:["P5-devplatform"], weight:1, cost:1, provider:"local"},
];
const caps={ perProvider:{caps:{anthropic:20, local:100}}, perMission:5, global:100 };
// SYNTHETIC solver — deterministic stub, no real work, explicitly labeled.
const solver=(m:any)=>({ metier:m.id, artifact:"SYNTHETIC:"+m.id, ok:true });
const r=ORCH.orchestrate(METIERS, { maxConcurrency:4, resourceBudget:6, caps, solver, nowMs:0 });
const executedIds=r.executed.map((e:any)=>e.id).sort();
const out={
  "//":"V108 M3 (Phase 7) — 15 métiers orchestrated via O1 parallel waves + G1 resource caps on SYNTHETIC data. acted:false, synthetic:true. Demonstrates real ORCHESTRATION; payloads are synthetic (NO real clients/revenue/production).",
  scenario:"cross-métier: data/aiinfra→ai→eval→{regulatory,document}; fullstack→{devplatform→workflow,semver}; +independent security/sre/finops/streaming/devex",
  waves:r.waves, executed:r.executed, capDenied:r.capDenied, skippedDueToDep:r.skippedDueToDep, unschedulable:r.unschedulable, totalSpend:r.totalSpend, stats:r.stats,
  dependencyClosure:"a dependent of a cap-denied métier is SKIPPED (DEP_DENIED), not executed ⇒ `executed` always had its deps satisfied. In this scenario the denied métier (P12) is a leaf, so skippedDueToDep is empty.",
  demonstratesCapEnforcement:r.capDenied.some((c:any)=>c.id==="P12-streaming"&&c.reasons.includes("MISSION_CAP")),
  synthetic:r.synthetic, acted:r.acted,
  honesty:"ORCHESTRATION is real (O1 waves + G1 caps composed); métier WORK is SYNTHETIC stub output. This is NOT real paid métier delivery. 14 métiers executed (synthetic), P12 cap-denied by G1 (cost 7 > per-mission 5).",
  status:(r.stats.scheduled===15 && executedIds.length===14 && r.synthetic && !r.acted)?"METIERS_ORCHESTRATED_SYNTHETIC_capped":"INCOMPLETE",
  invariant:"15 métiers scheduled into dependency-respecting parallel waves (O1) under concurrency+resource caps; per-métier spend gated by G1 (a métier breaching per-mission cap is DENIED, not executed); outputs SYNTHETIC + clearly labeled; acted:false; no real client/revenue/production; structural orchestration real, work synthetic.",
};
fs.writeFileSync(path.join(D,"V108_METIER_ORCHESTRATION.json"),JSON.stringify(out,null,2)+"\n");
process.stdout.write(JSON.stringify({status:out.status,scheduled:r.stats.scheduled+"/15",executed:r.stats.executed,capDenied:r.capDenied.map((c:any)=>c.id+":"+c.reasons.join(",")),waves:r.waves.length,synthetic:r.synthetic,acted:r.acted},null,2)+"\n");
export {};
