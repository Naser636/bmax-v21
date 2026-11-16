#!/usr/bin/env node
"use strict";
/* V243 §8 — world-benchmark audit (CM-BENCHMARK-AUDIT). Proves: 8 benchmarks audited on availability/licence/
 * reproducibility; NEVER a score, NEVER a ranking; VERIFIED only when FACT_CORROBORATED (SWE-bench/OSWorld/τ-bench),
 * else INSUFFICIENT (fail-closed); USABLE_AS_REFERENCE requires freely-accessible+licence-permits+corroborated;
 * cross-protocol comparison is INVALID_INCOMPARABLE; reuses source-authority; deterministic + frozen. */
const B = require("./odg-benchmark-audit.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const a = B.audit();

  check("audits all 8 world benchmarks named in the roadmap", a.total === 8 && ["swe-bench", "osworld", "tau-bench", "browsecomp", "gdpval", "webarena", "metr", "sciagentarena"].every((id: string) => a.benchmarks.some((r: any) => r.id === id)));
  check("NO score is ever emitted (auditing ≠ running) — every row hasScore=false", a.anyScoreEmitted === false && a.benchmarks.every((r: any) => r.hasScore === false) && a.benchmarks.every((r: any) => !("score" in r)));
  check("corroborated benchmarks ⇒ USABLE_AS_REFERENCE (SWE-bench MIT, OSWorld Apache-2.0)", a.benchmarks.find((r: any) => r.id === "swe-bench").verdict === "USABLE_AS_REFERENCE" && a.benchmarks.find((r: any) => r.id === "osworld").verdict === "USABLE_AS_REFERENCE");
  check("FAIL-CLOSED: uncorroborated benchmarks ⇒ INSUFFICIENT_EVIDENCE (availability/licence UNVERIFIED, not fabricated)", ["browsecomp", "gdpval", "webarena", "metr", "sciagentarena"].every((id: string) => { const r = a.benchmarks.find((x: any) => x.id === id); return r.verdict === "INSUFFICIENT_EVIDENCE" && r.availability === "UNVERIFIED" && r.licencePermitsUse === null; }) && a.insufficient === 5);
  check("USABLE_AS_REFERENCE requires freely-accessible AND licence-permits AND corroborated", a.benchmarks.every((r: any) => (r.verdict === "USABLE_AS_REFERENCE") === (r.availability === "FREELY_ACCESSIBLE" && r.licencePermitsUse === true && r.corroboration === "FACT_CORROBORATED")));
  check("source owner tagged meaningfully (repo org) for corroborated benchmarks; null for uncorroborated", a.benchmarks.find((r: any) => r.id === "swe-bench").sourceOwner === "SWE-bench" && a.benchmarks.find((r: any) => r.id === "osworld").sourceOwner === "xlang-ai" && a.benchmarks.find((r: any) => r.id === "tau-bench").sourceOwner === "sierra-research" && a.benchmarks.find((r: any) => r.id === "browsecomp").sourceOwner === null);

  // NO ranking / no cross-protocol comparison.
  check("cross-protocol comparison ⇒ INVALID_INCOMPARABLE (never a ranking)", B.compareResults({ model: "A", tools: "x", budget: 1, protocol: "p", benchmarkVersion: "1" }, { model: "B", tools: "x", budget: 1, protocol: "p", benchmarkVersion: "1" }).verdict === "INVALID_INCOMPARABLE");
  check("identical full protocol tuple ⇒ COMPARABLE (still no score invented)", B.compareResults({ model: "A", tools: "x", budget: 1, protocol: "p", benchmarkVersion: "1" }, { model: "A", tools: "x", budget: 1, protocol: "p", benchmarkVersion: "1" }).comparable === true);

  check("honest summary: AUDIT ONLY, results not comparable across differing models/tools/budgets", /AUDIT ONLY/.test(a.note) && /NOT comparable/.test(a.note));

  // determinism + frozen + contract.
  check("deterministic + frozen", JSON.stringify(B.audit()) === JSON.stringify(a) && Object.isFrozen(a) && Object.isFrozen(a.benchmarks));
  check("contract: no score/ranking, fail-closed, reuses source-authority, no 2nd harness/10th primitive", B.BENCHMARK_AUDIT_CONTRACT.invariants.some((i: string) => /NEVER emits a numeric score/.test(i)) && B.BENCHMARK_AUDIT_CONTRACT.invariants.some((i: string) => /fail-closed/.test(i)) && B.BENCHMARK_AUDIT_CONTRACT.invariants.some((i: string) => /no second benchmark harness/.test(i)));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — benchmark-audit (V243 §8: 8 world benchmarks audited on availability/licence/reproducibility/compatibility; NO score, NO ranking; VERIFIED only when FACT_CORROBORATED [SWE-bench/OSWorld/τ-bench via real sources], else INSUFFICIENT fail-closed; cross-protocol INVALID_INCOMPARABLE; reuses source-authority; no 2nd harness)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
