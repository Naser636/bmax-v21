#!/usr/bin/env node
"use strict";
/*
 * EVAL MEASUREMENT-INTEGRITY TOOLKIT INDEX — the consumer that makes the session's eval statistics discoverable.
 * PURE, deterministic, READ-ONLY.
 *
 * The nine eval/statistics modules built this session (plus the pre-existing eval-significance) had NO SINGLE
 * DISCOVERABILITY CONSUMER tying them together as a toolkit (the §2 "built ≠ integrated" gap the V207 audit named; cf.
 * odg-metier-improvement-index). NB (honest scope): this is NOT a blanket "0-consumer" claim — eval-significance is
 * already well-integrated (several external consumers), and 4 leaf modules are consumed intra-cluster (e.g. κ/rank-corr/
 * MCC by the agreement-scorecard, ks-test by the data-drift-view); 5 are genuinely standalone. What was missing is a
 * UNIFIED catalog + routing. This index provides it: it imports each, verifies it LOADS and exposes its frozen
 * *_CONTRACT, groups them by MEASUREMENT CONCERN, and carries a "pick-which-for-what" routing aid + cross-cutting honesty
 * reminders. It EXECUTES none of them against data (each stays an on-demand capability) — only loadable + contract-bearing.
 *
 * Honesty: this is a discoverability INDEX, NOT a new statistic and NOT a new engine; the routing `pickWhen` is an aid,
 * not a verdict; it makes no measurement claim of its own. Deterministic; no network/clock/randomness.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function freeze(o: any): any { return Object.freeze(o); }

// The eval measurement-integrity cluster: module → category + the question it answers. require(.js) resolves the sibling under tsx.
const REGISTRY = Object.freeze([
  freeze({ name: "odg-inter-rater-agreement", category: "AGREEMENT", pickWhen: "two evaluators give CATEGORICAL labels — agreement beyond chance (Cohen's/Fleiss' κ)" }),
  freeze({ name: "odg-rank-correlation", category: "AGREEMENT", pickWhen: "evaluators emit SCORES/RANKINGS — do they ORDER items alike (Spearman ρ / Kendall τ-b)" }),
  freeze({ name: "odg-bland-altman", category: "AGREEMENT", pickWhen: "two CONTINUOUS measurement methods — bias + limits of agreement (NOT correlation)" }),
  freeze({ name: "odg-evaluator-agreement-scorecard", category: "AGREEMENT", pickWhen: "compose κ + rank-corr + MCC into one evaluator view (agreement ≠ accuracy)" }),
  freeze({ name: "odg-binary-classification-metrics", category: "CLASSIFICATION_QUALITY", pickWhen: "a 2×2 confusion matrix vs ground truth — MCC (honest for imbalance) + specificity/BA" }),
  freeze({ name: "odg-passk-estimator", category: "CAPABILITY", pickWhen: "n sampled attempts, c correct — unbiased pass@k (≥1 of k; capability, not reliability)" }),
  freeze({ name: "eval-significance", category: "SIGNIFICANCE", pickWhen: "is a single difference real? (Wilson CI / two-proportion z / McNemar)" }),
  freeze({ name: "odg-multiple-testing-correction", category: "SIGNIFICANCE", pickWhen: "MANY comparisons at once — control FWER (Bonferroni/Holm) or FDR (Benjamini–Hochberg)" }),
  freeze({ name: "odg-ks-test", category: "DRIFT", pickWhen: "two CONTINUOUS samples — did the distribution drift? (distribution-free KS, no binning)" }),
  freeze({ name: "odg-data-drift-view", category: "DRIFT", pickWhen: "compose PSI (binned) + KS (continuous) into one drift consensus" }),
]);

// Cross-cutting honesty reminders the toolkit enforces — collected so callers see them in one place.
const HONESTY = Object.freeze([
  "AGREEMENT ≠ ACCURACY: evaluators concurring (κ / rank-corr / Bland–Altman) does not mean either is correct — only ground-truth metrics (MCC) measure correctness",
  "AGREEMENT ≠ CORRELATION for continuous methods: a high correlation can hide a systematic bias (use Bland–Altman)",
  "FWER ≠ FDR: distinct error-rate guarantees; a single uncorrected p-value across many tests overstates significance",
  "pass@k (capability, ≥1 of k) ≠ pass^k (reliability, all k) — see p2-passk-reliability",
  "a null/UNDEFINED/NOT_MEASURED result is honest (inputs absent or degenerate), never coerced to a fabricated number",
]);

function findContract(mod: any): any {
  for (const v of Object.values(mod || {})) if (isObj(v) && typeof (v as any).id === "string" && Array.isArray((v as any).invariants)) return v;
  return null;
}

/** buildIndex() -> { ok, total, loaded, modules[], byCategory, honesty, note }. READ-ONLY: loads+verifies, executes nothing. */
function buildIndex(): any {
  const modules = REGISTRY.map((entry: any) => {
    let mod: any = null, contract: any = null, loadError: string | null = null;
    try { mod = require("./" + entry.name + ".js"); } catch (e: any) { loadError = String(e && e.message ? e.message : e); }
    if (mod) contract = findContract(mod);
    return freeze({ name: entry.name, category: entry.category, pickWhen: entry.pickWhen,
      loaded: mod !== null, hasContract: contract !== null, contractId: contract ? contract.id : null,
      exports: mod ? freeze(Object.keys(mod).filter((k) => typeof mod[k] === "function")) : freeze([]),
      loadError });
  });
  const loaded = modules.filter((m: any) => m.loaded && m.hasContract).length;
  const byCategory: Record<string, string[]> = {};
  for (const m of modules) { (byCategory[m.category] = byCategory[m.category] || []).push(m.name); }
  const frozenByCat: any = {}; for (const k of Object.keys(byCategory)) frozenByCat[k] = freeze(byCategory[k]);
  return freeze({ ok: true, total: modules.length, loaded, modules: freeze(modules), byCategory: freeze(frozenByCat), honesty: HONESTY,
    note: "unified DISCOVERABILITY/ROUTING consumer for the eval measurement-integrity toolkit — what was missing was a single catalog (NOT a blanket 0-consumer claim: eval-significance is already integrated; several leaf modules are consumed intra-cluster). READ-ONLY (loads + verifies contracts, executes nothing); `pickWhen` is a routing aid, not a verdict; makes no measurement claim of its own." });
}

/** pickFor(concern) -> modules whose category matches (AGREEMENT|CLASSIFICATION_QUALITY|CAPABILITY|SIGNIFICANCE|DRIFT). */
function pickFor(concern: any): any {
  const idx = buildIndex();
  const hits = idx.modules.filter((m: any) => m.category === concern);
  if (!hits.length) return freeze({ ok: false, code: "UNKNOWN_CONCERN", detail: `no modules for '${concern}'; concerns: ${[...new Set(idx.modules.map((m: any) => m.category))].join("|")}` });
  return freeze({ ok: true, concern, modules: freeze(hits.map((m: any) => freeze({ name: m.name, pickWhen: m.pickWhen, contractId: m.contractId }))) });
}

const EVAL_STATISTICS_INDEX_CONTRACT = Object.freeze({
  id: "EVAL-STATISTICS-INDEX",
  purpose: "unified DISCOVERABILITY/ROUTING consumer for the eval measurement-integrity statistics (a single catalog — NOT a 0-consumer claim), grouped by concern with routing + honesty reminders",
  reuses: Object.freeze(REGISTRY.map((e: any) => e.name)),
  invariants: Object.freeze([
    "a discoverability INDEX — NOT a new statistic/engine; it makes no measurement claim of its own",
    "READ-ONLY: it loads each module and verifies a frozen *_CONTRACT, but EXECUTES none against data",
    "groups modules by measurement concern (AGREEMENT/CLASSIFICATION_QUALITY/CAPABILITY/SIGNIFICANCE/DRIFT); pickWhen is a routing AID, not a verdict",
    "surfaces the cluster's cross-cutting honesty reminders (agreement≠accuracy, agreement≠correlation, FWER≠FDR, pass@k≠pass^k)",
    "PURE + deterministic; no network/clock/randomness",
  ]),
});

module.exports = { REGISTRY, HONESTY, buildIndex, pickFor, EVAL_STATISTICS_INDEX_CONTRACT };
export {};
