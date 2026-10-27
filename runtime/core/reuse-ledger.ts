#!/usr/bin/env node
/**
 * reuse-ledger — the previously-MISSING write-back that closes the reuse loop (V21 Phase 3).
 *
 * The existing stack models capture → persist → retrieve → select → reuse → EFFECTIVE (learning-chain,
 * patch-memory.reuseCount, capability-metrics, provider-reuse-candidate). But a reuse that made things
 * WORSE produced no record: no `reuse-failed` state, no per-asset usage history, no known-regression, and
 * no de-selection of a regressing asset. This module adds exactly that — the outcome write-back — WITHOUT
 * touching any live path. It is pure/composable:
 *   - classifyReuseOutcome(delta) grades a measured before/after (from improvement-baseline.measureDelta)
 *     into REUSE_VALIDATED | REUSE_FAILED | REUSE_INCONCLUSIVE, honoring learning-chain's "no fabricated
 *     effect" rule: no measured change ⇒ INCONCLUSIVE, NEVER validated.
 *   - recordReuseOutcome(signature, {before, after, ...}) appends a usageHistory[] entry, maintains
 *     counters, records a knownRegressions[] entry on failure, and recomputes a `suppressed` flag.
 *   - reuseHealth / suppressedSignatures expose the de-selection signal a selector (capability-router /
 *     capability-metrics) can consume so a regressing asset is not reused again.
 *
 * Deny-by-default: bad input fails closed (never silently "validated"). The store is INJECTABLE
 * (opts.store with read/write) defaulting to the shared autonomy-store under key "reuse-ledger", so tests
 * run hermetically and never pollute runtime/generated. No clock/network of its own except an optional
 * `at` timestamp (caller-supplied for determinism; defaults to now in production).
 */
"use strict";

const BASELINE = require("./improvement-baseline.js");

const LEDGER_KEY = "reuse-ledger";
const SCHEMA_VERSION = 1;
// A regressing asset is SUPPRESSED (de-selected) once it has failed enough times AND fails more than it
// validates — enough evidence that reuse is net-harmful, not a single unlucky run.
const SUPPRESS_MIN_FAILURES = 2;

export type ReuseOutcome = "REUSE_VALIDATED" | "REUSE_FAILED" | "REUSE_INCONCLUSIVE";
const OUTCOMES: Readonly<Record<ReuseOutcome, ReuseOutcome>> = Object.freeze({
  REUSE_VALIDATED: "REUSE_VALIDATED",
  REUSE_FAILED: "REUSE_FAILED",
  REUSE_INCONCLUSIVE: "REUSE_INCONCLUSIVE",
});

function nonEmptyString(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/**
 * classifyReuseOutcome(delta): grade a measureDelta() result.
 *   - no measured signal at all (only flat/unmeasured) ⇒ REUSE_INCONCLUSIVE (no fabricated effect).
 *   - net regressed (regressed > improved)             ⇒ REUSE_FAILED.
 *   - net improved  (improved  > regressed)            ⇒ REUSE_VALIDATED.
 *   - measured but tied (improved === regressed > 0)    ⇒ REUSE_INCONCLUSIVE.
 */
function classifyReuseOutcome(delta: any): { outcome: ReuseOutcome; reason: string; measured: boolean } {
  const s = isObj(delta) && isObj(delta.summary) ? delta.summary : null;
  if (!s) return { outcome: OUTCOMES.REUSE_INCONCLUSIVE, reason: "no delta summary — not measurable", measured: false };
  const improved = Number(s.improved) || 0;
  const regressed = Number(s.regressed) || 0;
  if (improved === 0 && regressed === 0) return { outcome: OUTCOMES.REUSE_INCONCLUSIVE, reason: "no measured change (only flat/unmeasured signals)", measured: false };
  if (regressed > improved) return { outcome: OUTCOMES.REUSE_FAILED, reason: `net regression (${regressed} regressed > ${improved} improved)`, measured: true };
  if (improved > regressed) return { outcome: OUTCOMES.REUSE_VALIDATED, reason: `net improvement (${improved} improved > ${regressed} regressed)`, measured: true };
  return { outcome: OUTCOMES.REUSE_INCONCLUSIVE, reason: `mixed, no net effect (${improved} improved = ${regressed} regressed)`, measured: true };
}

function defaultStore(): any { return require("./autonomy-store.js"); }

/** loadLedger(opts?): read the ledger (fail-safe empty) from the injected/default store. */
function loadLedger(opts: any = {}): any {
  const store = opts.store || defaultStore();
  const raw = store.read(LEDGER_KEY, null);
  if (!isObj(raw) || !isObj(raw.assets)) return { version: SCHEMA_VERSION, assets: {} };
  return raw;
}

/** regressed metric names in a delta (for the known-regression record). */
function regressedMetrics(delta: any): string[] {
  const m = isObj(delta) && isObj(delta.metrics) ? delta.metrics : {};
  return Object.keys(m).filter((k) => m[k] && m[k].direction === "regressed");
}

function recomputeFlags(asset: any): void {
  asset.suppressed = asset.failed >= SUPPRESS_MIN_FAILURES && asset.failed > asset.validated;
  asset.netValidated = asset.validated - asset.failed;
}

/**
 * recordReuseOutcome(signature, { before, after, senseMap, context, adapted, at }, opts?):
 * measure the reuse's effect, classify it, and WRITE IT BACK onto the asset's usage history + regressions.
 * Returns { ok, signature, outcome, asset } or a fail-closed { ok:false, code }.
 */
function recordReuseOutcome(signature: any, input: any = {}, opts: any = {}): any {
  if (!nonEmptyString(signature)) return { ok: false, code: "INVALID_INPUT", detail: "signature (non-empty string) required" };
  if (!isObj(input)) return { ok: false, code: "INVALID_INPUT", detail: "input object required" };
  const store = opts.store || defaultStore();
  const delta = BASELINE.measureDelta(input.before, input.after, input.senseMap);
  const cls = classifyReuseOutcome(delta);
  const at = nonEmptyString(input.at) ? input.at : new Date().toISOString();

  const ledger = loadLedger(opts);
  const sig = String(signature);
  const asset = ledger.assets[sig] || { signature: sig, uses: 0, validated: 0, failed: 0, inconclusive: 0, netValidated: 0, suppressed: false, usageHistory: [], knownRegressions: [] };

  asset.uses += 1;
  if (cls.outcome === OUTCOMES.REUSE_VALIDATED) asset.validated += 1;
  else if (cls.outcome === OUTCOMES.REUSE_FAILED) asset.failed += 1;
  else asset.inconclusive += 1;

  asset.usageHistory.push({
    at,
    context: nonEmptyString(input.context) ? input.context : null,
    adapted: input.adapted === true,
    outcome: cls.outcome,
    measured: cls.measured,
    reason: cls.reason,
    delta: { improved: delta.summary.improved, regressed: delta.summary.regressed, flat: delta.summary.flat, unmeasured: delta.summary.unmeasured },
  });

  if (cls.outcome === OUTCOMES.REUSE_FAILED) {
    asset.knownRegressions.push({ at, context: nonEmptyString(input.context) ? input.context : null, metrics: regressedMetrics(delta), reason: cls.reason });
  }

  recomputeFlags(asset);
  ledger.assets[sig] = asset;
  store.write(LEDGER_KEY, ledger);
  return { ok: true, signature: sig, outcome: cls.outcome, measured: cls.measured, reason: cls.reason, asset };
}

/** reuseHealth(signature, opts?): pure read of one asset's reuse health (de-selection signal). */
function reuseHealth(signature: any, opts: any = {}): any {
  if (!nonEmptyString(signature)) return { ok: false, code: "INVALID_INPUT" };
  const ledger = loadLedger(opts);
  const a = ledger.assets[String(signature)];
  if (!a) return { ok: true, signature: String(signature), known: false, uses: 0, validated: 0, failed: 0, inconclusive: 0, netValidated: 0, suppressed: false, knownRegressions: [] };
  return { ok: true, signature: a.signature, known: true, uses: a.uses, validated: a.validated, failed: a.failed, inconclusive: a.inconclusive, netValidated: a.netValidated, suppressed: a.suppressed, knownRegressions: a.knownRegressions };
}

/** suppressedSignatures(opts?): the set of signatures a selector should currently AVOID reusing. */
function suppressedSignatures(opts: any = {}): string[] {
  const ledger = loadLedger(opts);
  return Object.values(ledger.assets).filter((a: any) => a && a.suppressed === true).map((a: any) => a.signature);
}

export { OUTCOMES, LEDGER_KEY, SUPPRESS_MIN_FAILURES, classifyReuseOutcome, recordReuseOutcome, reuseHealth, suppressedSignatures, loadLedger };
module.exports = { OUTCOMES, LEDGER_KEY, SUPPRESS_MIN_FAILURES, classifyReuseOutcome, recordReuseOutcome, reuseHealth, suppressedSignatures, loadLedger };

// Read-only CLI: print the outcome vocabulary + suppression policy; mutates nothing.
if (require.main === module) {
  process.stdout.write(JSON.stringify({ model: "reuse-ledger/1", outcomes: Object.keys(OUTCOMES), suppressMinFailures: SUPPRESS_MIN_FAILURES }, null, 2) + "\n");
}
