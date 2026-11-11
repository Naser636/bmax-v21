#!/usr/bin/env node
"use strict";
/* M2 (Phase 5) — golden-evaluation battery. Proves: evaluate() scores a golden set with provenance+digest; shadow mode
 * OBSERVES candidate vs reference WITHOUT acting (acted:false) and flags regressions-vs-reference; detectRegression finds
 * pass->fail regressions; fail-closed on an invalid golden set. */
const G = require("./golden-evaluation.js");
let failures=0; function check(n:string,c:boolean){process.stdout.write((c?"ok":"NOT OK")+" - "+n+"\n"); if(!c)failures++;}
const golden=[{id:"a",input:1,expected:1},{id:"b",input:2,expected:4},{id:"c",input:3,expected:9}];
function main(){
  // evaluate
  const sq=(x:number)=>x*x; const lin=(x:number)=>x;  // lin passes only 'a' (1==1)
  const ev=G.evaluate(golden, sq, {meta:{system:"sq",version:1}});
  check("evaluate: perfect solver passRate 1.0 + provenance digest + NOT_MEASURED", ev.result.passRate===1 && ev.provenance.digest.length===64 && ev.provenance.externalComparison==="NOT_MEASURED");
  // invalid golden set (missing expected)
  check("invalid golden set (missing expected) ⇒ fatal", G.evaluate([{id:"x",input:1}], sq, {}).fatal==="INVALID_GOLDEN_SET");
  // SHADOW MODE — candidate (lin) vs reference (sq), observe-only
  const sh=G.shadowCompare(golden, lin, sq, {});
  check("shadow mode never acts (acted:false)", sh.acted===false);
  check("shadow: reference (sq) passes all 3, candidate (lin) passes only 'a'", sh.referencePassRate===1 && sh.candidatePassRate===0.3333);
  check("shadow: regressionsVsReference = [b,c] (ref passes, candidate fails)", sh.regressionsVsReference.includes("b") && sh.regressionsVsReference.includes("c") && !sh.regressionsVsReference.includes("a"));
  check("shadow: NOT safe to promote (candidate regresses vs reference)", sh.safeToPromote===false);
  // shadow where candidate == reference ⇒ safe to promote, no divergence
  const sh2=G.shadowCompare(golden, sq, sq, {});
  check("shadow: identical candidate ⇒ agreementRate 1.0, safeToPromote true", sh2.agreementRate===1 && sh2.safeToPromote===true && sh2.divergences.length===0);
  // shadow: candidate throwing is isolated (candidateError), not a crash, not safe
  const sh3=G.shadowCompare(golden, (x:number)=>{if(x===2)throw new Error("boom");return x*x;}, sq, {});
  check("shadow: candidate throw ⇒ candidateError recorded, safeToPromote false", sh3.perCase.find((p:any)=>p.id==="b").candidateError && sh3.safeToPromote===false);
  // REGRESSION DETECTION
  const B=require("./benchmark-baseline.js");
  const baseline=B.runBaseline(golden, sq, {});                 // all pass
  const broken=B.runBaseline(golden, (x:number)=>x===2?0:x*x, {}); // 'b' now fails
  const reg=G.detectRegression(broken, baseline);
  check("detectRegression: pass->fail on 'b' ⇒ REGRESSION, regressed=[b]", reg.verdict==="REGRESSION" && reg.regressed.includes("b") && reg.passRateDelta<0);
  const fixed=B.runBaseline(golden, sq, {});
  check("detectRegression: identical ⇒ STABLE + sameDigest", G.detectRegression(fixed, baseline).verdict==="STABLE" && G.detectRegression(fixed, baseline).sameDigest===true);
  const better=B.runBaseline(golden.concat([{id:"d",input:5,expected:25}]), sq, {});
  check("detectRegression: new passing case ⇒ IMPROVEMENT + newCases=[d]", G.detectRegression(better, baseline).verdict==="IMPROVEMENT" && G.detectRegression(better, baseline).newCases.includes("d"));
  // purity + frozen
  check("outputs frozen", Object.isFrozen(ev) && Object.isFrozen(sh) && Object.isFrozen(reg));
  check("deterministic shadow", JSON.stringify(G.shadowCompare(golden,lin,sq,{}))===JSON.stringify(G.shadowCompare(golden,lin,sq,{})));
  // empty golden set ⇒ NOT vacuously safe to promote (independent-validator hardening)
  check("empty golden set ⇒ safeToPromote FALSE (no vacuous promotion)", G.shadowCompare([], sq, sq, {}).safeToPromote===false);
  process.stdout.write("\n"+(failures===0?"ALL PASS — golden-evaluation M2 (golden set + provenance + shadow-no-act + regression detection, fail-closed)":failures+" FAIL")+"\n");
  process.exit(failures===0?0:1);
}
main();
export {};
