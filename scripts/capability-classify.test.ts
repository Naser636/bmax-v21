#!/usr/bin/env node
// @ts-nocheck — L5/L6 bulk test migration: runtime-compat under tsx proven; this suppresses
// tsc typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.
"use strict";
/* CM-4 capability-count integrity tests — pure classifier, counter-coherence, anti-dup, read-only. */
const assert = require("assert");
const { classify, classOf, readRegistryNames } = require("./capability-classify.js");
const path = require("path");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed++; }

// 1 — classification buckets by prefix.
{
  const c = classify(["NL_ANALYZE_X", "IMPLEMENT_FOO", "FIX_BAR", "AUDIT_BAZ", "client_intake", "quote_engine"]);
  ok("NL_* ⇒ nlGenerated", c.nlGenerated === 1);
  ok("verb-prefixed ⇒ missionDerived", c.missionDerived === 3);
  ok("remainder ⇒ businessCandidate", c.businessCandidate === 2);
}
// 2 — counter-coherence: total === sum of classes.
{
  const c = classify(["NL_A", "IMPLEMENT_B", "thing"]);
  ok("total === business+mission+nl", c.total === c.businessCandidate + c.missionDerived + c.nlGenerated);
  ok("coherent true when no dups", c.coherent === true);
}
// 3 — anti-duplicate detection breaks coherence.
{
  const c = classify(["thing", "thing", "IMPLEMENT_X"]);
  ok("duplicate detected", c.duplicates.includes("thing"));
  ok("coherent false on duplicate", c.coherent === false);
}
// 4 — empty / malformed input is safe.
{
  ok("empty ⇒ zeros, coherent", classify([]).total === 0 && classify([]).coherent === true);
  ok("non-array ⇒ zeros", classify(null).total === 0);
}
// 5 — classOf exact behaviour.
{
  ok("classOf NL_", classOf("NL_UNKNOWN_1") === "nlGenerated");
  ok("classOf verb", classOf("ROADMAP_PHASE_1") === "missionDerived");
  ok("classOf business", classOf("payments") === "businessCandidate");
}
// 6 — LIVE registry decomposes coherently (read-only; total matches the reported count).
{
  const names = readRegistryNames(path.resolve(__dirname, ".."));
  if (names) {
    const c = classify(names);
    ok("live registry: coherent (total === sum, no dups)", c.coherent === true);
    ok("live registry: businessCandidate < total (missions are the bulk)", c.businessCandidate < c.total);
    console.log(`  (live: total=${c.total} business=${c.businessCandidate} mission=${c.missionDerived} nl=${c.nlGenerated})`);
  } else {
    console.log("  skip - live registry not present (unbuilt state)");
  }
}

console.log(`\ncapability-classify (CM-4) — ${passed} assertions passed.`);
