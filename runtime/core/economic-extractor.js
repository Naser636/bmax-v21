#!/usr/bin/env node

/*
 * Governed Economic Extractor (D4) — turns ACQUIRED bytes into an OBSERVED economic value, by a
 * DECLARED DETERMINISTIC rule only. No heuristic, no AI, no interpretation: the caller declares exactly
 * where the figure lives (a JSON pointer or a regex) and the unit. If the rule does not match, the
 * result is UNKNOWN (never a fabricated value). It reuses economic-unit.js for the Quantity (exact
 * integer minor/10^scale — never a float) and basis OBSERVED. It is NOT a second economic system.
 *
 * extract(body, rule) -> { status:"OBSERVED", basis:"OBSERVED", raw, quantity? } | { status:"UNKNOWN", reason }
 *   rule.type = "json"  : rule.pointer = RFC6901-ish "/data/amount" into JSON.parse(body)
 *   rule.type = "regex" : rule.pattern (string) [+ rule.group=1] matched against the raw text body
 *   optional rule.unit + rule.kind (COST_UNIT|ASSET) + rule.scale : build an exact OBSERVED Quantity
 *     from a numeric raw; a raw with MORE fractional digits than the declared scale ⇒ UNKNOWN (never
 *     silently rounded — no fabricated precision).
 * A MALFORMED rule throws (fail-closed on bad input). A no-match is UNKNOWN, not an error.
 */

"use strict";

const eu = require("./economic-unit");

function jsonPointer(obj, pointer) {
  if (pointer === "" || pointer === "/") return obj;
  if (typeof pointer !== "string" || pointer[0] !== "/") throw new Error("economic-extractor: json pointer must start with '/'");
  const parts = pointer.slice(1).split("/").map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let cur = obj;
  for (const key of parts) {
    if (cur === null || typeof cur !== "object" || !Object.prototype.hasOwnProperty.call(cur, key)) return undefined;
    cur = cur[key];
  }
  return cur;
}

// Exact decimal string -> { minor, scale } at the declared scale; null if not a clean decimal or if it
// needs more precision than `scale` (so we never fabricate or drop precision).
function decimalToMinor(raw, scale) {
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

function buildQuantity(raw, rule) {
  if (!("unit" in rule)) return undefined; // no unit declared ⇒ keep the raw observation only
  const scale = Number.isInteger(rule.scale) ? rule.scale : 0;
  const kind = rule.kind === eu.KIND.ASSET ? eu.KIND.ASSET : eu.KIND.COST_UNIT;
  const dm = decimalToMinor(raw, scale);
  if (dm === null) return null; // numeric expected but raw is not exactly representable ⇒ caller ⇒ UNKNOWN
  return eu.quantity(String(rule.unit), kind, dm.minor, dm.scale);
}

function extract(body, rule) {
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
    let re; try { re = new RegExp(rule.pattern, rule.flags && typeof rule.flags === "string" ? rule.flags : ""); } catch (e) { throw new Error("economic-extractor: invalid regex: " + e.message); }
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
  const out = { status: "OBSERVED", basis: eu.BASIS.OBSERVED, raw };
  if (q !== undefined) out.quantity = q;
  return out;
}

module.exports = { extract, jsonPointer, decimalToMinor };
