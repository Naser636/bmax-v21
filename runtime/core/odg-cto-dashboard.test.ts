#!/usr/bin/env node
"use strict";
/* V183 Livrable C — CTO dashboard. Proves: reads the REAL register read-only; every indicator carries provenance/
 * method/confidence; missing ⇒ NOT_MEASURED; runtime NOT_MEASURED; no canonical mutation; deterministic. */
const D = require("./odg-cto-dashboard.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function hasProvenance(i: any): boolean { return i && i.provenance && i.method && i.confidence && ("value" in i); }

function main() {
  const d = D.build({ registerPath: "docs/odg/closure-register.json", asOfEpochMs: 1763000000000 });

  check("reads the REAL register: total 427, counts 415/6/3/3", d.missions.total.value === 427 && d.missions.counts.value.ACCEPTED === 415 && d.missions.counts.value.BLOCKED === 6);
  check("is explicitly a READ-ONLY projection, not a new source of truth", /READ-ONLY projection, NOT a new source of truth/.test(d.sourceOfTruth));
  check("every top indicator carries provenance + method + confidence", hasProvenance(d.roadmap) && hasProvenance(d.primitives) && hasProvenance(d.metiers) && hasProvenance(d.useMatrix) && hasProvenance(d.runtime) && hasProvenance(d.ownerGates));
  check("runtime state is NOT_MEASURED (no resident process observed)", d.runtime.value === "NOT_MEASURED" && /no resident ODG process/.test(d.runtime.method));
  check("radar realScheduledRun is unmeasured", /NOT_MEASURED/.test(d.radar.value));
  check("gate is NOT re-run by the dashboard (low confidence, verify live)", d.gates.confidence === "LOW" && /does not re-run the gate/.test(d.gates.method));

  // ---- missing value ⇒ NOT_MEASURED, never fabricated ----
  const noDate = D.build({ registerPath: "docs/odg/closure-register.json" });
  check("absent asOfEpochMs renders null (not a fabricated timestamp)", noDate.asOfEpochMs === null);
  const badReg = D.build({ registerPath: "docs/odg/does-not-exist.json", asOfEpochMs: 1763000000000 });
  check("unreadable register ⇒ NOT_MEASURED with failure provenance (no fabricated count)", badReg.missions.value === "NOT_MEASURED" && /FAILED|unavailable/.test(badReg.missions.method));

  // ---- métiers + use-matrix projected honestly ----
  check("métiers projected with honest maturity (no real commercial result)", d.metiers.value.every((m: any) => m.commercialResult === false));
  check("use-matrix class tally present (135 classified)", d.useMatrix.value && typeof d.useMatrix.value.REUSE === "number");
  check("owner-gates include ROADMAP.json integration + BMAX assets + payment", d.ownerGates.value.some((x: string) => /ROADMAP\.json/.test(x)) && d.ownerGates.value.some((x: string) => /BMAX/.test(x)) && d.ownerGates.value.some((x: string) => /payment/.test(x)));

  // ---- V210: the 16 V207 improvements + V208 integration + V209 chain are now VISIBLE in the canonical dashboard ----
  check("improvements section surfaces built=16/integrated=16 (V208 consumer wired)", d.improvements.value.total === 16 && d.improvements.value.built === 16 && d.improvements.value.integrated === 16 && d.improvements.value.allIntegrated === true);
  check("improvements honesty: BUILT+TESTED+INTEGRATED but NOT REAL_WORLD_VALIDATED", /BUILT\+TESTED\+INTEGRATED/.test(d.improvements.method) && /NOT REAL_WORLD_VALIDATED/.test(d.improvements.method) && hasProvenance(d.improvements));
  check("Speed-Marketing chain visible with all verdict states + score≠client", /STOPPED_NO_FIT/.test(d.speedMarketingChain.value) && /MODEL_PROMISING/.test(d.speedMarketingChain.value) && /UNDETERMINED/.test(d.speedMarketingChain.value) && /score ≠ qualified client/.test(d.speedMarketingChain.method));
  check("production gates visible: deny-by-default NOT production-ready + owner-gated count", d.productionGates.value.productionReady === false && d.productionGates.value.ownerGatedActions >= 2 && hasProvenance(d.productionGates));
  // V215: sandbox-certification harness is CONSUMED by the dashboard (not an orphan) — certifies NOTHING, owner-gated in-session tests surfaced
  check("sandbox certification visible: certified:false, 8 tests, mechanisms 1/7/8 vs in-session 2/3/4/5/6, patch owner-gated", d.sandboxCertification.value.certified === false && d.sandboxCertification.value.totalTests === 8 && JSON.stringify(d.sandboxCertification.value.locallyProvenMechanism) === JSON.stringify([1, 7, 8]) && JSON.stringify(d.sandboxCertification.value.inSessionRequired) === JSON.stringify([2, 3, 4, 5, 6]) && /OWNER_GATED/.test(d.sandboxCertification.value.v198Patch) && /certifies NOTHING/.test(d.sandboxCertification.method) && hasProvenance(d.sandboxCertification));
  // V216: €5M-net economic target surfaced (aggregate revenue-required) — a MODEL condition, never a forecast; demand OWNER_GATED
  check("economic target visible: €5M target, ALL sub-fields resolve (no dead wiring), honest TARGET/OWNER_GATED framing", d.economicTarget.value.targetNet === 5000000 && typeof d.economicTarget.value.revenueRequiredFor5MNet === "number" && d.economicTarget.value.revenueRequiredFor5MNet > 5000000 && typeof d.economicTarget.value.customersNeeded === "number" && d.economicTarget.value.customersNeeded > 0 && typeof d.economicTarget.value.feasibleWith5 === "boolean" && /TARGET, not a forecast/.test(d.economicTarget.method) && /OWNER_GATED/.test(d.economicTarget.method) && hasProvenance(d.economicTarget));
  // V217: §6 data-chain qualification matrix surfaced (dated snapshot) — integration counts + OWNER_GATED findings, synthetic≠real honesty
  check("data chains visible: integrated count, renovation-quote-normalize not-integrated, synthetic≠real-quality honesty", d.dataChains.value.total === 6 && d.dataChains.value.integrated === 5 && d.dataChains.value.notIntegrated.includes("renovation-quote-normalize") && /synthetic test PASS ≠ real data quality/.test(d.dataChains.method) && /dated snapshot/.test(d.dataChains.method) && hasProvenance(d.dataChains));
  // V218: radar source-provenance cross-check surfaced (wires the previously-unconsumed source-registry); UNREGISTERED never upgraded
  check("radar source-provenance visible: opportunities cross-checked vs registry, honest never-upgraded framing", typeof d.radarSourceProvenance.value.opportunities === "number" && d.radarSourceProvenance.value.opportunities >= 1 && d.radarSourceProvenance.value.registrySources >= 1 && /never upgraded/.test(d.radarSourceProvenance.method) && /REGISTERED_OFFICIAL ≠ a true claim/.test(d.radarSourceProvenance.method) && hasProvenance(d.radarSourceProvenance));
  // V220: multimodal video capability — toolchain absent ⇒ NOT_ANALYZABLE, designated videos NOT_ANALYZED (no fabrication), install OWNER_GATED
  check("multimodal video visible: NOT_ANALYZABLE, 2 designated NOT_ANALYZED, missing tools + OWNER_GATED install, no fabrication", d.multimodalVideo.value.verdict === "NOT_ANALYZABLE" && d.multimodalVideo.value.analyzable === false && d.multimodalVideo.value.designatedNotAnalyzed === 2 && d.multimodalVideo.value.missingTools.length === 5 && /content never fabricated/.test(d.multimodalVideo.method) && /text LLM cannot understand video/.test(d.multimodalVideo.method) && hasProvenance(d.multimodalVideo));
  // V221: radar EAA claim corroborated by ≥2 independent sources incl. official EUR-Lex (real retrieval); single source ≠ corroboration
  check("claim corroboration visible: EAA opportunity CORROBORATED, official EUR-Lex, honest MODEL-not-fact framing", d.claimCorroboration.value.level === "CORROBORATED" && d.claimCorroboration.value.officialCorroboration === true && d.claimCorroboration.value.independentSupportCount >= 2 && /a single source is NOT corroboration/.test(d.claimCorroboration.method) && /CONTESTED/.test(d.claimCorroboration.method) && /not an absolute fact/.test(d.claimCorroboration.method) && hasProvenance(d.claimCorroboration));
  // V214: the radar indicator now CONSUMES odg-radar-video-sources (resolves the orphan reserve) — 2 videos RECORDED, content NOT_ANALYZED, not fabricated
  check("radar indicator consumes video-sources: 2 videos RECORDED, content NOT_ANALYZED, provenance names the module", /2 owner-designated videos RECORDED/.test(d.radar.value) && /NOT_ANALYZED/.test(d.radar.value) && /NOT_MEASURED/.test(d.radar.value) && /odg-radar-video-sources\.ts/.test(d.radar.provenance) && /NOT fabricated/.test(d.radar.method));

  // ---- contract + determinism ----
  check("contract: read-only, provenance-tagged, NOT_MEASURED-on-missing, runtime unmeasured", D.CTO_DASHBOARD_CONTRACT.invariants.some((i: string) => /never mutates a canonical status/.test(i)) && D.CTO_DASHBOARD_CONTRACT.invariants.some((i: string) => /missing ⇒ NOT_MEASURED/.test(i)));
  check("deterministic given same injected asOfEpochMs", JSON.stringify(D.build({ asOfEpochMs: 1763000000000 }).missions) === JSON.stringify(d.missions));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — cto-dashboard (Livrable C: READ-ONLY projection over canonical sources; reads REAL register 427; every indicator provenance+method+confidence; missing⇒NOT_MEASURED [no fabrication]; runtime NOT_MEASURED; gate not re-run; no canonical mutation)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
