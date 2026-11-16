#!/usr/bin/env node
"use strict";
/*
 * V229-R/V230 §4/§5 — RADAR ROADMAP SYNTHESIS. PURE, deterministic. The Radar turns CORROBORATED world-class benchmarks
 * into a PRIORITIZED ODG improvement roadmap. REUSES odg-knowledge-acquisition (corroboration) + odg-source-authority
 * (V230: official-domain recognition + TRUE owner-level independence) — NOT a second radar. Each benchmark carries its
 * own REAL retrieved research; a practice is a PROVEN benchmark ONLY if (a) its claim is FACT_CORROBORATED and (b) it has
 * ≥2 INDEPENDENT OWNERS (two pages of the same org do NOT corroborate each other).
 *
 * HARD HONESTY: an official vendor source ALONE is a CLAIM, not a benchmark (official ≠ independently demonstrated); a
 * corroborated practice that does NOT map to an ODG métier is CORROBORATED_NOT_APPLICABLE (no artificial mapping); an
 * ALIGNED practice emits no build (no fabricated gap). The roadmap PROPOSES, never implements; economic contribution is a
 * HYPOTHESIS with the data needed to validate it, never a forecast. Dual export.
 */

const KAQ = require("./odg-knowledge-acquisition.js");  // corroboration (host-independent supports)
const AUTH = require("./odg-source-authority.js");      // V230 — official-domain + owner-level independence
const JC = require("./odg-jidoka-completeness.js");     // V231 — acceptance check for the jidoka-completeness proposal

// REAL executed research (V230, 2026-11-16). status RETRIEVED = fetched with real content; INACCESSIBLE = HTTP 403 (not circumvented).
const BENCHMARKS = Object.freeze([
  {
    id: "BMK-TOYOTA-JIDOKA", practice: "Toyota jidoka — stop-the-line on any abnormality, build quality in, surface root causes",
    benchmarkClaim: "jidoka stops work immediately on an abnormal condition, builds quality in, and surfaces root causes",
    research: { query: "Toyota Production System jidoka principle", sources: [
      { url: "https://www.lean.org/lexicon-terms/jidoka/", status: "RETRIEVED", consultedDate: "2026-11-16", claims: [{ text: "jidoka stops work immediately on an abnormal condition, builds quality in, and surfaces root causes", type: "FACT" }] },
      { url: "https://www.toyota-global.com/company/history_of_toyota/75years/text/entering_the_automotive_business/chapter1/section4/item4.html", status: "RETRIEVED", consultedDate: "2026-11-16", claims: [{ text: "jidoka stops work immediately on an abnormal condition, builds quality in, and surfaces root causes", type: "FACT" }] } ] },
    metiers: ["P7"], applicable: true, odgCapability: "deny-by-default fail-closed gates (truth-lock, governanceGate, V223-V225 fail-closed-verdict propagation)", odgState: "PARTIAL",
    impact: 4, feasibility: 5, cost: 2, risk: 1,
    proposal: "jidoka-completeness: ensure EVERY computed fail-closed verdict is CONSUMED by its decider (a 'stop' must stop the decision, not merely be computed)",
    acceptanceCriteria: "no computed fail-closed verdict is left unconsumed by a decider in the Radar→grade→mission chain",
    reproducibleTest: "for each fail-closed verdict, a test proves a decider consumes it (the V223/V224/V225 pattern)",
    economicContribution: "HYPOTHESIS: fewer bad decisions ⇒ less rework; needs a measured defect/rework baseline to quantify",
    acceptanceCheck: "jidoka-completeness",   // V231 — the Radar recomputes this item's status from a behavioral acceptance check
  },
  {
    id: "BMK-NVIDIA-CUDA", practice: "NVIDIA CUDA — GPU parallel-computing platform + programming model for accelerated general-purpose compute",
    benchmarkClaim: "CUDA is a parallel computing platform and programming model developed by NVIDIA for general-purpose computing on GPUs",
    research: { query: "NVIDIA CUDA parallel computing platform", sources: [
      { url: "https://docs.nvidia.com/cuda/cuda-programming-guide/index.html", status: "RETRIEVED", consultedDate: "2026-11-16", claims: [{ text: "CUDA is a parallel computing platform and programming model developed by NVIDIA for general-purpose computing on GPUs", type: "FACT" }] },
      { url: "https://en.wikipedia.org/wiki/CUDA", status: "RETRIEVED", consultedDate: "2026-11-16", claims: [{ text: "CUDA is a parallel computing platform and programming model developed by NVIDIA for general-purpose computing on GPUs", type: "FACT" }] } ] },
    metiers: [], applicable: false, odgCapability: "(ODG is a governance/engineering system — it does not run GPU kernels)", odgState: "NOT_APPLICABLE",
    impact: 1, feasibility: 1, cost: 5, risk: 3, proposal: null, acceptanceCriteria: null, reproducibleTest: null,
    economicContribution: "N/A — not an ODG métier concern",
  },
  {
    id: "BMK-AMAZON-WORKINGBACKWARDS", practice: "Amazon Working Backwards — write the customer PR/FAQ before building the product",
    benchmarkClaim: "Working Backwards writes a press release / PR-FAQ from the customer before writing any code",
    research: { query: "Amazon Working Backwards PR/FAQ", sources: [
      { url: "https://aws.amazon.com/executive-insights/content/product-management-at-amazon/", status: "RETRIEVED", consultedDate: "2026-11-16", claims: [{ text: "Working Backwards writes a press release / PR-FAQ from the customer before writing any code", type: "FACT" }] },
      { url: "https://fourweekmba.com/working-backwards/", status: "INACCESSIBLE", httpStatus: 403, claims: [] } ] },
    metiers: ["M1", "P14"], applicable: true, odgCapability: "acceptance-criteria-first mission contracts (WORK_ITEM_CONTRACT: objective+acceptance before execution)", odgState: "PARTIAL",
    impact: 3, feasibility: 4, cost: 2, risk: 1,
    proposal: "(candidate) formalize a customer-outcome 'PR/FAQ' step before product/mission build — PENDING an independent corroborating source",
    acceptanceCriteria: "a second INDEPENDENT accessible source corroborates the practice before it becomes a benchmark",
    reproducibleTest: "re-run the research cycle with a non-Amazon accessible source",
    economicContribution: "HYPOTHESIS: better customer-fit ⇒ higher conversion; needs demand data (currently €0 real clients)",
  },
  {
    id: "BMK-GOOGLE-ERRORBUDGET", practice: "Google SRE error budget — 1 minus the SLO, balances reliability vs release velocity",
    benchmarkClaim: "an error budget is 1 minus the SLO and governs the pace of releases vs reliability",
    research: { query: "Google SRE error budget definition", sources: [
      { url: "https://sre.google/sre-book/embracing-risk/", status: "RETRIEVED", consultedDate: "2026-11-16", claims: [{ text: "an error budget is 1 minus the SLO and governs the pace of releases vs reliability", type: "FACT" }] } ] },
    metiers: ["P7"], applicable: true, odgCapability: "odg-slo-error-budget-view (P7, V207)", odgState: "PARTIAL",
    impact: 3, feasibility: 4, cost: 2, risk: 1,
    proposal: "(candidate) wire error-budget consumption into a release/mission-pace decider — PENDING an independent corroborating source (only the official sre.google defined it; Wikipedia mentioned but did not define it)",
    acceptanceCriteria: "a second INDEPENDENT accessible source corroborates the definition before it becomes a benchmark",
    reproducibleTest: "re-run the research cycle with a non-Google accessible source that defines the error budget",
    economicContribution: "HYPOTHESIS: controlled release pace ⇒ fewer incidents; needs an incident/cost baseline",
  },
]);

function clamp(v: any): number { const n = Number(v); return Number.isFinite(n) ? Math.max(1, Math.min(5, n)) : 1; }

/* synthesize(opts?) -> prioritized roadmap. opts.benchmarks overrides BENCHMARKS. */
function synthesize(opts?: any): any {
  const o = opts && typeof opts === "object" ? opts : {};
  const benchmarks = Array.isArray(o.benchmarks) ? o.benchmarks : BENCHMARKS;

  const items = benchmarks.map((b: any) => {
    const kaq = KAQ.acquire({ query: b.research.query, sources: b.research.sources });
    const corroborated = kaq.knowledge.some((k: any) => k.claim === b.benchmarkClaim && k.classification === "FACT_CORROBORATED");
    const supportingUrls = b.research.sources.filter((s: any) => s.status === "RETRIEVED").map((s: any) => s.url);
    const auth = AUTH.classify(supportingUrls);
    const proven = corroborated && auth.independentOwners >= 2;   // V230: TRUE owner-level independence required
    const impact = clamp(b.impact), feasibility = clamp(b.feasibility), cost = clamp(b.cost), risk = clamp(b.risk);
    const priorityScore = Math.round(((impact * feasibility) / (cost + risk)) * 10) / 10;

    let decision = !proven
      ? (auth.hasOfficial ? "OFFICIAL_CLAIM_NOT_CORROBORATED" : "NOT_A_PROVEN_BENCHMARK")
      : b.applicable === false ? "CORROBORATED_NOT_APPLICABLE"
      : b.odgState === "ALIGNED" ? "ALREADY_ALIGNED_NO_BUILD"
      : "PROPOSED";
    // V231 §1.1: the Radar RECOMPUTES a PROPOSED item's status from its behavioral acceptance check. A jidoka-completeness
    // check that returns ACCEPTED (every fail-closed verdict demonstrably consumed) moves the item PROPOSED → ACCEPTED.
    let acceptanceEvidence: any = null;
    if (decision === "PROPOSED" && b.acceptanceCheck === "jidoka-completeness") {
      const jc = JC.verify();
      acceptanceEvidence = Object.freeze({ check: "jidoka-completeness", verdict: jc.verdict, consumed: jc.consumedCount + "/" + jc.total });
      if (jc.verdict === "ACCEPTED") decision = "ACCEPTED";
    }
    const emit = decision === "PROPOSED" || decision === "ACCEPTED";
    return Object.freeze({
      id: b.id, practice: b.practice, metiers: Object.freeze(b.metiers || []),
      benchmarkProven: proven, corroborationHosts: kaq.accessibleCount, independentOwners: auth.independentOwners,
      hasOfficial: auth.hasOfficial, officialOwners: auth.officialOwners,
      odgCapability: b.odgCapability, odgState: b.odgState, applicable: b.applicable !== false, decision,
      impact, feasibility, cost, risk, priorityScore,
      proposal: emit ? b.proposal : null, acceptanceCriteria: b.acceptanceCriteria || null, reproducibleTest: b.reproducibleTest || null,
      acceptanceEvidence,
      economicContribution: b.economicContribution || null,
      note: decision === "ACCEPTED" ? "ACCEPTED — the proposal's acceptance check passed (every fail-closed verdict demonstrably consumed); verified by behavioral exercise, not merely proposed"
        : decision === "PROPOSED" ? "corroborated benchmark (≥2 independent owners) + a real ODG gap — PROPOSES, does not implement"
        : decision === "OFFICIAL_CLAIM_NOT_CORROBORATED" ? "official vendor source(s) only (<2 independent owners) — a CLAIM, not a benchmark; needs an independent accessible source"
        : decision === "CORROBORATED_NOT_APPLICABLE" ? "corroborated fact but NOT an ODG métier concern — no artificial mapping"
        : decision === "ALREADY_ALIGNED_NO_BUILD" ? "ODG already embodies this — no build (no fabricated gap)"
        : "not corroborated and no official source — a hypothesis, not a benchmark",
    });
  });
  const rank = (d: string) => d === "PROPOSED" ? 3 : d === "ACCEPTED" ? 2 : 0;
  const ranked = [...items].sort((a: any, b: any) => rank(b.decision) - rank(a.decision) || b.priorityScore - a.priorityScore || (a.id < b.id ? -1 : 1));

  // §4 coverage matrix: which métiers have a PROVEN benchmark vs an official-claim vs none.
  const coverage: Record<string, any> = {};
  for (const it of items) for (const m of it.metiers) {
    if (!coverage[m]) coverage[m] = { metier: m, provenBenchmarks: [], officialClaims: [] };
    if (it.decision === "PROPOSED" || it.decision === "ACCEPTED" || it.decision === "ALREADY_ALIGNED_NO_BUILD") coverage[m].provenBenchmarks.push(it.id);
    else if (it.decision === "OFFICIAL_CLAIM_NOT_CORROBORATED") coverage[m].officialClaims.push(it.id);
  }

  return Object.freeze({
    benchmarksTotal: items.length,
    corroboratedCount: items.filter((x: any) => x.benchmarkProven).length,
    proposedCount: items.filter((x: any) => x.decision === "PROPOSED").length,
    acceptedCount: items.filter((x: any) => x.decision === "ACCEPTED").length,
    alignedCount: items.filter((x: any) => x.decision === "ALREADY_ALIGNED_NO_BUILD").length,
    notApplicableCount: items.filter((x: any) => x.decision === "CORROBORATED_NOT_APPLICABLE").length,
    officialClaimOnlyCount: items.filter((x: any) => x.decision === "OFFICIAL_CLAIM_NOT_CORROBORATED").length,
    notProvenCount: items.filter((x: any) => x.decision === "NOT_A_PROVEN_BENCHMARK").length,
    roadmap: Object.freeze(ranked),
    metierCoverage: Object.freeze(Object.values(coverage)),
    coverageNote: "4 world-class practices researched (Toyota/NVIDIA/Amazon/Google); only " + items.filter((x: any) => x.benchmarkProven).length + " are CORROBORATED (≥2 independent owners); Amazon/Google are official CLAIMS pending an independent source. This covers a FEW métiers — the full 20-métier benchmark needs repeated real cycles, NOT fabricated.",
    honesty: "a PROVEN benchmark needs FACT_CORROBORATED + ≥2 INDEPENDENT OWNERS; an official vendor source alone is a CLAIM (official ≠ independently demonstrated); corroborated-but-not-applicable ⇒ no artificial mapping; ALIGNED ⇒ no build; PROPOSES not implements; economic contribution is a HYPOTHESIS with the data needed to validate it, never a forecast.",
  });
}

const RADAR_ROADMAP_CONTRACT = Object.freeze({
  id: "V229R-RADAR-ROADMAP",
  purpose: "§4/§5 — synthesize corroborated benchmarks into a prioritized ODG roadmap + métier coverage; reuse knowledge-acquisition + source-authority",
  invariants: Object.freeze([
    "a PROVEN benchmark needs FACT_CORROBORATED AND ≥2 INDEPENDENT OWNERS (two same-org pages never corroborate each other)",
    "an official vendor source ALONE is a CLAIM, not a benchmark (official ≠ independently demonstrated)",
    "corroborated-but-not-applicable ⇒ no artificial métier mapping; ALIGNED ⇒ no build; PROPOSES, never implements",
    "REUSES knowledge-acquisition + source-authority — NO second radar/registry; economic contribution is a HYPOTHESIS, never a forecast",
  ]),
});

module.exports = { BENCHMARKS, synthesize, RADAR_ROADMAP_CONTRACT };
export {};
