#!/usr/bin/env node
"use strict";
/* V135 seed A — capability-traceability battery. Proves the NEED→…→MAINTENANCE chain validator is FAIL-CLOSED: a complete
 * chain with resolving file refs passes; a missing link OR a broken file reference is REJECTED; and the REAL RECOVERY
 * traceability dossier validates (all refs resolve). */
const T=require("./capability-traceability.js");
const fs=require("fs"),path=require("path");
let failures=0; function check(n:string,c:boolean){process.stdout.write((c?"ok":"NOT OK")+" - "+n+"\n"); if(!c)failures++;}
const FULL=()=>({capability:"X",links:{need:"n",requirement:"r",acceptance:"a",component:"c.ts",contract:"ct.ts",implementation:"i.ts",test:"t.ts",evidence:"e",incidents:"inc.jsonl",observation:"o",maintenance:"m"}});
const existsAll=()=>true;  // injected resolver: all files resolve
function main(){
  // complete chain + all refs resolve ⇒ ok
  check("complete chain, all file refs resolve ⇒ ok", T.validateTrace(FULL(),{exists:existsAll}).ok===true);
  // missing a required link ⇒ REJECTED
  const miss:any=FULL(); delete miss.links.maintenance;
  check("missing link (maintenance) ⇒ REJECTED + listed", (()=>{const r=T.validateTrace(miss,{exists:existsAll});return r.ok===false&&r.missingLinks.includes("maintenance")})());
  // empty/blank link ⇒ REJECTED
  const blank=FULL(); blank.links.need="   ";
  check("blank link ⇒ REJECTED (non-empty required)", T.validateTrace(blank,{exists:existsAll}).ok===false);
  // broken file reference ⇒ REJECTED
  const broken=FULL();
  check("broken file reference (component) ⇒ REJECTED + brokenRefs", (()=>{const r=T.validateTrace(broken,{exists:(p:string)=>p!=="c.ts"});return r.ok===false&&r.brokenRefs.some((b:any)=>b.link==="component"&&b.path==="c.ts")})());
  // array of file refs: one broken ⇒ REJECTED
  const arr:any=FULL(); arr.links.component=["a.ts","b.ts"];
  check("array file refs: one unresolved ⇒ REJECTED", T.validateTrace(arr,{exists:(p:string)=>p==="a.ts"}).ok===false);
  // fail-closed on garbage input
  check("empty/garbage trace ⇒ not ok (fail-closed)", T.validateTrace({},{exists:existsAll}).ok===false && T.validateTrace(null,{exists:existsAll}).ok===false);
  // output frozen + deterministic
  check("output frozen + deterministic", Object.isFrozen(T.validateTrace(FULL(),{exists:existsAll})) && JSON.stringify(T.validateTrace(FULL(),{exists:existsAll}))===JSON.stringify(T.validateTrace(FULL(),{exists:existsAll})));
  // REAL RECOVERY dossier validates against the real repo
  const d=JSON.parse(fs.readFileSync(path.join(__dirname,"..","..","docs","odg","V135_RECOVERY_TRACEABILITY.json"),"utf8"));
  const real=T.validateTrace(d.trace,{root:path.join(__dirname,"..","..")});
  // PORTABLE: all file refs (incl. incidents) are repo-relative and resolve in CI AND on-host — re-validated here against the real repo.
  check("REAL RECOVERY traceability: complete + all refs resolve (0 missing, 0 broken, portable)", real.ok===true && real.missingLinks.length===0 && real.brokenRefs.length===0 && real.resolvedRefs>=9);
  // observation is backed by the runtime incidents ledger, recorded as CAPTURED-ON-HOST provenance (the ledger is a host artifact,
  // legitimately absent off-host; the dossier records the host path + recover-class count stamped at on-host build time).
  check("RECOVERY observation backed by on-host incidents-ledger provenance (recorded, not a portable file; not fixtures)", /ACTIVE_IN_PRODUCTION/.test(d.trace.links.observation) && d.incidentsLedger && typeof d.incidentsLedger.hostPath==="string" && d.incidentsLedger.recoverClassEvents>=1 && d.recoverEventsInIncidents===d.incidentsLedger.recoverClassEvents);
  process.stdout.write("\n"+(failures===0?"ALL PASS — capability-traceability (fail-closed chain validation; missing-link + broken-ref REJECTED; real RECOVERY chain resolves)":failures+" FAIL")+"\n");
  process.exit(failures===0?0:1);
}
main();
export {};
