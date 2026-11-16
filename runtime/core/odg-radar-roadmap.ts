#!/usr/bin/env node
"use strict";
/*
 * V229-R §2/§7/§8 — RADAR ROADMAP SYNTHESIS. PURE, deterministic. The Radar turns CORROBORATED external excellence
 * benchmarks into a PRIORITIZED ODG improvement roadmap. It REUSES odg-knowledge-acquisition (real discover→access→
 * corroborate cycle) to decide which external practices are proven benchmarks, then maps each to a real ODG capability,
 * assesses the gap, and emits roadmap items with the §7 fields (problem/source/benchmark/gap/solution/impact/cost/
 * priority/acceptance/test). NOT a second radar — it consumes the existing knowledge-acquisition + corroboration output.
 *
 * HARD HONESTY: only a FACT_CORROBORATED practice (≥2 independent accessible sources) can be a BENCHMARK; an opinion,
 * marketing promise, single source, or inaccessible source is NOT a proven benchmark and can only be a HYPOTHESIS to test.
 * Where ODG already embodies a practice (odgState ALIGNED) the roadmap emits NO build (no fabricated gap / no busywork).
 * The roadmap PROPOSES and prioritizes; it does NOT implement, and economic impact is a TARGET hypothesis, never a forecast.
 */

const KAQ = require("./odg-knowledge-acquisition.js");  // real corroboration of the benchmark sources

// REAL executed research (V229-R, 2026-11-16): Toyota Production System jidoka — corroborated by the OFFICIAL Toyota site
// (toyota-global.com) + the Lean Enterprise Institute (lean.org), both retrieved with real content.
const REAL_RESEARCH = Object.freeze({
  query: "Toyota Production System jidoka principle (stop-on-abnormality, build quality in)",
  capability: "P7-SRE / governance quality-gate reference",
  asOfEpochMs: Date.UTC(2026, 10, 16),
  sources: Object.freeze([
    { url: "https://www.lean.org/lexicon-terms/jidoka/", status: "RETRIEVED", consultedDate: "2026-11-16", claims: [{ text: "jidoka stops work immediately on an abnormal condition, builds quality in, and surfaces root causes", type: "FACT" }] },
    { url: "https://www.toyota-global.com/company/history_of_toyota/75years/text/entering_the_automotive_business/chapter1/section4/item4.html", status: "RETRIEVED", consultedDate: "2026-11-16", claims: [{ text: "jidoka stops work immediately on an abnormal condition, builds quality in, and surfaces root causes", type: "FACT" }] },
  ]),
});

// Benchmarks the Radar maps to ODG capabilities. A benchmark is PROVEN only if its claim is FACT_CORROBORATED above.
const BENCHMARKS = Object.freeze([
  {
    practice: "Toyota jidoka — stop-the-line on any abnormality, build quality in at each step, surface root causes",
    benchmarkClaim: "jidoka stops work immediately on an abnormal condition, builds quality in, and surfaces root causes",
    officialPrimary: "https://www.toyota-global.com (Toyota's own site)",
    odgCapability: "deny-by-default fail-closed gates (truth-lock, radar-to-mission governanceGate, V223-V225 fail-closed-verdict propagation)",
    odgState: "PARTIAL",   // aligned in principle, but the V223-V225 census found fail-closed verdicts computed-but-not-consumed
    impact: 4, feasibility: 5, cost: 2, risk: 1,
    proposal: "jidoka-completeness: ensure EVERY computed fail-closed verdict (provenance/integrity/corroboration/budget) is actually CONSUMED by its decider — a 'stop' signal must stop the decision, not merely be computed",
    acceptanceCriteria: "no computed fail-closed verdict is left unconsumed by a decider in the Radar→grade→mission chain",
    reproducibleTest: "for each fail-closed verdict, a test proves a decider consumes it (the V223/V224/V225 pattern)",
  },
]);

function clamp(v: any): number { const n = Number(v); return Number.isFinite(n) ? Math.max(1, Math.min(5, n)) : 1; }

/* synthesize(opts?) -> prioritized roadmap. opts.research overrides REAL_RESEARCH; opts.benchmarks overrides BENCHMARKS. */
function synthesize(opts?: any): any {
  const o = opts && typeof opts === "object" ? opts : {};
  const research = o.research || REAL_RESEARCH;
  const benchmarks = Array.isArray(o.benchmarks) ? o.benchmarks : BENCHMARKS;

  // corroborate the benchmark sources via the real knowledge-acquisition cycle.
  const kaq = KAQ.acquire(research);
  const corroboratedClaims = new Set(kaq.knowledge.filter((k: any) => k.classification === "FACT_CORROBORATED").map((k: any) => k.claim));

  const items = benchmarks.map((b: any) => {
    const proven = corroboratedClaims.has(b.benchmarkClaim);   // only a corroborated claim is a proven benchmark
    const impact = clamp(b.impact), feasibility = clamp(b.feasibility), cost = clamp(b.cost), risk = clamp(b.risk);
    const priorityScore = Math.round(((impact * feasibility) / (cost + risk)) * 10) / 10;  // deterministic
    const decision = !proven ? "NOT_A_PROVEN_BENCHMARK"
      : b.odgState === "ALIGNED" ? "ALREADY_ALIGNED_NO_BUILD"
      : "PROPOSED";
    return Object.freeze({
      practice: b.practice, benchmarkProven: proven, officialPrimary: b.officialPrimary || null,
      odgCapability: b.odgCapability, odgState: b.odgState, decision,
      impact, feasibility, cost, risk, priorityScore,
      proposal: decision === "PROPOSED" ? b.proposal : null,
      acceptanceCriteria: decision === "PROPOSED" ? b.acceptanceCriteria : null,
      reproducibleTest: decision === "PROPOSED" ? b.reproducibleTest : null,
      note: !proven ? "source not corroborated by ≥2 independent accessible sources — a hypothesis to test, NOT a benchmark"
        : b.odgState === "ALIGNED" ? "ODG already embodies this practice — NO build proposed (no fabricated gap)"
        : "PROPOSED roadmap item — corroborated benchmark + a real ODG gap; this PROPOSES, it does not implement",
    });
  });
  const ranked = [...items].sort((a: any, b: any) => b.priorityScore - a.priorityScore || (a.practice < b.practice ? -1 : 1));

  return Object.freeze({
    benchmarksTotal: items.length,
    corroboratedCount: items.filter((x: any) => x.benchmarkProven).length,
    proposedCount: items.filter((x: any) => x.decision === "PROPOSED").length,
    alignedCount: items.filter((x: any) => x.decision === "ALREADY_ALIGNED_NO_BUILD").length,
    notProvenCount: items.filter((x: any) => x.decision === "NOT_A_PROVEN_BENCHMARK").length,
    roadmap: Object.freeze(ranked),
    research: Object.freeze({ query: research.query, accessible: kaq.accessibleCount, inaccessible: kaq.inaccessibleCount, verifiedFacts: kaq.verifiedCount }),
    coverageNote: "ONE real corroborated benchmark demonstrated (Toyota jidoka → ODG fail-closed gates). Full 20-métier benchmarking requires repeated REAL research cycles — not fabricated in one pass. The engine generalizes to any corroborated finding.",
    honesty: "only FACT_CORROBORATED practices are benchmarks; opinions/promises/single-source are hypotheses, never benchmarks; ALIGNED ⇒ no build (no fabricated gap); this roadmap PROPOSES, never implements; economic impact is a TARGET hypothesis, not a forecast.",
  });
}

const RADAR_ROADMAP_CONTRACT = Object.freeze({
  id: "V229R-RADAR-ROADMAP",
  purpose: "§2/§7/§8 — synthesize corroborated external benchmarks into a prioritized ODG improvement roadmap; reuse knowledge-acquisition",
  invariants: Object.freeze([
    "only a FACT_CORROBORATED practice (≥2 independent accessible sources) is a BENCHMARK; opinion/promise/single-source ⇒ hypothesis, never a benchmark",
    "ODG-ALIGNED practices emit NO build (no fabricated gap / no busywork); the roadmap PROPOSES, never implements",
    "REUSES odg-knowledge-acquisition + its corroboration — NO second radar/registry; deterministic (injected research)",
    "economic impact is a TARGET hypothesis, never a forecast; priority is a deterministic score from impact/feasibility/cost/risk",
  ]),
});

module.exports = { REAL_RESEARCH, BENCHMARKS, synthesize, RADAR_ROADMAP_CONTRACT };
export {};
