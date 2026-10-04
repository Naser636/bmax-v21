#!/usr/bin/env node
"use strict";

/*
 * V5 STAGE 3 — D: LIVE COST METERING.
 *
 * Branches the OBSERVED provider usage transported by increment E (provider-port.ProviderUsageObservation)
 * onto the EXISTING cost-accounting lifecycle, driven by an INJECTED provider call. It composes the three
 * already-proven primitives WITHOUT reimplementing any of them:
 *   - budget-contract.js   — the SOURCE of a mission's declared budget (ABSENT / DECLARED / MALFORMED);
 *   - cost-accounting.js    — the cost-budget bound to a declared economic unit (reserve/commit/spend/release);
 *   - economic-unit.js      — the exact economic Quantity + OBSERVED cost measurement.
 *
 * It creates NO second budget system and invents NO money. It meters ONLY when the mission declares a
 * VALID budget; it SPENDS only a REAL observation; and it never fabricates a cost, an estimate, a currency,
 * or an overspend. The CTO-mandated sequence (faithful to FICHE_03 §185):
 *
 *   1. resolve the budget contract                     (budget-contract.resolveBudget)
 *      - ABSENT    → meter nothing; run the provider unchanged (backward compatible).
 *      - MALFORMED → clean refusal; the provider is NOT invoked.
 *   2. RESERVE the declared bucket ceiling             (admission — proves budget present & non-exhausted
 *                                                        BEFORE the call; a zero/exhausted ceiling refuses
 *                                                        the call with no provider invocation).
 *   3. execute the INJECTED provider call.
 *   4. read the OBSERVED usage from the provider outcome (E).
 *   5. RELEASE the admission reservation (return the remainder to AVAILABLE).
 *   6. SPEND — ONLY on a clean (classification OK) run carrying a REAL OBSERVED usage in the budget's unit:
 *        reserve(observed) → commit → spend(observed).  Overspend (observed > ceiling) ⇒ EXHAUSTED, no spend.
 *   7. On provider failure / absent observation / unit or scale mismatch / zero usage:
 *        NO fictive spend; the admission reservation is already released (recovered).
 *
 * Pure/deterministic given its injected `execute` (no clock, randomness or I/O of its own — ledgers in →
 * ledger snapshot out, via the primitives' own pure ops). A read-only require.main CLI prints the descriptor.
 * This is Stage 3 COST accounting only — NOT revenue / settlement / cash / profit (later, contract-gated).
 *
 * ADDITIVE EVIDENCE-ONLY VALUATION (wiring of the price-resolution core): when — and ONLY when — the caller
 * SUPPLIES a price `catalog`, this module attaches a DERIVED monetary valuation of the metered OBSERVED usage
 * (via price-resolution.valueFromCatalog) as pure `valuation` evidence on its result. It is strictly additive:
 *   - it NEVER feeds the ledger, the spend, or the budget decision — the COST_UNIT accounting is unchanged;
 *   - a DERIVED value is never OBSERVED, never ESTIMATED, never BILLED, never SPENT;
 *   - with NO catalog supplied the feature is dormant (valuation:null) — byte-for-byte the prior behaviour;
 *   - it invents NO rate: a supplied catalog carries the rates, and a missing/ambiguous/stale rule stays
 *     UNKNOWN with a null amount (never a fabricated 0); a genuine observed 0 priced by a rule is DERIVED 0;
 *     absent/non-observed usage stays NOT_OBSERVED (USAGE_UNKNOWN, null). All per price-resolution verbatim.
 */

const E = require("./economic-unit");
const cost = require("./cost-accounting");
const budgetContract = require("./budget-contract");
const price = require("./price-resolution");

const LIVE_COST_METERING_CONTRACT = Object.freeze({
  id: "V5-STAGE3-LIVE-COST-METERING",
  source: "FICHE_03 §185; composes budget-contract + cost-accounting + economic-unit; consumes provider OBSERVED usage (E)",
  decisions: Object.freeze([
    "BUDGET_ABSENT",      // no budget declared ⇒ provider runs, nothing metered (backward compatible)
    "BUDGET_MALFORMED",   // present-but-invalid budget ⇒ clean refusal, provider NOT invoked
    "NO_BUCKET",          // valid budget but no allocation for the requested bucket ⇒ clean refusal
    "REFUSED_EXHAUSTED",  // ceiling 0 / already exhausted at admission ⇒ provider NOT invoked
    "SPENT",              // clean run + real OBSERVED usage within ceiling ⇒ spent exactly the observed amount
    "EXHAUSTED",          // OBSERVED usage exceeds the ceiling ⇒ overspend refused, no spend
    "NO_SPEND_PROVIDER_NOT_OK",   // provider did not return OK ⇒ no fictive spend
    "NO_SPEND_NO_OBSERVATION",    // no real OBSERVED usage ⇒ no fictive spend
    "NO_SPEND_UNIT_MISMATCH",     // observation in a different unit ⇒ no implicit conversion, no spend
    "NO_SPEND_SCALE_MISMATCH",    // observation in a different scale ⇒ no coercion, no spend
    "NO_SPEND_ZERO_USAGE",        // observed amount is zero ⇒ nothing to spend
    "NO_SPEND_PROVIDER_ERROR",    // the injected call threw ⇒ no fictive spend
  ]),
  invariants: Object.freeze([
    "meter ONLY when the mission declares a VALID budget (present && ok)",
    "SPEND only a REAL OBSERVED usage from the provider (never an estimate, never a constant)",
    "no fictive spend on provider failure / absent observation",
    "no implicit unit or scale conversion (mismatch ⇒ refuse spend)",
    "no overspend: observed beyond ceiling ⇒ EXHAUSTED, reservation released",
    "admission reservation always released (recovered) when not spent",
    "no money invented: usage is metered as usage; tokens are never turned into currency for the SPEND",
    "a SUPPLIED catalog yields an ADDITIVE, EVIDENCE-ONLY DERIVED valuation (never spent, never billed, never in the ledger); no catalog ⇒ dormant (valuation:null); missing/ambiguous/stale rule ⇒ UNKNOWN null, never 0",
    "deterministic / pure given the injected provider call (valuation as-of/dimensions are explicit inputs)",
  ]),
});

function isPlainObject(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }

/** Read an outcome's E observation, defaulting a legacy/missing field to ABSENT (never a fabricated 0). */
function observationOf(outcome) {
  const o = isPlainObject(outcome) ? outcome.observation : null;
  if (isPlainObject(o) && (o.basis === "OBSERVED" || o.basis === "ESTIMATED" || o.basis === "ABSENT")) return o;
  return { basis: "ABSENT", quantities: [], provenance: null };
}

/** Pick the observed quantity that matches the budget's unit+kind (no implicit conversion). */
function matchingObserved(observation, unit, kind) {
  const qs = Array.isArray(observation.quantities) ? observation.quantities : [];
  return qs.find((q) => isPlainObject(q) && q.unit === unit && q.kind === kind) || null;
}

/**
 * deriveValuation(observation, alloc, outcome, catalog, priceQuery) -> an ADDITIVE, EVIDENCE-ONLY DERIVED
 * valuation of the metered OBSERVED usage against a SUPPLIED price catalog, or null when no catalog is
 * supplied (feature dormant — the COST_UNIT spend is untouched). It NEVER feeds the ledger/spend: the value
 * is a DERIVED ASSET amount from price-resolution, never OBSERVED, never BILLED, never spent. Semantics are
 * price-resolution verbatim — it prices the SAME observed quantity the budget meters (alloc.unit/kind) so the
 * evidence and the spend describe the one observation:
 *   - genuine OBSERVED usage in the priced unit + exactly one applicable rule ⇒ OK, DERIVED value (0×rate=0);
 *   - OBSERVED usage + missing/ambiguous/stale rule ⇒ that status, value null (UNKNOWN, never a fabricated 0);
 *   - usage absent / not a genuine OBSERVED observation ⇒ USAGE_UNKNOWN (NOT_OBSERVED), value null.
 * Deterministic: the as-of / provider / model resolution dimensions are explicit INPUTS (no clock).
 */
function deriveValuation(observation, alloc, outcome, catalog, priceQuery) {
  if (!isPlainObject(catalog)) return null; // no supplied catalog ⇒ dormant (backward compatible)
  const pq = isPlainObject(priceQuery) ? priceQuery : {};
  const query = {
    usageUnit: alloc.unit,
    usageKind: alloc.kind,
    provider: isNonEmptyString(pq.provider) ? pq.provider
      : (isPlainObject(outcome) && isNonEmptyString(outcome.provider) ? outcome.provider : null),
    model: isNonEmptyString(pq.model) ? pq.model : null,
    asOf: isNonEmptyString(pq.asOf) ? pq.asOf : null,
  };
  // Only a GENUINE OBSERVED observation in the metered unit yields a priced quantity; anything else is left
  // to price-resolution as NOT_OBSERVED (null). ESTIMATED/ABSENT usage is never DERIVED-valued here.
  const obs = observation.basis === "OBSERVED" ? matchingObserved(observation, alloc.unit, alloc.kind) : null;
  const observedQ = (obs && Number.isInteger(obs.minor) && obs.minor >= 0 && Number.isInteger(obs.scale) && obs.scale >= 0)
    ? E.quantity(alloc.unit, alloc.kind, obs.minor, obs.scale)
    : null;
  return price.valueFromCatalog(catalog, query, observedQ);
}

/**
 * meterProviderCall({ spec, bucket, allocationId, execute, commandBasis }) -> {
 *   present, valid, metered, executed, decision, observed, spent, snapshot, outcome, errors?
 * }
 *   - spec:         the parsed mission contract (may carry `budget`).
 *   - bucket:       which declared budget bucket to meter against (default "provider").
 *   - allocationId: ledger allocation id root (default "provider-call").
 *   - execute:      () => providerOutcome  — the INJECTED provider call (returns an E observation). Required.
 *
 * NEVER throws for a provider that returns data; a thrown injected call is caught as NO_SPEND_PROVIDER_ERROR.
 */
function meterProviderCall(opts) {
  const o = isPlainObject(opts) ? opts : {};
  const execute = typeof o.execute === "function" ? o.execute : null;
  if (!execute) throw new Error("meterProviderCall: an injected `execute` function is required");
  const bucket = isNonEmptyString(o.bucket) ? o.bucket : "provider";
  const idRoot = isNonEmptyString(o.allocationId) ? o.allocationId : "provider-call";

  const resolved = budgetContract.resolveBudget(o.spec);

  // (1a) BUDGET ABSENT — invent nothing; run the provider unchanged (backward compatible). No budget ⇒ no
  // metered unit to value against ⇒ valuation stays dormant even if a catalog was supplied.
  if (!resolved.present) {
    const outcome = execute();
    return Object.freeze({ present: false, valid: false, metered: false, executed: true, decision: "BUDGET_ABSENT", observed: null, spent: false, snapshot: null, outcome, valuation: null });
  }
  // (1b) BUDGET MALFORMED — clean refusal; the provider is NOT invoked.
  if (!resolved.ok) {
    return Object.freeze({ present: true, valid: false, metered: false, executed: false, decision: "BUDGET_MALFORMED", observed: null, spent: false, snapshot: null, outcome: null, errors: resolved.errors, valuation: null });
  }

  // (2) VALID budget — find the allocation for the requested bucket.
  const alloc = resolved.budget.allocations.find((a) => a.bucket === bucket) || null;
  if (!alloc) {
    return Object.freeze({ present: true, valid: true, metered: false, executed: false, decision: "NO_BUCKET", observed: null, spent: false, snapshot: null, outcome: null, valuation: null });
  }

  const cb0 = cost.createCostBudget(alloc.unit, alloc.kind, alloc.amount);
  const ceilingQ = E.quantity(alloc.unit, alloc.kind, alloc.amount, alloc.scale);
  const admitId = `${idRoot}:admit`;
  const spendId = `${idRoot}:spend`;

  // (2→admission) RESERVE the ceiling. A zero/exhausted ceiling refuses the call — the provider is NOT invoked.
  const admit = cost.reserve(cb0, admitId, ceilingQ);
  if (!admit.ok) {
    return Object.freeze({ present: true, valid: true, metered: true, executed: false, decision: "REFUSED_EXHAUSTED", observed: null, spent: false, snapshot: admit.snapshot, outcome: null, exhaustion: admit.exhaustion || null, valuation: null });
  }
  let cb = admit.costBudget;

  // (3) Execute the injected provider call.
  let outcome;
  try {
    outcome = execute();
  } catch (err) {
    const rel = cost.release(cb, admitId); // recover the admission reservation — no fictive spend
    // The call threw ⇒ no observation exists ⇒ no valuation evidence (never a fabricated amount).
    return Object.freeze({ present: true, valid: true, metered: true, executed: true, decision: "NO_SPEND_PROVIDER_ERROR", observed: null, spent: false, snapshot: rel.snapshot, outcome: null, error: String((err && err.message) || err), valuation: null });
  }

  // (4) Read the OBSERVED usage (E). (5) Release the admission reservation (return the remainder).
  const observation = observationOf(outcome);
  cb = cost.release(cb, admitId).costBudget;

  // ADDITIVE evidence: a DERIVED valuation of the metered OBSERVED usage against any SUPPLIED catalog.
  // Computed once from the released observation; it NEVER influences the spend decision or the ledger below.
  const valuation = deriveValuation(observation, alloc, outcome, o.catalog, o.priceQuery);

  const done = (decision, observed, spent) =>
    Object.freeze({ present: true, valid: true, metered: true, executed: true, decision, observed: observed || null, spent: !!spent, snapshot: cost.snapshot(cb), outcome, valuation });

  // (6/7) SPEND only on a clean run carrying a real OBSERVED usage in the budget's unit.
  if (!isPlainObject(outcome) || outcome.classification !== "OK") return done("NO_SPEND_PROVIDER_NOT_OK", null, false);
  if (observation.basis !== "OBSERVED" || observation.quantities.length === 0) return done("NO_SPEND_NO_OBSERVATION", null, false);

  const obs = matchingObserved(observation, alloc.unit, alloc.kind);
  if (!obs) return done("NO_SPEND_UNIT_MISMATCH", null, false);
  if (obs.scale !== alloc.scale) return done("NO_SPEND_SCALE_MISMATCH", obs, false);
  if (!Number.isInteger(obs.minor) || obs.minor < 0) return done("NO_SPEND_NO_OBSERVATION", null, false);
  if (obs.minor === 0) return done("NO_SPEND_ZERO_USAGE", obs, false);

  const observedQ = E.quantity(alloc.unit, alloc.kind, obs.minor, obs.scale);
  const measurement = E.costMeasurement(observedQ, E.BASIS.OBSERVED, {
    provider: isNonEmptyString(outcome.provider) ? outcome.provider : null,
    provenance: observation.provenance,
  });

  // reserve(observed) → EXHAUSTED means observed exceeds the ceiling (overspend) — refuse, no spend.
  const rsv = cost.reserve(cb, spendId, measurement);
  if (!rsv.ok) {
    return Object.freeze({ present: true, valid: true, metered: true, executed: true, decision: rsv.decision === "EXHAUSTED" ? "EXHAUSTED" : "NO_SPEND_NO_OBSERVATION", observed: obs, spent: false, snapshot: rsv.snapshot, outcome, exhaustion: rsv.exhaustion || null, valuation });
  }
  cb = cost.commit(rsv.costBudget, spendId).costBudget;
  cb = cost.spend(cb, spendId, measurement).costBudget;
  return done("SPENT", obs, true);
}

module.exports = { LIVE_COST_METERING_CONTRACT, meterProviderCall, observationOf, deriveValuation };

// ---- Read-only CLI: prints the contract descriptor; mutates nothing. --------------------------
if (require.main === module) {
  process.stdout.write(JSON.stringify(LIVE_COST_METERING_CONTRACT, null, 2) + "\n");
}
