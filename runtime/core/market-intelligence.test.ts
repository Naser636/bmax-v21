#!/usr/bin/env node
"use strict";
/* I1 — market-intelligence battery. Proves deterministic competitive positioning, whitespace detection, and the
 * ANTI-FABRICATION guarantee: market figures come only from sourced dataPoints, else INSUFFICIENT_DATA; confidence is
 * bounded by the weakest cited source; never fetches live data. */
const M = require("./market-intelligence.js");
let failures=0; function check(n:string,c:boolean){process.stdout.write((c?"ok":"NOT OK")+" - "+n+"\n"); if(!c)failures++;}
const base={
  ourOffer:{price:100, features:["api","sso","audit"]},
  demandedFeatures:["api","sso","audit","sla"],
  competitors:[
    {name:"Acme", attributes:{price:120, features:["api","sla"]}},
    {name:"Beta", attributes:{price:80, features:["api","sso"]}},
  ],
  market:{ dataPoints:[{metric:"TAM", value:5000000, source:"Statista-2026", credibility:"MEDIUM"}], metricsRequested:["TAM","SAM"] },
};
function main(){
  const r=M.analyze(base);
  // positioning
  const acme=r.positioning.find((p:any)=>p.competitor==="Acme");
  check("positioning: vs Acme (120>100) ⇒ WE_ARE_CHEAPER", acme.priceVsOurs==="WE_ARE_CHEAPER");
  check("positioning: Acme advantage=[sla], our advantage over Acme includes sso+audit", acme.theirAdvantages.includes("sla") && acme.ourAdvantages.includes("sso") && acme.ourAdvantages.includes("audit"));
  const beta=r.positioning.find((p:any)=>p.competitor==="Beta");
  check("positioning: vs Beta (80<100) ⇒ WE_ARE_PRICIER", beta.priceVsOurs==="WE_ARE_PRICIER");
  // whitespace: audit is demanded + we offer + no competitor offers ⇒ whitespace
  check("whitespace includes 'audit' (demanded, ours, no competitor has it)", Array.isArray(r.whitespace) && r.whitespace.includes("audit"));
  check("whitespace excludes 'sla' (we don't offer it)", !r.whitespace.includes("sla"));
  // ANTI-FABRICATION: SAM requested but not provided ⇒ INSUFFICIENT_DATA, never invented
  check("marketSizing.TAM from sourced dataPoint (5,000,000 w/ source)", r.marketSizing.TAM.value===5000000 && r.marketSizing.TAM.source==="Statista-2026");
  check("marketSizing.SAM requested but unsourced ⇒ INSUFFICIENT_DATA (NOT invented)", r.marketSizing.SAM==="INSUFFICIENT_DATA");
  check("provenance cites every figure used", r.provenance.some((s:string)=>/TAM=5000000.*Statista-2026/.test(s)));
  // confidence bounded by weakest cited source (MEDIUM here)
  check("confidence = MEDIUM (weakest cited source)", r.confidence==="MEDIUM");
  // opportunityScore deterministic + in range
  check("opportunityScore deterministic number in [0,1]", typeof r.opportunityScore==="number" && r.opportunityScore>=0 && r.opportunityScore<=1 && M.analyze(base).opportunityScore===r.opportunityScore);
  check("never fetches live data", r.liveDataFetched===false);
  // INSUFFICIENT_DATA when inputs absent
  const r2=M.analyze({competitors:[{name:"X",attributes:{}}]});
  check("no ourOffer/demand ⇒ whitespace + opportunityScore INSUFFICIENT_DATA", r2.whitespace==="INSUFFICIENT_DATA" && r2.opportunityScore==="INSUFFICIENT_DATA");
  check("no sourced market data ⇒ confidence LOW", r2.confidence==="LOW");
  // unknown credibility string ⇒ treated as LOW (fail-closed)
  const r3=M.analyze({ourOffer:{price:1,features:["a"]},demandedFeatures:["a"],competitors:[{name:"C",attributes:{price:2,features:[]}}],market:{dataPoints:[{metric:"TAM",value:9,source:"blog",credibility:"BOGUS"}],metricsRequested:["TAM"]}});
  check("unknown credibility ⇒ LOW (fail-closed), figure still sourced", r3.confidence==="LOW" && r3.marketSizing.TAM.value===9);
  // purity / frozen
  check("output frozen", Object.isFrozen(r) && Object.isFrozen(r.positioning) && Object.isFrozen(r.marketSizing));
  const snap=JSON.stringify(base); M.analyze(base); check("input not mutated", JSON.stringify(base)===snap);
  // empty input ⇒ graceful INSUFFICIENT_DATA, no crash
  check("empty input ⇒ graceful (no positioning, INSUFFICIENT_DATA)", M.analyze({}).positioning.length===0 && M.analyze(null).opportunityScore==="INSUFFICIENT_DATA");
  process.stdout.write("\n"+(failures===0?"ALL PASS — market-intelligence I1 (deterministic positioning + whitespace + anti-fabrication market sizing + source-bounded confidence, no live fetch)":failures+" FAIL")+"\n");
  process.exit(failures===0?0:1);
}
main();
export {};
