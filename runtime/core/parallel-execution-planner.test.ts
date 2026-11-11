#!/usr/bin/env node
"use strict";
/* O1 — parallel-execution-planner adversarial battery. Proves dependency-respecting concurrency+resource-bounded waves,
 * cycle/unknown-dep/duplicate/oversized fail-closed reporting, determinism, no-duplicate-execution, and purity. */
const P = require("./parallel-execution-planner.js");
let failures=0; function check(n:string,c:boolean){process.stdout.write((c?"ok":"NOT OK")+" - "+n+"\n"); if(!c)failures++;}
const ids=(ws:any)=>ws.map((w:any)=>w.slice().sort());
function main(){
  // 1 — no deps, concurrency caps wave size
  const r1=P.plan([{id:"a"},{id:"b"},{id:"c"},{id:"d"},{id:"e"}], {maxConcurrency:2});
  check("no-deps: 5 missions @ conc 2 ⇒ waves 2,2,1", r1.waves.length===3 && r1.waves[0].length===2 && r1.waves[2].length===1 && r1.scheduled.length===5);
  // 2 — linear chain ⇒ one per wave in dep order
  const r2=P.plan([{id:"c",deps:["b"]},{id:"b",deps:["a"]},{id:"a"}], {maxConcurrency:3});
  check("linear chain a->b->c ⇒ [[a],[b],[c]]", JSON.stringify(r2.waves)===JSON.stringify([["a"],["b"],["c"]]));
  // 3 — diamond
  const r3=P.plan([{id:"a"},{id:"b",deps:["a"]},{id:"c",deps:["a"]},{id:"d",deps:["b","c"]}], {maxConcurrency:4});
  check("diamond ⇒ [a],[b,c],[d]", JSON.stringify(ids(r3.waves))===JSON.stringify([["a"],["b","c"],["d"]]));
  // 4 — concurrency 1 ⇒ fully sequential
  const r4=P.plan([{id:"a"},{id:"b",deps:["a"]},{id:"c",deps:["a"]}], {maxConcurrency:1});
  check("conc 1 ⇒ one mission per wave (3 waves)", r4.waves.length===3 && r4.waves.every((w:any)=>w.length===1));
  // 5 — resource budget caps wave weight
  const r5=P.plan([{id:"a",weight:3},{id:"b",weight:3},{id:"c",weight:3}], {maxConcurrency:5, resourceBudget:5});
  check("resourceBudget 5, weights 3 each ⇒ 1 per wave (3+3>5)", r5.waves.every((w:any)=>w.length===1) && r5.scheduled.length===3);
  // 6 — single weight > budget ⇒ WEIGHT_EXCEEDS_BUDGET, others still scheduled
  const r6=P.plan([{id:"big",weight:10},{id:"ok",weight:1}], {maxConcurrency:2, resourceBudget:5});
  check("weight>budget ⇒ that one UNSCHEDULED (WEIGHT_EXCEEDS_BUDGET), other scheduled", r6.scheduled.includes("ok") && r6.unscheduled.some((u:any)=>u.id==="big"&&u.reason==="WEIGHT_EXCEEDS_BUDGET"));
  // 7 — cycle
  const r7=P.plan([{id:"a",deps:["b"]},{id:"b",deps:["a"]}], {maxConcurrency:2});
  check("cycle a<->b ⇒ both UNSCHEDULED CYCLE, 0 scheduled", r7.scheduled.length===0 && r7.unscheduled.filter((u:any)=>u.reason==="CYCLE").length===2);
  // 8 — unknown/dangling dep
  const r8=P.plan([{id:"a",deps:["ghost"]},{id:"b"}], {maxConcurrency:2});
  check("unknown dep ⇒ a UNSCHEDULED UNKNOWN_DEP, b scheduled", r8.scheduled.includes("b") && r8.unscheduled.some((u:any)=>u.id==="a"&&u.reason==="UNKNOWN_DEP"));
  // 9 — duplicate id
  const r9=P.plan([{id:"a"},{id:"a"},{id:"b"}], {maxConcurrency:2});
  check("duplicate id ⇒ DUPLICATE_ID reported, single 'a' scheduled", r9.unscheduled.some((u:any)=>u.id==="a"&&u.reason==="DUPLICATE_ID") && r9.scheduled.filter((x:string)=>x==="a").length===1);
  // 10 — completed deps unblock dependents
  const r10=P.plan([{id:"b",deps:["a"]}], {maxConcurrency:2, completed:["a"]});
  check("pre-completed dep ⇒ dependent scheduled in wave 1", r10.waves.length===1 && r10.waves[0][0]==="b");
  // 11 — determinism
  const inp=[{id:"z"},{id:"y",deps:["z"]},{id:"x"}];
  check("deterministic: same input ⇒ identical output", JSON.stringify(P.plan(inp,{maxConcurrency:2}))===JSON.stringify(P.plan(inp,{maxConcurrency:2})));
  // 12 — no duplicate execution: each scheduled mission appears exactly once across all waves
  const flat=r3.waves.flat();
  check("no mission scheduled twice (each in exactly one wave)", new Set(flat).size===flat.length);
  // 13 — invalid opts ⇒ empty plan, nothing silently scheduled
  check("invalid maxConcurrency ⇒ empty plan (fatal)", P.plan([{id:"a"}], {maxConcurrency:0}).stats.fatal==="INVALID_MAX_CONCURRENCY" && P.plan([{id:"a"}],{maxConcurrency:0}).scheduled.length===0);
  check("non-array missions ⇒ empty plan", P.plan("nope",{maxConcurrency:2}).stats.fatal==="INVALID_MISSIONS");
  // 14 — purity: input not mutated; output frozen
  const src=[{id:"a"},{id:"b",deps:["a"]}]; const snap=JSON.stringify(src); const out=P.plan(src,{maxConcurrency:2});
  check("inputs not mutated", JSON.stringify(src)===snap);
  check("output + waves frozen", Object.isFrozen(out) && Object.isFrozen(out.waves) && Object.isFrozen(out.waves[0]));
  // 15 — mixed: deps + budget interplay (b,c depend on a; weights force b,c into separate waves)
  const r15=P.plan([{id:"a",weight:1},{id:"b",deps:["a"],weight:4},{id:"c",deps:["a"],weight:4}], {maxConcurrency:5, resourceBudget:5});
  check("budget splits a parallel pair across waves ([a] then [b] then [c])", r15.waves.length===3 && r15.scheduled.length===3);
  // 16 — D2 fix: TRANSITIVE dangling dep ⇒ UNKNOWN_DEP (not mislabeled CYCLE)
  const r16=P.plan([{id:"a",deps:["ghost"]},{id:"b",deps:["a"]}], {maxConcurrency:2});
  check("transitive dangling: a AND b ⇒ UNKNOWN_DEP (b not mislabeled CYCLE)", r16.unscheduled.every((u:any)=>u.reason==="UNKNOWN_DEP") && r16.unscheduled.length===2 && r16.scheduled.length===0);
  // 17 — a REAL cycle beside a transitive-unknown chain: cycle→CYCLE, chain→UNKNOWN_DEP, branch scheduled
  const r17=P.plan([{id:"x"},{id:"c1",deps:["c2"]},{id:"c2",deps:["c1"]},{id:"u1",deps:["ghost"]},{id:"u2",deps:["u1"]}], {maxConcurrency:3});
  check("mixed: c1/c2 CYCLE, u1/u2 UNKNOWN_DEP, x scheduled", r17.scheduled.includes("x") && r17.unscheduled.filter((u:any)=>u.reason==="CYCLE").length===2 && r17.unscheduled.filter((u:any)=>u.reason==="UNKNOWN_DEP").length===2);
  // 18 — D1 fix: invalid-opts unscheduled is SORTED (deterministic regardless of input order)
  const bad1=P.plan([{id:"z"},{id:"a"},{id:"m"}], {maxConcurrency:0});
  const bad2=P.plan([{id:"m"},{id:"z"},{id:"a"}], {maxConcurrency:0});
  check("invalid-opts path deterministic: unscheduled sorted + identical under input permutation", JSON.stringify(bad1.unscheduled)===JSON.stringify(bad2.unscheduled) && bad1.unscheduled[0].id==="a");
  process.stdout.write("\n"+(failures===0?"ALL PASS — parallel-execution-planner O1 (dep-respecting concurrency+resource waves, fail-closed cycle/unknown/dup/oversized, deterministic, pure)":failures+" FAIL")+"\n");
  process.exit(failures===0?0:1);
}
main();
export {};
