#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 23 / WAVE-8 (P12 — world-research gap) — IDEMPOTENCY-KEY COLLISION DETECTION. PURE, deterministic. World
 * reference: IETF httpapi draft "The Idempotency-Key HTTP Header Field" — a key presented with a request whose
 * fingerprint DIFFERS from the one first stored under that key MUST be rejected (HTTP 422), never replayed to the
 * prior response; 2026 payment-API guidance corroborates. ODG's two idempotency surfaces (idempotency-guard.admit,
 * event-stream-engine.publish) both dedup on the KEY STRING only and store no request fingerprint, so a reused key
 * with a different payload is silently reconciled to the ORIGINAL request's result (grep-verified absent: no
 * idempotency collision/fingerprint/mismatch check). This composes state-transition.canonicalize (the repo's
 * deterministic key-order-independent serializer — no new hashing primitive) + the idempotency-guard DUPLICATE
 * semantics: a repeated key whose canonical fingerprint matches ⇒ safe DUPLICATE; a mismatch ⇒ COLLISION (reject).
 * Fail-closed. Dual export.
 */

const ST = require("./state-transition");              // canonicalize — deterministic request fingerprint

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.length > 0; }

const DECISION = Object.freeze(["PROCEED", "DUPLICATE", "COLLISION"]);

/** fingerprintOf(request) -> canonical, key-order-independent string fingerprint. */
function fingerprintOf(request: any): string { return ST.canonicalize(request === undefined ? null : request); }

/**
 * guardIdempotent({ key, request, journal }) -> { decision, fingerprint, storedFingerprint, result?, reason }.
 *   journal: { [key]: { fingerprint, result } } (the fingerprint-aware ledger this module maintains).
 *   decision: PROCEED (new key) | DUPLICATE (same key + MATCHING fingerprint ⇒ safe replay, returns stored result)
 *             | COLLISION (same key + DIFFERENT/absent fingerprint ⇒ reject, never replay — fail-closed).
 */
function guardIdempotent(input: any): any {
  const o = isObj(input) ? input : {};
  const key = o.key;
  const journal = isObj(o.journal) ? o.journal : {};
  const fingerprint = fingerprintOf(o.request);
  if (!isStr(key)) return frozen("COLLISION", fingerprint, null, undefined, "missing/invalid idempotency key (fail-closed)");

  if (!Object.prototype.hasOwnProperty.call(journal, key)) return frozen("PROCEED", fingerprint, null, undefined, "new idempotency key");
  const entry = journal[key];
  const stored = isObj(entry) && isStr(entry.fingerprint) ? entry.fingerprint : null;
  if (stored === null) return frozen("COLLISION", fingerprint, null, undefined, "stored entry has no recorded fingerprint — cannot prove a safe replay (fail-closed)");
  if (stored === fingerprint) return frozen("DUPLICATE", fingerprint, stored, isObj(entry) ? entry.result : undefined, "same key + matching fingerprint ⇒ safe replay of the prior result");
  return frozen("COLLISION", fingerprint, stored, undefined, "same idempotency key reused for a DIFFERENT request fingerprint ⇒ COLLISION (reject, never replay)");
}

/** recordIdempotent(journal, key, request, result) -> new frozen journal; never overwrites an existing key (final). */
function recordIdempotent(journal: any, key: any, request: any, result: any): any {
  const j = isObj(journal) ? journal : {};
  if (!isStr(key)) return Object.freeze({ ...j });
  if (Object.prototype.hasOwnProperty.call(j, key)) return Object.freeze({ ...j });   // never overwrite (mirrors idempotency-guard.record)
  const next: any = { ...j };
  next[key] = Object.freeze({ fingerprint: fingerprintOf(request), result });
  return Object.freeze(next);
}

function frozen(decision: string, fingerprint: string, storedFingerprint: any, result: any, reason: string): any {
  return Object.freeze({ decision, fingerprint, storedFingerprint, result, reason });
}

const IDEMPOTENCY_COLLISION_CONTRACT = Object.freeze({
  id: "V124-P12-IDEMPOTENCY-KEY-COLLISION",
  source: "SÉRIE 23/W8 P12 — idempotency-key collision (IETF httpapi Idempotency-Key draft; 2026 payment-API guidance)",
  decisions: DECISION,
  reuses: Object.freeze(["state-transition.canonicalize (deterministic request fingerprint)", "idempotency-guard DUPLICATE/record semantics (never overwrite)"]),
  notAuthority: "a pure fingerprint-aware idempotency decision; it executes nothing and stores no side effects",
  invariants: Object.freeze([
    "a repeated key whose canonical request fingerprint MATCHES the stored one ⇒ DUPLICATE (safe replay of the prior result)",
    "a repeated key reused for a DIFFERENT request fingerprint ⇒ COLLISION (rejected, NEVER silently replayed to the prior result)",
    "a missing key, or a stored entry with no recorded fingerprint ⇒ COLLISION (fail-closed, never an optimistic replay)",
    "recordIdempotent never overwrites an existing key (an applied action is final — mirrors idempotency-guard.record)",
    "pure/deterministic: canonicalize is key-order-independent; no clock, no random, no network",
  ]),
});

module.exports = { fingerprintOf, guardIdempotent, recordIdempotent, IDEMPOTENCY_COLLISION_CONTRACT };

if (require.main === module) {
  let j = recordIdempotent({}, "k1", { op: "charge", amount: 100 }, { ok: true });
  const dup = guardIdempotent({ key: "k1", request: { amount: 100, op: "charge" }, journal: j });   // reordered keys ⇒ same fingerprint
  const col = guardIdempotent({ key: "k1", request: { op: "charge", amount: 999 }, journal: j });
  process.stdout.write(JSON.stringify({ ...IDEMPOTENCY_COLLISION_CONTRACT, demo: { duplicate: dup.decision, collision: col.decision } }, null, 2) + "\n");
}

export {};
