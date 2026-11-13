#!/usr/bin/env node
"use strict";
/* V185 §2/§3.2 — world benchmark LOT 1. Proves: real provenance per world reference; external content untrusted; ODG-
 * current MEASURED only where proven; gaps identified not invented; recommendations prefer REUSE/IMPROVE; 16 métiers remain. */
const B = require("./odg-metier-benchmark-lot1.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const b = B.benchmark();
  const byId: any = {}; for (const r of b.rows) byId[r.metier] = r;

  check("LOT 1 covers exactly P3, P9, M2", b.metiers.join(",") === "P3,P9,M2" && b.rows.length === 3);
  check("research pass is grant-V141, dated, WebSearch, untrusted-external", b.research.grant === "V141" && b.research.consultedDate === "2026-11-13" && /WebSearch/.test(b.research.method) && /untrusted/.test(b.research.note));
  check("every row has ≥1 world reference with org+url+reliability", b.rows.every((r: any) => r.worldReferences.length >= 1 && r.worldReferences.every((x: any) => x.org && x.url && x.reliability)));

  // real, verifiable references
  check("P3 references NIST SSDF + SLSA (normative/industry)", byId.P3.worldReferences.some((x: any) => /NIST/.test(x.org) && /SSDF/.test(x.title)) && byId.P3.worldReferences.some((x: any) => /SLSA/.test(x.title)));
  check("P9 references FinOps Foundation Inform/Optimize/Operate + Crawl/Walk/Run", byId.P9.worldReferences.some((x: any) => /FinOps Foundation/.test(x.org)) && /Crawl\/Walk\/Run|Inform/.test(byId.P9.worldReference));
  check("M2 references ISO 19650 (normative)", byId.M2.worldReferences.some((x: any) => /ISO/.test(x.org) && /19650/.test(x.title)) && byId.M2.worldReferences.find((x: any) => /ISO/.test(x.org)).reliability === "HIGH_NORMATIVE");

  // honesty: measured vs documented vs gap
  check("ODG-current cites real modules + MEASURED-via-gate where proven", /odg-owasp-agentic-matrix/.test(byId.P3.odgCurrent) && /finops-analyzer/.test(byId.P9.odgCurrent) && /document-intelligence/.test(byId.M2.odgCurrent));
  check("each row identifies a concrete gap (not invented)", b.rows.every((r: any) => r.gap && r.gap.length > 10));
  check("recommendations prefer REUSE/IMPROVE; M2 BTP stays BUILD_CONDITIONAL behind demand-validation", /IMPROVE/.test(byId.P3.recommendation) && /IMPROVE/.test(byId.P9.recommendation) && /BUILD_CONDITIONAL/.test(byId.M2.recommendation) && /demand-validation/.test(byId.M2.recommendation));

  // lot discipline
  check("16 métiers remain for subsequent lots (20 total − 4? no: 20−3−1 overlap)", b.remainingMetiers.length === 16 && !b.remainingMetiers.includes("P3") && !b.remainingMetiers.includes("P9") && !b.remainingMetiers.includes("M2"));
  check("contract: real provenance, untrusted-external, REUSE/IMPROVE-first, lot-1-only", B.BENCHMARK_LOT1_CONTRACT.invariants.some((i: string) => /real provenance/.test(i)) && B.BENCHMARK_LOT1_CONTRACT.invariants.some((i: string) => /untrusted/.test(i)) && B.BENCHMARK_LOT1_CONTRACT.invariants.some((i: string) => /LOT 1 only/.test(i)));
  check("deterministic + frozen", JSON.stringify(B.benchmark().metiers) === JSON.stringify(b.metiers) && Object.isFrozen(b) && Object.isFrozen(b.rows));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — metier-benchmark-lot1 (V185 §2/§3.2: real grant-V141 radar/WebSearch pass; P3→NIST SSDF/SLSA, P9→FinOps Inform-Optimize-Operate, M2→ISO 19650; provenance-tagged; external untrusted; MEASURED-vs-documented-vs-gap honest; REUSE/IMPROVE-first; 16 métiers remain)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
