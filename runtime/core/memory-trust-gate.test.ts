#!/usr/bin/env node
"use strict";
const assert = require("assert");
const G = require("./memory-trust-gate");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 23/W7 — MEMORY TRUST GATE");
const ok = { id: "m1", provenance: "mission:M1", validUntil: 200, status: "ACTIVE", authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR", family: "capability" };
// fresh + attributed + trusted author ⇒ TRUSTED.
check(G.assessMemoryTrust(ok, { asOf: 100, trustedAuthors: ["ODG"] }).trusted === true, "fresh+attributed+trusted ⇒ TRUSTED");
// stale (asOf past validUntil) ⇒ STALE.
check(G.assessMemoryTrust(ok, { asOf: 300, trustedAuthors: ["ODG"] }).verdict === "STALE", "past validUntil ⇒ STALE");
// validUntil but no asOf ⇒ INSUFFICIENT_SIGNAL (cannot verify staleness).
check(G.assessMemoryTrust(ok, { trustedAuthors: ["ODG"] }).verdict === "INSUFFICIENT_SIGNAL", "validUntil + no asOf ⇒ INSUFFICIENT_SIGNAL");
// unresolved author ⇒ UNATTRIBUTED (poisoning vector).
check(G.assessMemoryTrust({ id: "m2", provenance: "x", authoredBy: "MYSTERY" }, { asOf: 1, trustedAuthors: ["ODG"] }).verdict === "UNATTRIBUTED", "unknown author ⇒ UNATTRIBUTED");
// trusted author resolves but not on allowlist ⇒ UNTRUSTED_AUTHOR.
check(G.assessMemoryTrust({ id: "m3", provenance: "x", authoredBy: "PROVIDER", family: "capability" }, { asOf: 1, trustedAuthors: ["ODG"] }).verdict === "UNTRUSTED_AUTHOR", "provider author not allowlisted ⇒ UNTRUSTED_AUTHOR");
// no trustedAuthors allowlist ⇒ INSUFFICIENT_SIGNAL (deny-by-default).
check(G.assessMemoryTrust(ok, { asOf: 100 }).verdict === "INSUFFICIENT_SIGNAL", "no allowlist ⇒ INSUFFICIENT_SIGNAL");
// invalidated ⇒ INVALIDATED.
check(G.assessMemoryTrust({ ...ok, status: "INVALIDATED" }, { asOf: 100, trustedAuthors: ["ODG"] }).verdict === "INVALIDATED", "status INVALIDATED ⇒ INVALIDATED");
// reuse-ledger suppressed (injected) ⇒ SUPPRESSED.
check(G.assessMemoryTrust(ok, { asOf: 100, trustedAuthors: ["ODG"], reuseHealth: { suppressed: true } }).verdict === "SUPPRESSED", "reuse-suppressed ⇒ SUPPRESSED");
check(G.MEMORY_TRUST_GATE_CONTRACT.invariants.some((i: any) => /never a silent pass/.test(i)), "contract: never a silent pass");
console.log(failures === 0 ? "ALL PASS — SÉRIE 23/W7 MEMORY TRUST GATE" : "FAILURES: " + failures);
process.exit(failures === 0 ? 0 : 1);
export {};
