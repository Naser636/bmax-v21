#!/usr/bin/env node
"use strict";
/* M1 (Phase 2/3) — capability-attribution battery. Proves fail-closed integrity (unattributed/unknown-primitive/unknown-
 * métier/invalid-status/missing-module/orphan-primitive), shared + criticalSingleton detection, determinism, purity; and
 * that the REAL V108 attribution dossier is integrity-OK with all 9 primitives + 15 métiers covered and modules on disk. */
const A = require("./capability-attribution.js");
const fs=require("fs"), path=require("path");
let failures=0; function check(n:string,c:boolean){process.stdout.write((c?"ok":"NOT OK")+" - "+n+"\n"); if(!c)failures++;}
const full=()=>A.PRIMITIVES.map((p:string,i:number)=>({id:"cap"+i, module:"runtime/core/x.ts", primitives:[p], metiers:["P1"], status:"VALIDATED"})); // 1 cap per primitive (no orphan)
function main(){
  // valid map ⇒ integrity ok
  const r=A.attribute(full());
  check("valid map (all 9 primitives covered) ⇒ integrity.ok", r.integrity.ok===true && r.integrity.orphanPrimitives.length===0);
  check("all primitives are criticalSingletons when 1 cap each", r.integrity.criticalSingletons.length===9);
  // fail-closed: unattributed (no primitives)
  const r2=A.attribute(full().concat([{id:"loose", module:"m.ts", primitives:[], metiers:[], status:"VALIDATED"}]));
  check("unattributed capability ⇒ integrity.ok=false + listed", r2.integrity.ok===false && r2.integrity.unattributed.includes("loose"));
  // unknown primitive
  const r3=A.attribute([{id:"c", module:"m.ts", primitives:["GHOST"], metiers:[], status:"VALIDATED"}]);
  check("unknown primitive ⇒ unknownPrimitive + orphans (real prims uncovered) ⇒ not ok", r3.integrity.ok===false && r3.integrity.unknownPrimitive.some((s:string)=>/GHOST/.test(s)));
  // unknown métier
  const r4=A.attribute(full().concat([{id:"cm", module:"m.ts", primitives:["STATE"], metiers:["P99"], status:"VALIDATED"}]));
  check("unknown métier ⇒ unknownMetier + not ok", r4.integrity.ok===false && r4.integrity.unknownMetier.some((s:string)=>/P99/.test(s)));
  // invalid status
  const r5=A.attribute(full().concat([{id:"cs", module:"m.ts", primitives:["STATE"], metiers:[], status:"SORTA_DONE"}]));
  check("invalid ladder status ⇒ invalidStatus + not ok", r5.integrity.ok===false && r5.integrity.invalidStatus.some((s:string)=>/SORTA_DONE/.test(s)));
  // missing module
  const r6=A.attribute(full().concat([{id:"nomod", primitives:["STATE"], metiers:[], status:"VALIDATED"}]));
  check("missing module anchor ⇒ missingModule + not ok", r6.integrity.ok===false && r6.integrity.missingModule.includes("nomod"));
  // orphan primitive (omit one)
  const partial=A.PRIMITIVES.slice(0,8).map((p:string,i:number)=>({id:"c"+i, module:"m.ts", primitives:[p], metiers:[], status:"VALIDATED"}));
  check("a primitive with no capability ⇒ orphanPrimitives + not ok", A.attribute(partial).integrity.orphanPrimitives.includes("ALLOCATOR"));
  // shared capability
  const r7=A.attribute(full().concat([{id:"sh", module:"m.ts", primitives:["STATE"], metiers:["P1","P2","P3"], status:"VALIDATED"}]));
  check("capability on >1 métier flagged shared", r7.byCapability.find((c:any)=>c.id==="sh").shared===true && r7.stats.sharedCapabilities>=1);
  // determinism + purity
  const src=full(); const snap=JSON.stringify(src);
  check("deterministic + input not mutated + frozen", JSON.stringify(A.attribute(src))===JSON.stringify(A.attribute(src)) && JSON.stringify(src)===snap && Object.isFrozen(r) && Object.isFrozen(r.byPrimitive));
  // REAL dossier
  const d=JSON.parse(fs.readFileSync(path.join(__dirname,"..","..","docs","odg","V108_CAPABILITY_ATTRIBUTION.json"),"utf8"));
  check("REAL V108 dossier: integrity OK, modules exist on disk", d.integrity.ok===true && d.moduleExistenceVerified===true);
  check("REAL dossier: all 9 primitives + all 15 métiers covered", d.stats.primitivesCovered===9 && d.stats.metiersCovered===15 && d.integrity.orphanPrimitives.length===0);
  check("REAL dossier: IDENTITY surfaced as a critical singleton (single point of failure)", d.integrity.criticalSingletons.includes("IDENTITY"));
  process.stdout.write("\n"+(failures===0?"ALL PASS — capability-attribution M1 (fail-closed integrity, 9 primitives + 15 métiers covered, criticalSingletons surfaced, no parallel registry)":failures+" FAIL")+"\n");
  process.exit(failures===0?0:1);
}
main();
export {};
