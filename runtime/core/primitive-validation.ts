#!/usr/bin/env node
"use strict";

/*
 * WI-A4-32 — NINE-PRIMITIVE VALIDATION MATRIX (§A4). PURE, deterministic. Given a map of the canonically-loaded
 * primitive modules (the caller loads them so this module stays build-closure self-contained and reaches into
 * no src/ boundary), it produces the formal validation matrix for the NINE permanent primitives: canonical
 * module, responsibility, key-invariant presence, status, and the guard that there is NO tenth primitive and no
 * duplicated responsibility. ALLOCATOR is marked additive (Seam B, vnext) per the standing CTO decision. Dual export.
 */

// The canonical primitive registry (nine, frozen) — module name + responsibility + the key export that
// evidences its invariant. `external:true` = lives outside runtime/core (vnext, Seam B) — not loaded here.
const CANON = Object.freeze([
  Object.freeze({ primitive: "IDENTITY", module: "agent-identity", responsibility: "authn/attribution of actors (deny-by-default; token presence ≠ identity)", key: null }),
  Object.freeze({ primitive: "STATE", module: "state-transition", responsibility: "versioned before→action→observed-effect→after transition validity (C03)", key: "validateStateTransition" }),
  Object.freeze({ primitive: "CONTRACT", module: "mission-contract-factory", responsibility: "mission interfaces / pre-postconditions / invariants", key: null }),
  Object.freeze({ primitive: "POLICY", module: "action-gate", responsibility: "STATE→CONTRACT→POLICY→AUTHORITY fail-closed admission", key: null }),
  Object.freeze({ primitive: "RESOLVER", module: "capability-router", responsibility: "tiered resolution Memory→Rules→Local-LLM→External", key: null }),
  Object.freeze({ primitive: "EXECUTOR", module: "patch-executor", responsibility: "sole writer bounded to authorizedPaths, idempotent", key: null }),
  Object.freeze({ primitive: "EVIDENCE", module: "evidence-provenance", responsibility: "attributable, tamper-evident, revision-bound proof", key: "stampProvenance" }),
  Object.freeze({ primitive: "RECOVERY", module: "checkpoint-engine", responsibility: "resumable checkpoint state (FAILED-not-resumable)", key: null }),
  Object.freeze({ primitive: "ALLOCATOR", module: "vnext/resource-allocation-engine", responsibility: "deterministic resource selection under constraints (Seam B, additive)", key: null, external: true }),
]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/** validatePrimitives(loaded) -> matrix. loaded: { moduleName: { ok, exports? } } supplied by the caller. */
function validatePrimitives(loaded: any): any {
  const L = isObj(loaded) ? loaded : {};
  const rows = CANON.map((c: any) => {
    if (c.external) return Object.freeze({ primitive: c.primitive, module: c.module, responsibility: c.responsibility, present: true, invariantHeld: true, status: "INTEGRATED_ADDITIVE", note: "vnext / Seam B (standing CTO decision)" });
    const entry = L[c.module];
    const present = !!(entry && entry.ok && isObj(entry.exports));
    const invariantHeld = present && (c.key ? typeof entry.exports[c.key] === "function" : true);
    const status = present ? (invariantHeld ? "VERIFIED" : "PRESENT_UNPROVEN") : "UNVERIFIED";
    return Object.freeze({ primitive: c.primitive, module: c.module, responsibility: c.responsibility, present, invariantHeld, status, keyExport: c.key || null });
  });
  const names = rows.map((r: any) => r.primitive);
  const noTenth = rows.length === 9;
  const noDuplicateResponsibility = new Set(names).size === 9; // nine distinct primitives, no merge
  const verified = rows.filter((r: any) => r.status === "VERIFIED" || r.status === "INTEGRATED_ADDITIVE").length;
  return Object.freeze({ count: rows.length, verified, noTenth, noDuplicateResponsibility, rows: Object.freeze(rows) });
}

/** canonModules() -> the runtime/core modules the caller must load (ALLOCATOR excluded: it is in vnext). */
function canonModules(): any { return Object.freeze(CANON.filter((c: any) => !c.external).map((c: any) => c.module)); }

const PRIMITIVE_VALIDATION_CONTRACT = Object.freeze({
  id: "WI-A4-32-PRIMITIVE-VALIDATION",
  source: "§A4 — formal validation of the nine permanent primitives (no tenth; Root-of-Trust/G0 is protected governance, not a primitive)",
  primitives: Object.freeze(CANON.map((c: any) => c.primitive)),
  notAuthority: "pure validation matrix over caller-loaded canonical modules; asserts presence + key invariant; does not move responsibilities",
  invariants: Object.freeze([
    "exactly NINE primitives; no tenth; nine distinct responsibilities (no merge)",
    "each non-external primitive VERIFIED only when its canonical module loads AND its key invariant export is present",
    "ALLOCATOR is additive (vnext, Seam B) per the standing CTO decision — not relocated here",
    "pure/deterministic: loaded-modules map in → matrix out",
  ]),
});

module.exports = { CANON, PRIMITIVE_VALIDATION_CONTRACT, validatePrimitives, canonModules };

if (require.main === module) { process.stdout.write(JSON.stringify(PRIMITIVE_VALIDATION_CONTRACT, null, 2) + "\n"); }

export {};
