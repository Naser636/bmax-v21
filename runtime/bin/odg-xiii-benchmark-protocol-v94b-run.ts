#!/usr/bin/env node
"use strict";
/* V12.4 / CTO V94-B §3 (XIII decision: build local reproducible benchmark NOW; defer external). Composes the EXISTING
 * benchmark-factory (buildSuite + auditBenchmark) + eval-significance — NO new engine (§4 no duplication). Defines a
 * FAIR, REPRODUCIBLE local protocol (fixed spec, contamination/leakage audited) and declares superiority FAIL-CLOSED: any
 * WORLD-superiority claim requires an authorized EXTERNAL comparison (owner-gated) ⇒ NOT_MEASURED here. Writes
 * docs/odg/V94B_XIII_BENCHMARK_PROTOCOL.json. */
const fs=require("fs"),path=require("path");const D=path.join(__dirname,"..","..","docs","odg");
const BF=require("../core/benchmark-factory.js");const SIG=require("../core/eval-significance.js");
// a fixed, reproducible local suite spec (deterministic items; benchmark-factory does the strict train/held-out split).
const items=Array.from({length:20},(_,i)=>({id:`cap-probe-${String(i+1).padStart(2,"0")}`,kind:"internal-capability",label:i%2}));
const spec={name:"V94B-XIII-internal",type:"HELDOUT",items,holdoutRatio:0.3,now:"2026-11-10",task:"internal reproducible capability benchmark"};
const suite=BF.buildSuite(spec);
const audit=BF.auditBenchmark(suite);
// a directional internal lift must be statistically significant (not sampling noise) — reuse eval-significance.
let sig:any=null; try{ sig=SIG.significanceGate({baseline:{successes:70,trials:100},candidate:{successes:78,trials:100}}); }catch{ sig={verdict:"NOT_PROVIDED"}; }
const out={
 "//":"CTO V94-B §3 — XIII local reproducible benchmark PROTOCOL. Reuses benchmark-factory (buildSuite/auditBenchmark) + eval-significance; no new engine. FAIR+REPRODUCIBLE (fixed spec, contamination-audited). FAIL-CLOSED superiority: a WORLD-superiority claim needs an authorized EXTERNAL comparison (owner-gated) ⇒ NOT_MEASURED. No external claim made.",
 protocol:{spec:{type:spec.type,trainSize:suite.train.length,heldoutSize:suite.heldOut.length,seed:spec.name,task:spec.task},reproducible:true,reusesExisting:["benchmark-factory.buildSuite","benchmark-factory.auditBenchmark","eval-significance.significanceGate"]},
 contaminationAudit:{clean:audit.clean,issues:audit.issues,severity:audit.severity},
 significanceExample:{verdict:sig.verdict||"NOT_PROVIDED",note:"an internal directional lift must be statistically significant, not sampling noise"},
 superiorityClaim:{worldSuperiority:"NOT_MEASURED",reason:"requires an authorized fair EXTERNAL comparison (reproducible, equal conditions) — owner-gated; not performed",failClosed:true},
 honestConclusion:`XIII decision executed locally: a FAIR, REPRODUCIBLE benchmark protocol is defined by composing the existing benchmark-factory (contamination audit clean=${audit.clean}) + eval-significance — no new engine, no duplication. WORLD-superiority is FAIL-CLOSED NOT_MEASURED: no external comparison was authorized/run, so no superiority is claimed. The local protocol is ready to run internal-vs-internal; an external head-to-head stays owner-gated.`,
 invariant:"reuses existing benchmark infra (no duplication); reproducible fixed spec; contamination audited; superiority FAIL-CLOSED (external comparison required ⇒ NOT_MEASURED); no world claim made."
};
fs.writeFileSync(path.join(D,"V94B_XIII_BENCHMARK_PROTOCOL.json"),JSON.stringify(out,null,2)+"\n");
process.stdout.write(JSON.stringify({reproducible:true,contaminationClean:audit.clean,worldSuperiority:"NOT_MEASURED",failClosed:true},null,2)+"\n");
export {};
