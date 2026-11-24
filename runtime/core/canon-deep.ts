#!/usr/bin/env node
"use strict";
/*
 * canon-deep — ONE shared DEEP canonical-JSON serializer for hash/signature-bearing material (V17.5 security fix).
 *
 * WHY: the historical idiom `JSON.stringify(o, Object.keys(o).sort())` passes an ARRAY REPLACER, and JSON.stringify
 * applies an array replacer as a key ALLOW-LIST AT EVERY DEPTH — so any nested object key that is not also a top-level
 * key is silently DROPPED from the serialized output. Used as hash/signature material (audit-log entry hashes,
 * agent-identity challenge signatures) that left nested fields UNCOVERED: they could be altered without detection.
 *
 * canonDeep(v) = keys sorted at EVERY depth, arrays kept in order, nothing dropped except what JSON itself drops
 * (undefined / function / symbol object members). Primitives serialize exactly as JSON.stringify does (NaN/±Infinity ⇒
 * null, toJSON honoured, e.g. Date ⇒ ISO string). Top-level or array-element undefined/function/symbol ⇒ "null" (JSON
 * array semantics). FAIL-CLOSED: a cyclic structure or a BigInt THROWS (as JSON.stringify does) — never a partial digest.
 * Pure, deterministic, no I/O.
 *
 * NOTE: a concurrent proposal (PR #972) plans a natively-generated runtime/core/odg-canonical-json.ts; once accepted it
 * may replace this module (same contract: sorted keys at every depth, nothing silently dropped). Until then this is the
 * single shared helper — do NOT add another private copy.
 */

function canonDeep(v: any): string { return ser(v, [], false); }

function ser(v: any, stack: any[], jsonApplied: boolean): string {
  if (!jsonApplied && v !== null && (typeof v === "object" || typeof v === "function") && typeof v.toJSON === "function") v = v.toJSON();
  if (v === undefined || typeof v === "function" || typeof v === "symbol") return "null";
  if (typeof v === "bigint") throw new TypeError("canonDeep: BigInt is not JSON-serializable");
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (stack.includes(v)) throw new TypeError("canonDeep: cyclic structure");
  stack.push(v);
  try {
    if (Array.isArray(v)) return "[" + v.map((x) => ser(x, stack, false)).join(",") + "]";
    const parts: string[] = [];
    for (const k of Object.keys(v).sort()) {
      let x = v[k];
      if (x !== null && (typeof x === "object" || typeof x === "function") && typeof x.toJSON === "function") x = x.toJSON(k);
      if (x === undefined || typeof x === "function" || typeof x === "symbol") continue; // JSON object semantics
      parts.push(JSON.stringify(k) + ":" + ser(x, stack, true));
    }
    return "{" + parts.join(",") + "}";
  } finally { stack.pop(); }
}

/* LEGACY (shallow) canon — the historical, DEFECTIVE serializer, kept ONLY to verify material sealed before the fix.
 * Never use it to seal/sign new material. */
function canonLegacyShallow(o: any): string { return JSON.stringify(o, o && typeof o === "object" && !Array.isArray(o) ? Object.keys(o).sort() : undefined); }

module.exports = { canonDeep, canonLegacyShallow };
export {};
