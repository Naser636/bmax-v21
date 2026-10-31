#!/usr/bin/env node
/*
 * Governed Economic Extractor (D4) — TypeScript port; parity with runtime/core/economic-extractor.js.
 *
 * Turns ACQUIRED bytes (a string `body` passed in by the caller) into an OBSERVED economic value by a
 * DECLARED DETERMINISTIC rule only — no heuristic, no AI, no interpretation, no I/O. Pure/deterministic.
 * Strict port: the public exports (extract, jsonPointer, decimalToMinor), the RFC6901-ish pointer (with
 * ~0/~1 unescaping), the exact decimal→minor conversion (refuses excess precision / unsafe integers — no
 * fabricated or dropped precision), the json/regex rule handling, the fail-closed throws on malformed
 * rules and the OBSERVED/UNKNOWN outcomes are preserved EXACTLY. Depends on ./economic-unit (already TS,
 * co-located in dist). The historical .js remains the behavioural reference.
 */

"use strict";

const eu = require("./economic-unit");

function jsonPointer(obj: any, pointer: any): any {
  if (pointer === "" || pointer === "/") return obj;
  if (typeof pointer !== "string" || pointer[0] !== "/") throw new Error("economic-extractor: json pointer must start with '/'");
  const parts = pointer.slice(1).split("/").map((p: any) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let cur = obj;
  for (const key of parts) {
    if (cur === null || typeof cur !== "object" || !Object.prototype.hasOwnProperty.call(cur, key)) return undefined;
    cur = cur[key];
  }
  return cur;
}

// Largest decimal scale we will honour. Crypto wei is 18 decimals; 100 is far beyond any real currency/asset. This
// bounds the `"0".repeat(scale)` padding allocation below: `scale` originates from a (trusted) extraction rule, but
// a pathological/typo value (e.g. 1e9) would otherwise allocate a multi-hundred-MB string (CPU/mem DoS) before any
// safe-integer check could reject it. An out-of-range scale is REFUSED (null ⇒ UNKNOWN upstream), never coerced.
const MAX_SCALE = 100;

// Exact decimal string -> { minor, scale } at the declared scale; null if not a clean decimal or if it
// needs more precision than `scale` (so we never fabricate or drop precision).
function decimalToMinor(raw: any, scale: any): any {
  if (!Number.isInteger(scale) || scale < 0 || scale > MAX_SCALE) return null; // absurd/invalid scale ⇒ refuse (no OOM)
  const s = String(raw).trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const neg = s[0] === "-";
  const [intPart, fracPart = ""] = s.replace(/^-/, "").split(".");
  if (fracPart.length > scale) return null; // more precision than declared ⇒ refuse (UNKNOWN upstream)
  const fracPadded = (fracPart + "0".repeat(scale)).slice(0, scale);
  const minor = Number(intPart + fracPadded);
  if (!Number.isSafeInteger(minor)) return null;
  return { minor: neg ? -minor : minor, scale };
}

function buildQuantity(raw: any, rule: any): any {
  if (!("unit" in rule)) return undefined; // no unit declared ⇒ keep the raw observation only
  const scale = Number.isInteger(rule.scale) ? rule.scale : 0;
  const kind = rule.kind === eu.KIND.ASSET ? eu.KIND.ASSET : eu.KIND.COST_UNIT;
  const dm = decimalToMinor(raw, scale);
  if (dm === null) return null; // numeric expected but raw is not exactly representable ⇒ caller ⇒ UNKNOWN
  return eu.quantity(String(rule.unit), kind, dm.minor, dm.scale);
}

function extract(body: any, rule: any): any {
  if (rule === null || typeof rule !== "object" || Array.isArray(rule)) throw new Error("economic-extractor: rule must be an object");
  const text = typeof body === "string" ? body : "";

  let raw;
  if (rule.type === "json") {
    if (typeof rule.pointer !== "string") throw new Error("economic-extractor: json rule needs a string 'pointer'");
    let parsed;
    try { parsed = JSON.parse(text); } catch { return { status: "UNKNOWN", reason: "body is not valid JSON" }; }
    const v = jsonPointer(parsed, rule.pointer);
    if (v === undefined || v === null || typeof v === "object") return { status: "UNKNOWN", reason: "json pointer did not resolve to a scalar" };
    raw = typeof v === "string" ? v : String(v);
  } else if (rule.type === "regex") {
    if (typeof rule.pattern !== "string") throw new Error("economic-extractor: regex rule needs a string 'pattern'");
    let re; try { re = new RegExp(rule.pattern, rule.flags && typeof rule.flags === "string" ? rule.flags : ""); } catch (e: any) { throw new Error("economic-extractor: invalid regex: " + e.message); }
    const m = re.exec(text);
    if (!m) return { status: "UNKNOWN", reason: "regex did not match" };
    const group = Number.isInteger(rule.group) ? rule.group : (m.length > 1 ? 1 : 0);
    if (group < 0 || group >= m.length || m[group] === undefined) return { status: "UNKNOWN", reason: "regex group absent" };
    raw = m[group];
  } else {
    throw new Error("economic-extractor: rule.type must be 'json' or 'regex'");
  }

  const q = buildQuantity(raw, rule);
  if (q === null) return { status: "UNKNOWN", reason: "value not exactly representable at the declared unit/scale (no rounding)" };
  const out: any = { status: "OBSERVED", basis: eu.BASIS.OBSERVED, raw };
  if (q !== undefined) out.quantity = q;
  return out;
}

module.exports = { extract, jsonPointer, decimalToMinor };

// Module-scope marker (adds NO export): forces TypeScript MODULE scope so internal names (buildQuantity)
// are module-scoped, not global script scope (prevents cross-lot TS2393). The CommonJS API is unchanged.
export {};
