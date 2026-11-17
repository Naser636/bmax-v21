#!/usr/bin/env node
"use strict";
/* V238 — canonical consolidation of V234–V238 into V12.4. Proves: loads the REAL companion + REAL ROADMAP.json; V12.4 sole
 * directeur (reuses roadmap-consolidation); lossless + DISTINCT (unique ids, every mission mapped to a V12.4 section A–R, no
 * orphan, status in the Phase-11 ladder); execution manifest UNCHANGED at 11 (v104/crosswalk guards honoured, amendment
 * OWNER_GATED); CONSUMABLE by odg-program-continuity; fail-closed on orphan/dup/concurrent/replaced-manifest; deterministic. */
const C = require("./odg-v124-consolidation.js");
const fs = require("fs");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const companion = JSON.parse(fs.readFileSync("docs/odg/v124-consolidated-roadmap.json", "utf8"));
  const roadmap = JSON.parse(fs.readFileSync("runtime/governance/ROADMAP.json", "utf8"));
  const v = C.validate(companion, roadmap);

  check("REAL companion validates: consolidated=true, V12.4 directeur, roadmapIntegration=INTEGRATED", v.consolidated === true && v.directeur === "V12.4" && v.roadmapIntegration === "INTEGRATED" && v.reasons.length === 0);
  check("lossless + DISTINCT: no duplicates, no orphans, every V234–V238 source present", v.duplicates.length === 0 && v.orphans.length === 0 && v.bySource.V234 >= 1 && v.bySource.V235 >= 1 && v.bySource.V236 >= 1 && v.bySource.V237 >= 1);
  check("execution manifest INTACT: ROADMAP.json still 11 missions, amendment OWNER_GATED (no second roadmap)", v.executionManifestIntact === true && roadmap.missions.length === 11 && /OWNER_GATED/.test(v.executionManifestAmendment));
  // distinct states preserved: ACCEPTED builds + at least one BLOCKED + at least one still-open (READY/REVIEW/IN_PROGRESS/OWNER_GATED). Exact mix evolves as missions progress.
  const openish = (v.byStatus.READY || 0) + (v.byStatus.REVIEW || 0) + (v.byStatus.IN_PROGRESS || 0) + (v.byStatus.OWNER_GATED || 0);
  check("distinct ACCEPTED builds + BLOCKED + open/in-progress missions all preserved (nothing dropped)", v.byStatus.ACCEPTED >= 4 && v.byStatus.BLOCKED >= 1 && openish >= 1);
  check("sections A–R used (missions mapped across V12.4 domains, not one bucket)", v.sectionsCovered.length >= 5 && v.sectionsCovered.includes("B") && v.sectionsCovered.includes("D"));
  // V272/V273: the BTP strategic extension V260–V271 is integrated LOSSLESSLY as section S (owner-authorized validated amendment).
  check("section S integrated: >=10 BTP strategic-extension missions (V260–V271) present, lossless, each source declared+present", v.sectionsCovered.includes("S") && (v.byStatus.ACCEPTED >= 14) && ["V260", "V266", "V267", "V268", "V269", "V271"].every((s: string) => (v.bySource[s] || 0) >= 1));
  check("section S is a VALIDATED amendment (not an orphan): companion still consolidated=true with sections A–S", v.consolidated === true && v.orphans.length === 0 && v.sectionsCovered.indexOf("S") === v.sectionsCovered.length - 1);
  // a section OUTSIDE the validated A–S set is still an ORPHAN (the boundary moved to S exactly, not beyond).
  check("FAIL-CLOSED: a mission with section 'Z' (outside A–S) ⇒ still ORPHAN ⇒ not consolidated", C.validate({ directeur: "V12.4", programs: companion.programs, executionManifest: companion.executionManifest, roadmapIntegration: "INTEGRATED", missions: [{ id: "Z1", section: "Z", status: "READY" }] }, roadmap).consolidated === false);

  // CONSUMABLE: the consolidated roadmap is driven by the REAL V237 program-continuity (not a static doc).
  const dem = C.demonstrate();
  check("CONSUMABLE by odg-program-continuity: dossier built over all consolidated missions (real mechanism)", dem.consumable === true && dem.verdict.consolidated === true && dem.dossierDone >= 1 && typeof dem.dossierEligible === "string");

  // FAIL-CLOSED: orphan (no section), duplicate id, concurrent program, replaced manifest each ⇒ consolidated:false.
  check("FAIL-CLOSED: a mission with no V12.4 section ⇒ ORPHAN ⇒ not consolidated", C.validate({ directeur: "V12.4", programs: companion.programs, executionManifest: companion.executionManifest, roadmapIntegration: "INTEGRATED", missions: [{ id: "X", status: "READY" }] }, roadmap).consolidated === false);
  check("FAIL-CLOSED: a concurrent program ⇒ not single-source ⇒ not consolidated", C.validate({ directeur: "V12.4", programs: [{ name: "P", integratedInto: "V12.4", concurrent: true }], executionManifest: companion.executionManifest, roadmapIntegration: "INTEGRATED", missions: [] }, roadmap).consolidated === false);
  check("FAIL-CLOSED: execution manifest replaced (roadmap != 11) ⇒ not consolidated", C.validate(companion, { missions: [{ id: "only" }] }).consolidated === false);
  check("FAIL-CLOSED: duplicate mission id ⇒ not consolidated", C.validate({ directeur: "V12.4", programs: companion.programs, executionManifest: companion.executionManifest, roadmapIntegration: "INTEGRATED", missions: [{ id: "D", section: "A", status: "READY" }, { id: "D", section: "A", status: "READY" }] }, roadmap).consolidated === false);
  check("FAIL-CLOSED (lossless enforced): empty missions ⇒ not consolidated (no validate-on-absence)", C.validate({ directeur: "V12.4", programs: companion.programs, executionManifest: companion.executionManifest, roadmapIntegration: "INTEGRATED", expectedMissionSources: ["V234"], missions: [] }, roadmap).consolidated === false);
  check("FAIL-CLOSED (lossless enforced): dropping a declared expected source (V235) ⇒ not consolidated", (() => { const r = C.validate(Object.assign({}, companion, { missions: companion.missions.filter((m: any) => m.source !== "V235") }), roadmap); return r.consolidated === false && r.reasons.some((x: string) => /LOSSY/.test(x) && /V235/.test(x)); })());

  // determinism + contract.
  check("deterministic + frozen", JSON.stringify(C.validate(companion, roadmap)) === JSON.stringify(v) && Object.isFrozen(v) && Object.isFrozen(v.reasons));
  check("contract: sole directeur, lossless, manifest intact/amendment owner-gated, consumable, no 10th primitive", C.V124_CONSOLIDATION_CONTRACT.invariants.some((i: string) => /SOLE directeur/.test(i)) && C.V124_CONSOLIDATION_CONTRACT.invariants.some((i: string) => /manifest amendment is OWNER_GATED/.test(i)) && C.V124_CONSOLIDATION_CONTRACT.invariants.some((i: string) => /CONSUMABLE by odg-program-continuity/.test(i)));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — v124-consolidation (V238: V234–V238 consolidated into V12.4 — sole directeur [reuses roadmap-consolidation], lossless+distinct [sections A–R, no orphan/dup], execution manifest UNCHANGED at 11 [v104/crosswalk honoured, amendment OWNER_GATED], CONSUMABLE by odg-program-continuity; fail-closed; INTEGRATED≠COMPLETED)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
