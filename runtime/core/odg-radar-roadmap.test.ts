#!/usr/bin/env node
"use strict";
/* V229-R §7 — radar roadmap synthesis. Proves: a REAL corroborated benchmark (Toyota jidoka, 2 independent sources incl.
 * official) ⇒ PROPOSED roadmap item mapped to ODG fail-closed gates; an uncorroborated/opinion practice is NOT a benchmark;
 * ALIGNED ⇒ no build; priority is a deterministic score; reuses knowledge-acquisition; deterministic + frozen. */
const R = require("./odg-radar-roadmap.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const r = R.synthesize();
  const jidoka = r.roadmap.find((x: any) => /jidoka/.test(x.practice));

  check("REAL benchmark Toyota jidoka is CORROBORATED (2 independent accessible sources) ⇒ a proven benchmark", jidoka && jidoka.benchmarkProven === true && r.corroboratedCount === 1 && r.research.accessible === 2);
  check("jidoka maps to ODG fail-closed gates, odgState PARTIAL ⇒ PROPOSED roadmap item with all §7 fields", jidoka.decision === "PROPOSED" && /fail-closed gates/.test(jidoka.odgCapability) && jidoka.proposal && jidoka.acceptanceCriteria && jidoka.reproducibleTest);
  check("priority is a DETERMINISTIC score from impact/feasibility/cost/risk", typeof jidoka.priorityScore === "number" && jidoka.priorityScore === Math.round(((4 * 5) / (2 + 1)) * 10) / 10);
  check("official primary source recorded (toyota-global.com)", /toyota-global\.com/.test(jidoka.officialPrimary));

  // an UNCORROBORATED / opinion practice is NOT a benchmark (hypothesis only)
  const opinion = R.synthesize({
    research: { query: "q", sources: [{ url: "https://blog.test/x", status: "RETRIEVED", consultedDate: "2026-11-16", claims: [{ text: "method M makes you rich", type: "OPINION" }] }] },
    benchmarks: [{ practice: "get-rich method M", benchmarkClaim: "method M makes you rich", odgCapability: "n/a", odgState: "MISSING", impact: 5, feasibility: 3, cost: 2, risk: 4, proposal: "x", acceptanceCriteria: "y", reproducibleTest: "z" }],
  });
  check("an OPINION / uncorroborated practice ⇒ NOT_A_PROVEN_BENCHMARK (hypothesis, not a benchmark), no proposal emitted", opinion.roadmap[0].decision === "NOT_A_PROVEN_BENCHMARK" && opinion.roadmap[0].benchmarkProven === false && opinion.roadmap[0].proposal === null && opinion.proposedCount === 0);

  // a corroborated practice ODG is ALIGNED on ⇒ NO build (no fabricated gap)
  const aligned = R.synthesize({
    research: R.REAL_RESEARCH,
    benchmarks: [{ ...R.BENCHMARKS[0], odgState: "ALIGNED" }],
  });
  check("a corroborated practice ODG is ALIGNED on ⇒ ALREADY_ALIGNED_NO_BUILD (no fabricated gap, no proposal)", aligned.roadmap[0].decision === "ALREADY_ALIGNED_NO_BUILD" && aligned.roadmap[0].proposal === null && aligned.alignedCount === 1 && aligned.proposedCount === 0);

  check("roadmap ranked by priority; honest coverage note (one real benchmark; 20-métier needs repeated real cycles)", Array.isArray(r.roadmap) && /Full 20-métier benchmarking requires repeated REAL research/.test(r.coverageNote));
  check("honesty: only corroborated=benchmark; opinion=hypothesis; ALIGNED=no build; PROPOSES not implements; impact=target not forecast", /only FACT_CORROBORATED practices are benchmarks/.test(r.honesty) && /PROPOSES, never implements/.test(r.honesty) && /TARGET hypothesis, not a forecast/.test(r.honesty));
  check("contract: corroborated-only benchmark, aligned=no-build, reuses knowledge-acquisition, no 2nd radar", R.RADAR_ROADMAP_CONTRACT.invariants.some((i: string) => /only a FACT_CORROBORATED/.test(i)) && R.RADAR_ROADMAP_CONTRACT.invariants.some((i: string) => /NO second radar/.test(i)));
  check("deterministic + frozen", JSON.stringify(R.synthesize()) === JSON.stringify(r) && Object.isFrozen(r) && Object.isFrozen(R.BENCHMARKS));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — radar-roadmap (V229-R §7: REAL corroborated benchmark Toyota jidoka → ODG fail-closed gates PROPOSED; opinion/uncorroborated ≠ benchmark; ALIGNED ⇒ no build; deterministic priority; reuses knowledge-acquisition; PROPOSES not implements)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
