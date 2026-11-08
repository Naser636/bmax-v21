#!/usr/bin/env node
"use strict";
const assert = require("assert");
const C = require("./verified-result-cache");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V5-E / VERIFIED RESULT CACHE");
const identity = { inputs: "suite:a", code: "sha:abc", deps: "lock:1", config: "tsconfig:1", env: "node22" };
let c = C.store({}, identity, { pass: true }, { provenance: "run:42", storedAt: 1000 });
// full-identity match + fresh + provenance ⇒ HIT.
{
  const r = C.lookup(c, identity, { asOf: 1500, maxAgeMs: 1000 });
  check(r.status === "HIT" && r.result.pass === true, "full-identity match + fresh ⇒ HIT");
}
// any identity change ⇒ MISS (must re-run).
for (const field of C.IDENTITY_FIELDS) {
  const changed = { ...identity, [field]: "CHANGED" };
  check(C.lookup(c, changed, { asOf: 1500, maxAgeMs: 1000 }).status === "MISS", `changed ${field} ⇒ MISS (re-run)`);
}
// stale entry ⇒ MISS.
check(C.lookup(c, identity, { asOf: 5000, maxAgeMs: 1000 }).status === "MISS", "stale (age > maxAge) ⇒ MISS");
// future-dated ⇒ MISS (fail-closed).
check(C.lookup(c, identity, { asOf: 500, maxAgeMs: 1000 }).status === "MISS", "future-dated entry ⇒ MISS");
// missing identity component ⇒ UNCACHEABLE.
check(C.lookup(c, { inputs: "a", code: "b" }, { asOf: 1500, maxAgeMs: 1000 }).status === "UNCACHEABLE", "incomplete identity ⇒ UNCACHEABLE (fail-closed)");
check(C.identityDigest({ inputs: "a" }) === null, "incomplete identity ⇒ null digest");
// freshness requested but unverifiable ⇒ MISS.
check(C.lookup(c, identity, { maxAgeMs: 1000 }).status === "MISS", "freshness requested but no asOf ⇒ MISS (fail-closed)");
// store refuses without provenance.
{
  const c2 = C.store({}, identity, { pass: true }, { storedAt: 1 });
  check(Object.keys(c2).length === 0, "store without provenance ⇒ not stored");
}
// different identities ⇒ different keys (no collision).
check(C.identityDigest(identity) !== C.identityDigest({ ...identity, env: "node20" }), "env change ⇒ different key");
check(C.VERIFIED_RESULT_CACHE_CONTRACT.invariants.some((i: any) => /any change ⇒ different key ⇒ MISS/i.test(i)), "contract: any change ⇒ MISS");
console.log(failures === 0 ? "ALL PASS — V5-E VERIFIED RESULT CACHE" : "FAILURES: " + failures);
process.exit(failures === 0 ? 0 : 1);
export {};
