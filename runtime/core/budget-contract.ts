#!/usr/bin/env node
"use strict";

/*
 * V5 BUDGET CONTRACT SOURCE (Stage 3, increment B) — TypeScript port; parity with
 * runtime/core/budget-contract.js.
 *
 * Defines + validates the MINIMAL canonical budget block a mission may declare, so the long-standing "no
 * mission declares a usable budget" gap is closed WITHOUT inventing a default. The block decomposes a budget
 * into bucket allocations (FICHE_03 §185: mission / capability / provider / token / compute / verification /
 * human-attention / reserve), each an exact amount in a DECLARED economic unit (economic-unit.js vocabulary —
 * no hardcoded currency list).
 *
 * Three states are kept DISTINCT and must never be conflated by a caller:
 *   BUDGET ABSENT  — the contract declares no `budget` ⇒ this module returns { present:false }. It does
 *                    NOT fabricate 0, ∞, or any amount; execution behaviour for an absent budget is a
 *                    SEPARATE decision (not made here — this module is the SOURCE, not the enforcer).
 *   BUDGET DECLARED — a well-formed block ⇒ { present:true, ok:true, budget:<normalized> }.
 *   BUDGET MALFORMED — a present-but-invalid block ⇒ { present:true, ok:false, errors:[...] } (never
 *                    silently coerced into a default).
 *
 * Strict TS port: the public exports (BUDGET_CONTRACT, BUCKETS, resolveBudget), signatures, return shapes,
 * the frozen descriptor, the ABSENT/DECLARED/MALFORMED distinction, error-message text + order, the deep
 * Object.freeze discipline and purity are preserved EXACTLY. The historical .js remains the behavioural
 * reference.
 *
 * Pure/deterministic. Transport only: it validates/normalizes; it does not reserve, spend, meter or
 * enforce (that is cost-accounting.js / budget-ledger.js, and live metering is a later increment).
 */

const E = require("./economic-unit");

const BUDGET_CONTRACT = Object.freeze({
  id: "V5-BUDGET-CONTRACT-SOURCE",
  source: "FICHE_03 §185 (Budget Allocator); economic-unit vocabulary",
  buckets: Object.freeze(["mission", "capability", "provider", "token", "compute", "verification", "human-attention", "reserve"]),
  states: Object.freeze(["ABSENT", "DECLARED", "MALFORMED"]),
  rules: Object.freeze([
    "budget absent ⇒ { present:false } — NO fabricated default (0/∞/amount)",
    "each allocation: bucket, unit (declared economic unit), kind (COST_UNIT|ASSET), amount (integer minor ≥ 0), scale (non-neg int)",
    "bucket ∈ the FICHE_03 §185 decomposition; unit is opaque/extensible (no hardcoded currency check)",
    "transport/validate only — no reserve/spend/meter/enforce; execution behaviour of an absent budget is a separate decision",
    "deterministic / pure",
  ]),
});
const BUCKETS: string[] = BUDGET_CONTRACT.buckets as unknown as string[];

function isPlainObject(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isNonEmptyString(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function isNonNegInt(v: any): boolean { return typeof v === "number" && Number.isInteger(v) && v >= 0; }

/**
 * resolveBudget(spec) -> { present, ok?, budget?, errors? }
 *   spec: the parsed mission contract (or any object that may carry `budget`).
 * ABSENT when spec has no `budget`. Present ⇒ validated: `budget.allocations` must be a non-empty array
 * of well-formed allocations. Returns a frozen normalized budget on success (deterministic order).
 */
function resolveBudget(spec: any): any {
  const raw = isPlainObject(spec) ? spec.budget : undefined;
  if (raw === undefined || raw === null) return Object.freeze({ present: false });
  if (!isPlainObject(raw)) return Object.freeze({ present: true, ok: false, errors: Object.freeze(["budget: must be an object"]) });

  const errors: string[] = [];
  const rawAllocs = Array.isArray(raw.allocations) ? raw.allocations : null;
  if (!rawAllocs || rawAllocs.length === 0) errors.push("budget.allocations: non-empty array required");

  const allocations: any[] = [];
  (rawAllocs || []).forEach((a: any, i: number) => {
    if (!isPlainObject(a)) { errors.push(`budget.allocations[${i}]: must be an object`); return; }
    if (!BUCKETS.includes(a.bucket)) errors.push(`budget.allocations[${i}].bucket ∈ ${BUCKETS.join(",")}`);
    if (!isNonEmptyString(a.unit)) errors.push(`budget.allocations[${i}].unit: required`);
    if (a.kind !== E.KIND.COST_UNIT && a.kind !== E.KIND.ASSET) errors.push(`budget.allocations[${i}].kind ∈ COST_UNIT|ASSET`);
    if (!isNonNegInt(a.amount)) errors.push(`budget.allocations[${i}].amount: non-negative integer minor units required`);
    const scale = a.scale === undefined ? 0 : a.scale;
    if (!isNonNegInt(scale)) errors.push(`budget.allocations[${i}].scale: non-negative integer`);
    if (BUCKETS.includes(a.bucket) && isNonEmptyString(a.unit) && (a.kind === E.KIND.COST_UNIT || a.kind === E.KIND.ASSET) && isNonNegInt(a.amount) && isNonNegInt(scale)) {
      allocations.push(Object.freeze({ bucket: a.bucket, unit: a.unit, kind: a.kind, amount: a.amount, scale }));
    }
  });

  if (errors.length) return Object.freeze({ present: true, ok: false, errors: Object.freeze(errors) });
  return Object.freeze({ present: true, ok: true, budget: Object.freeze({ allocations: Object.freeze(allocations) }) });
}

module.exports = { BUDGET_CONTRACT, BUCKETS, resolveBudget };

if (require.main === module) {
  process.stdout.write(JSON.stringify(BUDGET_CONTRACT, null, 2) + "\n");
}

// Module-scope marker (adds NO export): forces TypeScript MODULE scope so this file's internal helpers
// (isPlainObject / isNonEmptyString / isNonNegInt) are MODULE-scoped rather than polluting the global
// script scope and colliding with same-named helpers in sibling lots compiled into the same tsconfig
// program (TS2393). The CommonJS API above (module.exports = { … }) is unchanged, as is parity with the .js.
export {};
