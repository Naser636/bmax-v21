#!/usr/bin/env node
"use strict";
/* V108 M1 (Phase 2/3) — attach capabilities to the 9 primitives + 15 métiers, qualified + integrity-validated. NOT a
 * parallel registry: a qualification layer; every entry cites a real runtime/core module (existence verified here).
 * Writes docs/odg/V108_CAPABILITY_ATTRIBUTION.json. */
const fs=require("fs"),path=require("path");
const ROOT=path.join(__dirname,"..",".."),D=path.join(ROOT,"docs","odg");
const A=require(path.join(ROOT,"runtime","core","capability-attribution.js"));
const M=(p:string)=>"runtime/core/"+p+".ts";
// Evidence-anchored capability map. status: VALIDATED=gate-tested; ACTIVE_IN_PRODUCTION=runs on a service w/ real evidence.
const CAPS=[
  // --- primitive backbone ---
  {id:"identity", module:M("actor-provenance"), primitives:["IDENTITY"], metiers:[], status:"VALIDATED"},
  {id:"state-model", module:M("runtime-model"), primitives:["STATE"], metiers:[], status:"VALIDATED"},
  {id:"state-transition", module:M("state-transition"), primitives:["STATE"], metiers:[], status:"VALIDATED"},
  {id:"contract", module:M("api-contract"), primitives:["CONTRACT"], metiers:["P1","P5"], status:"VALIDATED"},
  {id:"mission-contract", module:M("mission-contract-factory"), primitives:["CONTRACT"], metiers:[], status:"VALIDATED"},
  {id:"action-gate", module:M("action-gate"), primitives:["POLICY"], metiers:[], status:"VALIDATED"},
  {id:"local-work-mandate", module:M("local-work-mandate"), primitives:["POLICY"], metiers:[], status:"VALIDATED"},
  {id:"mission-resolver", module:M("coding-mission-resolver"), primitives:["RESOLVER"], metiers:["P1"], status:"VALIDATED"},
  {id:"decision-engine", module:M("decision-engine"), primitives:["RESOLVER"], metiers:[], status:"VALIDATED"},
  {id:"executor", module:M("capability-executors"), primitives:["EXECUTOR"], metiers:["P1","P2","P5"], status:"VALIDATED"},
  {id:"engineering-executor", module:M("engineering-executor"), primitives:["EXECUTOR"], metiers:["P1","P5"], status:"VALIDATED"},
  {id:"evidence-provenance", module:M("evidence-provenance"), primitives:["EVIDENCE"], metiers:[], status:"VALIDATED"},
  {id:"audit-log", module:M("audit-log"), primitives:["EVIDENCE"], metiers:[], status:"VALIDATED"},
  {id:"recovery-engine", module:M("build-recovery-engine"), primitives:["RECOVERY"], metiers:["P7"], status:"VALIDATED"},
  {id:"checkpoint-engine", module:M("checkpoint-engine"), primitives:["RECOVERY"], metiers:[], status:"VALIDATED"},
  {id:"fair-share-allocator", module:M("p12-weighted-fair-share-scheduler"), primitives:["ALLOCATOR"], metiers:["P12"], status:"VALIDATED"},
  {id:"budget-ledger", module:M("budget-ledger"), primitives:["ALLOCATOR","EVIDENCE"], metiers:["P9"], status:"VALIDATED"},
  // --- F6 assurance (EVIDENCE+POLICY) ---
  {id:"inspection-boundary", module:M("inspection-boundary"), primitives:["POLICY","EVIDENCE"], metiers:["P6"], status:"VALIDATED"},
  {id:"incremental-assurance", module:M("incremental-assurance"), primitives:["EVIDENCE"], metiers:["P6"], status:"VALIDATED"},
  {id:"evaluator-independence", module:M("evaluator-independence"), primitives:["POLICY","EVIDENCE"], metiers:["P6"], status:"VALIDATED"},
  {id:"regulatory-assurance", module:M("regulatory-assurance"), primitives:["POLICY"], metiers:["P10"], status:"VALIDATED"},
  {id:"security-control-plane", module:M("security-control-plane"), primitives:["POLICY"], metiers:["P3"], status:"VALIDATED"},
  {id:"emergency-stop", module:M("emergency-stop"), primitives:["POLICY","RECOVERY"], metiers:[], status:"VALIDATED"},
  // --- F7 resilience (RECOVERY, ACTIVE) ---
  {id:"self-diagnostic", module:M("self-diagnostic"), primitives:["RECOVERY"], metiers:["P7"], status:"VALIDATED"},
  {id:"fdir-engine", module:M("fdir-engine"), primitives:["RECOVERY"], metiers:["P7"], status:"VALIDATED"},
  // --- V107 new missions ---
  {id:"spend-governor", module:M("spend-governor"), primitives:["POLICY","ALLOCATOR"], metiers:["P9"], status:"VALIDATED"},
  {id:"parallel-execution-planner", module:M("parallel-execution-planner"), primitives:["RESOLVER","ALLOCATOR"], metiers:[], status:"VALIDATED"},
  {id:"benchmark-baseline", module:M("benchmark-baseline"), primitives:["EVIDENCE"], metiers:["P6"], status:"VALIDATED"},
  {id:"market-intelligence", module:M("market-intelligence"), primitives:["RESOLVER"], metiers:["P2"], status:"VALIDATED"},
  {id:"capability-attribution", module:M("capability-attribution"), primitives:["STATE","EVIDENCE"], metiers:[], status:"VALIDATED"},
  // --- métier execution capabilities (EXECUTOR) covering P1..P15 ---
  {id:"metier-P1-fullstack", module:M("profession-p1-fullstack-reference"), primitives:["EXECUTOR"], metiers:["P1"], status:"VALIDATED"},
  {id:"metier-P2-ai", module:M("profession-p2-ai-reference"), primitives:["EXECUTOR"], metiers:["P2"], status:"VALIDATED"},
  {id:"metier-P3-security", module:M("profession-p3-security-reference"), primitives:["EXECUTOR"], metiers:["P3"], status:"VALIDATED"},
  {id:"metier-P4-data", module:M("profession-p4-data-reference"), primitives:["EXECUTOR"], metiers:["P4"], status:"VALIDATED"},
  {id:"metier-P5-devplatform", module:M("developer-platform"), primitives:["EXECUTOR"], metiers:["P5"], status:"VALIDATED"},
  {id:"metier-P6-eval", module:M("profession-p6-eval-reference"), primitives:["EXECUTOR","EVIDENCE"], metiers:["P6"], status:"VALIDATED"},
  {id:"metier-P7-sre", module:M("profession-p7-sre-reference"), primitives:["EXECUTOR","RECOVERY"], metiers:["P7"], status:"VALIDATED"},
  {id:"metier-P8-semver", module:M("p8-semver-enforcement"), primitives:["EXECUTOR","CONTRACT"], metiers:["P8"], status:"VALIDATED"},
  {id:"metier-P9-finops", module:M("profession-p9-finops-reference"), primitives:["EXECUTOR","ALLOCATOR"], metiers:["P9"], status:"VALIDATED"},
  {id:"metier-P10-regulatory", module:M("profession-p10-regulatory-reference"), primitives:["EXECUTOR","POLICY"], metiers:["P10"], status:"VALIDATED"},
  {id:"metier-P11-document", module:M("profession-p11-document-reference"), primitives:["EXECUTOR"], metiers:["P11"], status:"VALIDATED"},
  {id:"metier-P12-streaming", module:M("profession-p12-streaming-reference"), primitives:["EXECUTOR","ALLOCATOR"], metiers:["P12"], status:"VALIDATED"},
  {id:"metier-P13-aiinfra", module:M("profession-p13-aiinfra-reference"), primitives:["EXECUTOR"], metiers:["P13"], status:"VALIDATED"},
  {id:"metier-P14-devex", module:M("profession-p14-devex-reference"), primitives:["EXECUTOR"], metiers:["P14"], status:"VALIDATED"},
  {id:"metier-P15-workflow", module:M("profession-p15-workflow-reference"), primitives:["EXECUTOR"], metiers:["P15"], status:"VALIDATED"},
];
// verify every cited module exists (anti-fabrication)
const missingOnDisk=CAPS.filter((c:any)=>!fs.existsSync(path.join(ROOT,c.module))).map((c:any)=>c.id+"→"+c.module);
const result=A.attribute(CAPS);
const out={
  "//":"V108 M1 (Phase 2/3) — capability attribution to 9 primitives + 15 métiers. NOT a parallel registry; qualification layer over the canonical register; every entry cites a real module (existence verified).",
  moduleExistenceVerified:missingOnDisk.length===0, missingOnDisk,
  byPrimitive:result.byPrimitive, byMetier:result.byMetier,
  integrity:result.integrity, stats:result.stats,
  byCapability:result.byCapability,
  status:(result.integrity.ok&&missingOnDisk.length===0)?"ATTRIBUTION_COMPLETE_integrity_OK":"INTEGRITY_FAIL",
  invariant:"every capability attached to >=1 of the 9 primitives; no unknown primitive/métier; valid ladder status; module anchors exist on disk; all 9 primitives covered (no orphan); no parallel registry; criticalSingletons surfaced.",
};
fs.writeFileSync(path.join(D,"V108_CAPABILITY_ATTRIBUTION.json"),JSON.stringify(out,null,2)+"\n");
process.stdout.write(JSON.stringify({status:out.status,integrityOk:result.integrity.ok,modulesExist:missingOnDisk.length===0,capabilities:result.stats.capabilities,primitivesCovered:result.stats.primitivesCovered+"/9",metiersCovered:result.stats.metiersCovered+"/15",orphans:result.integrity.orphanPrimitives,criticalSingletons:result.integrity.criticalSingletons},null,2)+"\n");
export {};
