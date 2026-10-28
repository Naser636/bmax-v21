#!/usr/bin/env node
/**
 * failure-taxonomy — V42 §5: a quantified failure taxonomy seeded with REAL defects observed THIS session (not
 * invented), a classifier, and a rank-by-expected-reduction so improvements are chosen on evidence. It composes with
 * capability-taxonomy's VERIFIED_SUCCESS_RATE protocol. HONEST: the seed is a SMALL real sample (defects caught during
 * this session's own lots, provenance-cited) — it is NOT a broad held-out failure study (that remains NO_DATA). Every
 * seed defect was CAUGHT pre-merge (0 shipped), which is itself the measured signal: independent verification worked.
 * Pure/deterministic.
 */
"use strict";

// Failure categories (CTO V42 §5). Each failure classifies into exactly one primary category.
const CATEGORIES = Object.freeze([
  "REQUIREMENTS_MISUNDERSTOOD", "MISSING_CONTEXT", "POOR_DECOMPOSITION", "WRONG_CAPABILITY_SELECTION",
  "INSUFFICIENT_PERMISSIONS", "HALLUCINATED_OR_STALE_API", "FRAGILE_PATCH", "INADEQUATE_TESTS",
  "HIDDEN_INTERFACE_FAILURE", "NONDETERMINISM_OR_ENV_DRIFT", "SECURITY_REJECTION", "INCOMPLETE_RECOVERY",
  "WEAK_PROVENANCE", "STALE_LEARNING", "PREMATURE_COMPLETION",
]);
const SEVERITY_WEIGHT: Record<string, number> = { HIGH: 3, MED: 2, LOW: 1 };

// OBSERVED seed — REAL defects from this session's lots, with the stage that CAUGHT them (all pre-merge, 0 shipped).
const OBSERVED: readonly any[] = Object.freeze([
  { id: "F1", lot: "V34 opportunity-detector", category: "HALLUCINATED_OR_STALE_API", severity: "HIGH", caughtBy: "live-run", shipped: false, detail: "detect() called REV.targetPlan which revenue-model does not export (renamed) → threw on every budgeted opportunity" },
  { id: "F2", lot: "V38 capabilityFit", category: "INADEQUATE_TESTS", severity: "MED", caughtBy: "live-run", shipped: false, detail: "naive substring matched 'ssi' inside 'aussi/assistance' → false positives; unit tests passed but the live run exposed it" },
  { id: "F3", lot: "V37 tender-feed-connector", category: "FRAGILE_PATCH", severity: "LOW", caughtBy: "unit-test", shipped: false, detail: "Number(null)===0 (finite) coerced a null budget to 0" },
  { id: "F4", lot: "V38 bounded-http-client.test", category: "INADEQUATE_TESTS", severity: "LOW", caughtBy: "run-test", shipped: false, detail: "pass<20 guard with 18 assertions forced exit 1 (wrong guard constant)" },
  { id: "F5", lot: "V25 portfolio-dashboard", category: "HIDDEN_INTERFACE_FAILURE", severity: "LOW", caughtBy: "tsc", shipped: false, detail: "reduce-accumulator spread type (TS2698) — caught by the separate tsc gate" },
  { id: "F6", lot: "V39 ted-connector.test", category: "NONDETERMINISM_OR_ENV_DRIFT", severity: "LOW", caughtBy: "run-test", shipped: false, detail: "top-level await under tsx CJS — needed an async IIFE wrapper" },
]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function nonEmptyString(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

/** classify(record): map a failure record to its category (validated against the known set), else UNCLASSIFIED. */
function classify(record: any): any {
  if (!isObj(record)) return { ok: false, code: "INVALID_INPUT" };
  const cat = nonEmptyString(record.category) && CATEGORIES.includes(record.category) ? record.category : "UNCLASSIFIED";
  return { ok: true, category: cat, severity: SEVERITY_WEIGHT[record.severity] ? record.severity : "LOW" };
}

/** rankInterventions(observed?): rank categories by sum(severityWeight) and attach the evidence-based fix. */
function rankInterventions(observed: readonly any[] = OBSERVED): any {
  const INTERVENTION: Record<string, string> = {
    INADEQUATE_TESTS: "design tests from the failure mode first + a LIVE/integration check before merge (not only unit)",
    HALLUCINATED_OR_STALE_API: "verify callee exports exist (grep/tsc) before calling; guard optional provider methods",
    FRAGILE_PATCH: "explicit type/null guards; avoid Number()/== coercions on nullable fields",
    HIDDEN_INTERFACE_FAILURE: "keep the separate tsc gate (it caught this); annotate reduce/spread accumulators",
    NONDETERMINISM_OR_ENV_DRIFT: "wrap async suites in an IIFE; pin runtime assumptions; no top-level await under CJS",
  };
  const agg: Record<string, any> = {};
  for (const f of observed) {
    const c = f.category || "UNCLASSIFIED";
    if (!agg[c]) agg[c] = { category: c, count: 0, weight: 0, severities: [] };
    agg[c].count++; agg[c].weight += SEVERITY_WEIGHT[f.severity] || 1; agg[c].severities.push(f.severity);
  }
  const ranked = Object.values(agg).sort((a: any, b: any) => b.weight - a.weight || b.count - a.count)
    .map((r: any) => ({ ...r, intervention: INTERVENTION[r.category] || "investigate with more evidence" }));
  return ranked;
}

/** summary(observed?): honest counts + caught-vs-shipped + the broad-eval NO_DATA caveat. */
function summary(observed: readonly any[] = OBSERVED): any {
  const list = Array.isArray(observed) ? observed : [];
  const shipped = list.filter((f) => f.shipped === true).length;
  const ranked = rankInterventions(list);
  return {
    sampleSize: list.length,
    caughtPreMerge: list.filter((f) => f.shipped === false).length,
    shipped,
    topCategory: ranked.length ? ranked[0].category : null,
    ranked,
    broadFailureStudy: "NO_DATA — this seed is THIS session's own defects (small, real), not a held-out broad-IT failure study",
    headline: `${list.length} real defects observed this session, ${list.length - shipped} CAUGHT pre-merge, ${shipped} shipped. Dominant cause: ${ranked.length ? ranked[0].category : "n/a"} ⇒ ${ranked.length ? ranked[0].intervention : "n/a"}. Independent verification (tsc + live-run + tests) caught every defect; defect-escape rate 0 THIS session is NOT a VERIFIED_SUCCESS_RATE claim.`,
  };
}

export { CATEGORIES, SEVERITY_WEIGHT, OBSERVED, classify, rankInterventions, summary };
module.exports = { CATEGORIES, SEVERITY_WEIGHT, OBSERVED, classify, rankInterventions, summary };

if (require.main === module) {
  process.stdout.write(JSON.stringify(summary(), null, 2) + "\n");
}
