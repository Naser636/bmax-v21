#!/usr/bin/env node
// @ts-nocheck — Probe-registry CONTRACT meta-invariant (CTO §2 probe-coverage).
/*
 * Governed meta-invariant: EVERY registered probe must honour the shared runProbe contract. This is a
 * RELIABLE, runtime-executed check — deliberately NOT a static test-marker scan, which produces false
 * negatives for this registry's varied assertion styles, structural (repo-state) probes, evaluate() paths
 * and dual-port equivalence coverage, and could be gamed by a superficial "probe name appears in a test"
 * marker. Running the actual probes cannot be gamed and cannot false-positive.
 *
 * PROVES (universal, all registered probes):
 *   1. runProbe(name, {}) NEVER throws and returns a well-formed verdict {ok:boolean, detail?:string}.
 *   2. Every REGISTERED name resolves to a real probe (never the UNKNOWN_PROBE deny-by-default path).
 *   3. An UNREGISTERED name is denied: {ok:false, code:"UNKNOWN_PROBE"} (negative boundary; the
 *      proof/evidence distinction itself is locked by probe-distinction.test.ts).
 *
 * DOES NOT PROVE (and must not pretend to): that each probe has BOTH a pass-path and a fail-path UNIT
 * assertion. That per-probe behavioral coverage lives in capability-probes.test.ts, the dedicated
 * capability tests (observability-verification, git-branch-integration, provider-activation-run,
 * probe-registry-closure, …) and the dual-port runtime/__bench__/capability-probes-equivalence.e2e suite.
 * A static scan for that is unreliable (false failures), so it is intentionally NOT mechanised here.
 *
 * TRIPWIRE: a future probe that crashes, returns a non-boolean ok, or is added to the registry without a
 * runnable path FAILS here. A self-check demonstrates the predicate detects a malformed probe (so the
 * invariant has real discriminating power — not a vacuous auto-pass).
 */
"use strict";
const assert = require("assert");
const path = require("path");

let passed = 0;
const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); passed += 1; };

const mod = require(path.join(process.cwd(), "runtime", "core", "capability-probes.js"));
const { PROBES, runProbe } = mod;

console.log("PROBE-REGISTRY CONTRACT META-INVARIANT (§2)");

// Shared predicate — used for BOTH the live registry check and the self-check (discriminating power).
const wellFormed = (r) => r != null && typeof r.ok === "boolean" && (r.detail === undefined || typeof r.detail === "string");

const names = Object.keys(PROBES);
ok("registry is a non-empty object", typeof PROBES === "object" && names.length > 0);

for (const n of names) {
  let r = null, threw = null;
  try { r = runProbe(n, {}); } catch (e) { threw = e; }
  ok(`probe "${n}": runProbe never throws`, threw === null);
  ok(`probe "${n}": returns a well-formed {ok:boolean, detail?} verdict`, wellFormed(r));
  ok(`probe "${n}": registered name resolves (not UNKNOWN_PROBE)`, !(r && r.code === "UNKNOWN_PROBE"));
}

// Negative boundary: an UNREGISTERED name is denied by default (distinct from a registered fail).
const unknown = runProbe("__definitely_not_a_registered_probe__", {});
ok("unregistered probe ⇒ {ok:false, code:UNKNOWN_PROBE} (deny-by-default)", unknown.ok === false && unknown.code === "UNKNOWN_PROBE");

// Self-check (discriminating power): the SAME predicate rejects malformed verdicts — so a crashing or
// malformed probe genuinely FAILS this invariant (it is not a vacuous always-green check).
ok("predicate rejects undefined (a probe that threw ⇒ no verdict)", !wellFormed(undefined));
ok("predicate rejects a non-boolean ok", !wellFormed({ ok: "yes" }));
ok("predicate accepts real verdict shapes", wellFormed({ ok: false, detail: "d" }) && wellFormed({ ok: true }));

console.log(`\nPROBE-REGISTRY CONTRACT — ${passed} assertions passed.`);
