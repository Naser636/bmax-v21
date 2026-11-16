#!/usr/bin/env node
"use strict";
/* V230 §4/§5 — radar roadmap. Proves: 4 REAL-researched benchmarks; Toyota jidoka + NVIDIA CUDA CORROBORATED (≥2
 * independent owners) while Amazon/Google are OFFICIAL_CLAIM_NOT_CORROBORATED (single owner / vendor-only); jidoka ⇒
 * PROPOSED, CUDA ⇒ CORROBORATED_NOT_APPLICABLE (no artificial mapping); owner-level independence via source-authority;
 * métier coverage honest; deterministic + frozen. */
const R = require("./odg-radar-roadmap.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const r = R.synthesize();
  const by: any = {}; for (const it of r.roadmap) by[it.id] = it;

  check("4 real-researched benchmarks; exactly 2 CORROBORATED (Toyota jidoka + NVIDIA CUDA, ≥2 independent owners)", r.benchmarksTotal === 4 && r.corroboratedCount === 2 && by["BMK-TOYOTA-JIDOKA"].benchmarkProven === true && by["BMK-NVIDIA-CUDA"].benchmarkProven === true && by["BMK-TOYOTA-JIDOKA"].independentOwners === 2);
  check("Toyota jidoka ⇒ PROPOSED roadmap item (applicable, PARTIAL) → ODG fail-closed gates, with §5 fields", by["BMK-TOYOTA-JIDOKA"].decision === "PROPOSED" && /fail-closed gates/.test(by["BMK-TOYOTA-JIDOKA"].odgCapability) && by["BMK-TOYOTA-JIDOKA"].proposal && by["BMK-TOYOTA-JIDOKA"].priorityScore === Math.round(((4 * 5) / (2 + 1)) * 10) / 10 && r.proposedCount === 1);
  check("NVIDIA CUDA is CORROBORATED but CORROBORATED_NOT_APPLICABLE (ODG runs no GPU kernels) — no artificial mapping, no proposal", by["BMK-NVIDIA-CUDA"].decision === "CORROBORATED_NOT_APPLICABLE" && by["BMK-NVIDIA-CUDA"].proposal === null && by["BMK-NVIDIA-CUDA"].metiers.length === 0 && r.notApplicableCount === 1);

  // the V230 honesty: an OFFICIAL vendor source ALONE is a CLAIM, not a benchmark
  check("Amazon working-backwards = OFFICIAL_CLAIM_NOT_CORROBORATED (aws.amazon.com only; fourweekmba 403) — not a benchmark", by["BMK-AMAZON-WORKINGBACKWARDS"].decision === "OFFICIAL_CLAIM_NOT_CORROBORATED" && by["BMK-AMAZON-WORKINGBACKWARDS"].benchmarkProven === false && by["BMK-AMAZON-WORKINGBACKWARDS"].hasOfficial === true && by["BMK-AMAZON-WORKINGBACKWARDS"].independentOwners === 1 && by["BMK-AMAZON-WORKINGBACKWARDS"].proposal === null);
  check("Google error-budget = OFFICIAL_CLAIM_NOT_CORROBORATED (only sre.google defined it) — not a benchmark", by["BMK-GOOGLE-ERRORBUDGET"].decision === "OFFICIAL_CLAIM_NOT_CORROBORATED" && by["BMK-GOOGLE-ERRORBUDGET"].benchmarkProven === false && r.officialClaimOnlyCount === 2);

  // source-authority owner-level independence: two SAME-ORG official pages do NOT corroborate (even if both retrieved)
  const sameOrg = R.synthesize({ benchmarks: [{ id: "T", practice: "p", benchmarkClaim: "claim C", applicable: true, odgCapability: "x", odgState: "PARTIAL", metiers: ["P1"], impact: 3, feasibility: 3, cost: 2, risk: 2, proposal: "y", acceptanceCriteria: "a", reproducibleTest: "t",
    research: { query: "q", sources: [
      { url: "https://aws.amazon.com/a", status: "RETRIEVED", consultedDate: "2026-11-16", claims: [{ text: "claim C", type: "FACT" }] },
      { url: "https://amazon.science/b", status: "RETRIEVED", consultedDate: "2026-11-16", claims: [{ text: "claim C", type: "FACT" }] } ] } }] });
  check("two SAME-ORG official pages (aws.amazon.com + amazon.science) ⇒ independentOwners 1 ⇒ NOT a proven benchmark", sameOrg.roadmap[0].independentOwners === 1 && sameOrg.roadmap[0].benchmarkProven === false && sameOrg.roadmap[0].decision === "OFFICIAL_CLAIM_NOT_CORROBORATED");

  check("métier coverage matrix present (P7 has the jidoka proven benchmark); honest '4 practices, 2 corroborated' note", r.metierCoverage.some((m: any) => m.metier === "P7" && m.provenBenchmarks.includes("BMK-TOYOTA-JIDOKA")) && /only 2 are CORROBORATED/.test(r.coverageNote) && /full 20-métier benchmark needs repeated real cycles/.test(r.coverageNote));
  check("economic contribution is a HYPOTHESIS, never a forecast", by["BMK-TOYOTA-JIDOKA"].economicContribution && /HYPOTHESIS/.test(by["BMK-TOYOTA-JIDOKA"].economicContribution));
  check("honesty: official≠demonstrated, ≥2 independent owners, not-applicable⇒no mapping, PROPOSES not implements", /official vendor source alone is a CLAIM/.test(r.honesty) && /≥2 INDEPENDENT OWNERS/.test(r.honesty) && /PROPOSES not implements/.test(r.honesty));
  check("contract + deterministic + frozen", R.RADAR_ROADMAP_CONTRACT.invariants.some((i: string) => /≥2 INDEPENDENT OWNERS/.test(i)) && JSON.stringify(R.synthesize()) === JSON.stringify(r) && Object.isFrozen(r) && Object.isFrozen(R.BENCHMARKS));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — radar-roadmap (V230 §4/§5: 4 real benchmarks; Toyota+NVIDIA CORROBORATED [≥2 independent owners via source-authority]; Amazon/Google official-claim-only; jidoka⇒PROPOSED, CUDA⇒NOT_APPLICABLE; same-org≠independent; official≠demonstrated; PROPOSES not implements)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
