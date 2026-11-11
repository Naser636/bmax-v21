#!/usr/bin/env node
"use strict";
/* G1 — spend-governor adversarial battery. Proves fail-closed multi-dimensional caps (global/provider/day/mission),
 * the UNCAPPED_PROVIDER deny-by-default, the anti-loop window guard, multi-breach reporting, and input validation. */
const SG = require("./spend-governor.js");
let failures=0; function check(n:string,c:boolean){process.stdout.write((c?"ok":"NOT OK")+" - "+n+"\n"); if(!c)failures++;}
const DAY1 = Date.UTC(2026,10,11,12,0,0);   // 2026-11-11
const DAY2 = Date.UTC(2026,10,12,12,0,0);   // 2026-11-12
const R = (o:any)=>Object.assign({provider:"anthropic",mission:"m1",actionKey:"a1",amount:10},o);
function main(){
  // 1 — admit within caps
  const caps = { global:1000, perProvider:{caps:{anthropic:100, openai:50}}, perDay:200, perMission:80, loop:{windowMs:60000, maxRepeats:3} };
  check("ADMIT when all dimensions within caps", SG.govern(R({}), [], caps, DAY1).decision===SG.DECISION.ADMIT);
  // 2 — provider cap breach
  const hP = [ {at:DAY1,provider:"anthropic",mission:"m1",amount:95,actionKey:"x"} ];
  const dP = SG.govern(R({amount:10}), hP, caps, DAY1);
  check("PROVIDER_CAP: 95+10 > 100 ⇒ DENY with PROVIDER_CAP", dP.decision==="DENY" && dP.reasons.includes("PROVIDER_CAP"));
  // 3 — uncapped provider ⇒ fail-closed DENY
  const dU = SG.govern(R({provider:"mystery"}), [], caps, DAY1);
  check("UNCAPPED_PROVIDER: provider not in caps + no default ⇒ DENY", dU.decision==="DENY" && dU.reasons.includes("UNCAPPED_PROVIDER"));
  // 4 — provider default cap applies
  const capsDef = { perProvider:{ default:5 } };
  check("provider default cap applies (6 > 5 ⇒ DENY)", SG.govern(R({provider:"x",amount:6}), [], capsDef, DAY1).reasons.includes("PROVIDER_CAP"));
  check("provider default cap admits within (4 <= 5)", SG.govern(R({provider:"x",amount:4}), [], capsDef, DAY1).decision==="ADMIT");
  // 5 — daily cap breach (same UTC day sums)
  const hDay = [ {at:DAY1,provider:"anthropic",mission:"mA",amount:150,actionKey:"x"} ];
  check("DAILY_CAP: 150+60 > 200 same day ⇒ DENY", SG.govern(R({mission:"mB",amount:60}), hDay, caps, DAY1).reasons.includes("DAILY_CAP"));
  // 6 — daily cap resets next day (prior-day spend excluded)
  check("DAILY resets: a DAY1 spend does not count on DAY2", !SG.govern(R({mission:"mB",amount:60}), hDay, caps, DAY2).reasons.includes("DAILY_CAP"));
  // 7 — mission cap breach
  const hM = [ {at:DAY1,provider:"anthropic",mission:"m1",amount:75,actionKey:"x"} ];
  check("MISSION_CAP: 75+10 > 80 ⇒ DENY", SG.govern(R({amount:10}), hM, caps, DAY1).reasons.includes("MISSION_CAP"));
  // 8 — global cap breach
  const hG = [ {at:DAY1,provider:"openai",mission:"mZ",amount:995,actionKey:"x"} ];
  check("GLOBAL_CAP: 995+10 > 1000 ⇒ DENY", SG.govern(R({provider:"openai",mission:"mZ",amount:10}), hG, {global:1000}, DAY1).reasons.includes("GLOBAL_CAP"));
  // 9 — loop guard: 3 same-actionKey within window ⇒ the 4th DENY; outside window ⇒ ADMIT
  const hLoop = [1,2,3].map(i=>({at:DAY1-1000*i,provider:"anthropic",mission:"m1",amount:1,actionKey:"loopy"}));
  check("LOOP_GUARD: 3 prior 'loopy' within 60s window ⇒ DENY", SG.govern(R({actionKey:"loopy",amount:1}), hLoop, caps, DAY1).reasons.includes("LOOP_GUARD"));
  const hLoopOld = [1,2,3].map(i=>({at:DAY1-120000*i,provider:"anthropic",mission:"m1",amount:1,actionKey:"loopy"}));
  check("LOOP_GUARD: same 3 OUTSIDE the 60s window ⇒ ADMIT", SG.govern(R({actionKey:"loopy",amount:1}), hLoopOld, caps, DAY1).decision==="ADMIT");
  // 10 — multi-breach reports all
  const hMulti = [ {at:DAY1,provider:"anthropic",mission:"m1",amount:99,actionKey:"x"} ];  // provider 99 (cap100), mission 99 (cap80), day 99 (cap200 ok)
  const dMulti = SG.govern(R({amount:10}), hMulti, caps, DAY1);  // +10 ⇒ provider 109>100, mission 109>80
  check("multi-breach lists BOTH PROVIDER_CAP and MISSION_CAP", dMulti.reasons.includes("PROVIDER_CAP") && dMulti.reasons.includes("MISSION_CAP"));
  // 11 — fail-closed on invalid inputs
  check("invalid amount (negative) ⇒ DENY INVALID_AMOUNT", SG.govern(R({amount:-1}), [], caps, DAY1).reasons.includes("INVALID_AMOUNT"));
  check("invalid amount (NaN/missing) ⇒ DENY", SG.govern(R({amount:undefined}), [], caps, DAY1).decision==="DENY");
  check("missing provider/mission/actionKey ⇒ DENY INVALID_REQUEST", SG.govern({amount:5}, [], caps, DAY1).reasons.includes("INVALID_REQUEST"));
  check("non-array history ⇒ DENY INVALID_HISTORY", SG.govern(R({}), "nope", caps, DAY1).reasons.includes("INVALID_HISTORY"));
  check("non-number nowMs ⇒ DENY INVALID_TIME", SG.govern(R({}), [], caps, "soon").reasons.includes("INVALID_TIME"));
  // 12 — zero spend always admissible when totals are AT (not over) the caps (adds nothing)
  const caps12 = { perProvider:{caps:{anthropic:100}}, perMission:200, perDay:500, global:1000 };
  const hAt = [ {at:DAY1,provider:"anthropic",mission:"m1",amount:100,actionKey:"x"} ];  // provider exactly at cap 100; others within
  check("amount=0 admissible when provider is exactly at cap (0 adds nothing)", SG.govern(R({amount:0}), hAt, caps12, DAY1).decision==="ADMIT");
  // 13 — cap of 0 denies any positive spend
  check("cap 0 ⇒ any positive amount DENY", SG.govern(R({provider:"z",amount:1}), [], {perProvider:{caps:{z:0}}}, DAY1).reasons.includes("PROVIDER_CAP"));
  // 14 — record() appends an admitted spend; output frozen
  const rec = SG.record([], R({amount:7}), DAY1);
  check("record() appends the spend (at+provider+mission+amount+actionKey)", rec.length===1 && rec[0].amount===7 && rec[0].at===DAY1 && rec[0].provider==="anthropic");
  check("govern output is frozen (immutable decision)", Object.isFrozen(SG.govern(R({}), [], caps, DAY1)));
  // 15 — no caps object ⇒ nothing to breach ⇒ ADMIT (governor only denies what is configured + validity)
  check("empty caps ⇒ ADMIT a valid request (no dimension configured)", SG.govern(R({}), [], {}, DAY1).decision==="ADMIT");
  // 16 — FAIL-CLOSED CONFIG (independent-validator finding): a PRESENT but malformed cap DENIES, never silently disables
  check("malformed global cap \"1000\" ⇒ DENY INVALID_GLOBAL_CAP (not fail-open ADMIT)", SG.govern(R({amount:1e9}), [], {global:"1000"}, DAY1).reasons.includes("INVALID_GLOBAL_CAP"));
  check("negative perDay ⇒ DENY INVALID_DAILY_CAP", SG.govern(R({amount:1e9}), [], {perDay:-5}, DAY1).reasons.includes("INVALID_DAILY_CAP"));
  check("NaN perMission ⇒ DENY INVALID_MISSION_CAP", SG.govern(R({amount:1e9}), [], {perMission:NaN}, DAY1).reasons.includes("INVALID_MISSION_CAP"));
  check("Infinity loop window ⇒ DENY INVALID_LOOP_CONFIG (guard never silently off)", SG.govern(R({}), [], {loop:{windowMs:Infinity,maxRepeats:1}}, DAY1).reasons.includes("INVALID_LOOP_CONFIG"));
  check("malformed loop maxRepeats \"3\" ⇒ DENY INVALID_LOOP_CONFIG", SG.govern(R({}), [], {loop:{windowMs:1000,maxRepeats:"3"}}, DAY1).reasons.includes("INVALID_LOOP_CONFIG"));
  check("non-object perProvider ⇒ DENY INVALID_PROVIDER_CONFIG", SG.govern(R({}), [], {perProvider:"nope"}, DAY1).reasons.includes("INVALID_PROVIDER_CONFIG"));
  check("well-formed caps still ADMIT (config validation no false-positive)", SG.govern(R({amount:1}), [], {global:1000,perDay:200,perMission:80,perProvider:{caps:{anthropic:100}},loop:{windowMs:60000,maxRepeats:3}}, DAY1).decision==="ADMIT");
  process.stdout.write("\n"+(failures===0?"ALL PASS — spend-governor G1 (fail-closed per-provider/day/mission/global caps + anti-loop guard + validation)":failures+" FAIL")+"\n");
  process.exit(failures===0?0:1);
}
main();
export {};
