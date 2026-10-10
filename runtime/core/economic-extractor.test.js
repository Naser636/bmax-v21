#!/usr/bin/env node

/* Governed Economic Extractor (D4) — deterministic extraction test. Proves OBSERVED vs UNKNOWN,
 * exact decimal->minor (no float, no rounding), json-pointer + regex rules, and fail-closed on a
 * malformed rule. No network. */

"use strict";

const assert = require("assert");
const { extract, decimalToMinor } = require("./economic-extractor");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

console.log("Economic Extractor (D4)");

// JSON pointer, with unit -> exact OBSERVED Quantity.
{
  const body = JSON.stringify({ data: { amount: "64250.37", currency: "USD" } });
  const r = extract(body, { type: "json", pointer: "/data/amount", unit: "USD", kind: "COST_UNIT", scale: 2 });
  ok("json pointer OBSERVED with exact quantity", r.status === "OBSERVED" && r.basis === "OBSERVED" && r.raw === "64250.37" && r.quantity.minor === 6425037 && r.quantity.scale === 2 && r.quantity.unit === "USD");
}

// JSON pointer missing -> UNKNOWN (not fabricated).
{
  const r = extract(JSON.stringify({ data: {} }), { type: "json", pointer: "/data/amount", unit: "USD", scale: 2 });
  ok("missing json field ⇒ UNKNOWN (no value)", r.status === "UNKNOWN" && !("quantity" in r));
}

// Body not JSON -> UNKNOWN.
{
  const r = extract("<html>not json</html>", { type: "json", pointer: "/data/amount" });
  ok("non-JSON body ⇒ UNKNOWN", r.status === "UNKNOWN" && /not valid JSON/.test(r.reason));
}

// Regex extraction, raw string only (no unit) -> OBSERVED raw.
{
  const r = extract("Price: 19.99 EUR in stock", { type: "regex", pattern: "Price:\\s*([0-9.]+)", group: 1 });
  ok("regex OBSERVED raw (no unit ⇒ no quantity)", r.status === "OBSERVED" && r.raw === "19.99" && !("quantity" in r));
}

// Regex no match -> UNKNOWN.
{
  const r = extract("nothing here", { type: "regex", pattern: "Price:\\s*([0-9.]+)", group: 1 });
  ok("regex no-match ⇒ UNKNOWN", r.status === "UNKNOWN");
}

// Precision guard: raw more precise than declared scale ⇒ UNKNOWN (never silently rounded).
{
  const r = extract(JSON.stringify({ p: "1.239" }), { type: "json", pointer: "/p", unit: "USD", scale: 2 });
  ok("value more precise than scale ⇒ UNKNOWN (no rounding)", r.status === "UNKNOWN" && /precision|representable/.test(r.reason));
}

// decimalToMinor exactness.
{
  ok("decimalToMinor exact (123.45,2)=12345", decimalToMinor("123.45", 2).minor === 12345);
  ok("decimalToMinor integer (100,2)=10000", decimalToMinor("100", 2).minor === 10000);
  ok("decimalToMinor refuses over-precision (1.239,2)=null", decimalToMinor("1.239", 2) === null);
  ok("decimalToMinor refuses non-numeric", decimalToMinor("12x", 2) === null);
}

// Malformed rule ⇒ throws (fail-closed on bad input).
{
  let threw = 0;
  for (const bad of [null, {}, { type: "json" }, { type: "regex" }, { type: "xml", pointer: "/a" }]) { try { extract("{}", bad); } catch { threw += 1; } }
  ok("malformed rules all fail closed (throw)", threw === 5);
}

console.log(`\nEconomic Extractor — ${passed} assertions passed.`);
