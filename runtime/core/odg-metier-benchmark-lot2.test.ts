#!/usr/bin/env node
"use strict";
/* V186 LOT 2 — benchmark P1/P5/P11 + P11↔M2. Proves: métier-specific real refs; 12 dims each MEASURED-with-method or
 * NOT_MEASURED (never blanket 1.0); P11↔M2 distinct-but-complementary (DCE not rebuilt); REUSE/IMPROVE-first; 14 remain. */
const B = require("./odg-metier-benchmark-lot2.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const b = B.benchmark();
  const byId: any = {}; for (const r of b.rows) byId[r.metier] = r;

  check("LOT 2 covers exactly P1, P5, P11", b.metiers.join(",") === "P1,P5,P11" && b.rows.length === 3);
  check("research is grant-V141, dated, 3 métier-specific queries, untrusted-external", b.research.grant === "V141" && /3 métier-specific/.test(b.research.method) && /untrusted/.test(b.research.note));

  // métier-SPECIFIC references (not a generic list)
  check("P1 references DORA (not generic)", byId.P1.worldReferences.some((x: any) => /DORA/.test(x.org) && /change-fail|lead time|elite/.test(x.title)));
  check("P5 references CNCF Platform Engineering Maturity (not generic)", byId.P5.worldReferences.some((x: any) => /CNCF/.test(x.org) && /Maturity/.test(x.title)));
  check("P11 references IDP benchmarks + field-level provenance (not generic)", byId.P11.worldReferences.some((x: any) => /IDP/.test(x.title) && /provenance/.test(x.title)));
  check("references differ across the 3 métiers (no generic reuse)", byId.P1.worldReferences[0].org !== byId.P5.worldReferences[0].org && byId.P5.worldReferences[0].org !== byId.P11.worldReferences[0].org);

  // 12-dimension benchmark, honest
  check("12 benchmark dimensions defined", b.dimensions.length === 12 && b.dimensions.includes("operational_maturity") && b.dimensions.includes("cross_metier_integration"));
  check("every assessed dimension has a value + method + worldRef + gap", b.rows.every((r: any) => Object.values(r.assessment).every((d: any) => d.value && d.method && d.worldRef !== undefined && d.gap !== undefined)));
  check("NO blanket 1.0: no dimension is MEASURED:1.0 and every métier has ≥1 NOT_MEASURED", b.rows.every((r: any) => Object.values(r.assessment).every((d: any) => d.value !== "MEASURED:1.0")) && b.rows.every((r: any) => Object.values(r.assessment).some((d: any) => d.value === "NOT_MEASURED")));
  check("operational_maturity is NOT_MEASURED for all three (no resident runtime)", byId.P1.assessment.operational_maturity.value === "NOT_MEASURED" && byId.P5.assessment.operational_maturity.value === "NOT_MEASURED" && byId.P11.assessment.operational_maturity.value === "NOT_MEASURED");
  check("ODG modules cited are real (native-engineering, provider-sandbox, document-intelligence)", /odg-native-engineering/.test(byId.P1.odgModules.join()) && /provider-sandbox/.test(byId.P5.odgModules.join()) && /document-intelligence/.test(byId.P11.odgModules.join()));

  // recommendations REUSE/IMPROVE-first
  check("recommendations are IMPROVE/reuse-first, no new engine; infra provisioning stays owner-gated/rejected", /IMPROVE/.test(byId.P1.recommendation) && /no new engine/.test(byId.P1.recommendation) && /OWNER_GATED|REJECTED/.test(byId.P5.recommendation) && /no second doc engine/.test(byId.P11.recommendation));

  // §6 P11↔M2
  const m = b.p11m2;
  check("P11↔M2: distinct-but-complementary, shared doc-intel engine, both ids retained", /DISTINCT_BUT_COMPLEMENTARY/.test(m.relationship) && /document-intelligence\.ts/.test(m.sharedComponent) && m.bothIdsRetained === true);
  check("P11↔M2: DCE analyzer NOT rebuilt until demand-validation; no second doc engine", /NOT rebuilt/.test(m.dceAnalyzer) && /demand-validation/.test(m.dceAnalyzer) && /no second document engine/.test(m.antiDuplication));
  check("P11 is PRINCIPAL horizontal, M2 is COMMERCIAL vertical", m.p11.category === "PRINCIPAL" && /HORIZONTAL/.test(m.p11.role) && m.m2.category === "COMMERCIAL" && /VERTICAL/.test(m.m2.role));

  // lot discipline + contract + determinism
  check("14 métiers remain (lot1 P3/P9/M2 + lot2 P1/P5/P11 done)", b.remainingMetiers.length === 14 && !b.remainingMetiers.includes("P1") && !b.remainingMetiers.includes("P11") && !b.remainingMetiers.includes("M2"));
  check("contract: métier-specific refs, no blanket 1.0, DCE not rebuilt, lot-2-only", B.BENCHMARK_LOT2_CONTRACT.invariants.some((i: string) => /not a generic list/.test(i)) && B.BENCHMARK_LOT2_CONTRACT.invariants.some((i: string) => /NEVER a blanket 1.0/.test(i)) && B.BENCHMARK_LOT2_CONTRACT.invariants.some((i: string) => /DCE analyzer NOT rebuilt/.test(i)));
  check("deterministic + frozen", JSON.stringify(B.benchmark().metiers) === JSON.stringify(b.metiers) && Object.isFrozen(b) && Object.isFrozen(b.rows));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — metier-benchmark-lot2 (V186: real grant-V141 pass; P1→DORA, P5→CNCF platform-maturity, P11→IDP benchmarks; 12-dim benchmark MEASURED-or-NOT_MEASURED [no blanket 1.0]; P11↔M2 distinct-but-complementary [DCE not rebuilt]; REUSE/IMPROVE-first; 14 métiers remain)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
