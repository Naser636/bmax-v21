#!/usr/bin/env node
"use strict";
/* V215 §9 — sandbox-certification harness. Proves: enumerates the 8 canonical tests; certifies NOTHING (certified:false);
 * distinguishes locally-proven mechanisms from in-session-required (owner-gated); composes V196/V197/V198 evidence;
 * lists exact owner actions; runs/launches nothing; deterministic + frozen. */
const H = require("./odg-sandbox-certification-harness.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const r = H.certify();

  check("enumerates exactly the 8 canonical certification tests, numbered 1..8", r.total === 8 && r.tests.length === 8 && r.tests.map((t: any) => t.n).join(",") === "1,2,3,4,5,6,7,8");
  check("certifies NOTHING — certified:false + NOT_CERTIFIED (a mechanism is not an in-session PASS)", r.certified === false && /NOT_CERTIFIED/.test(r.certification) && /NOT been run inside the real isolated session/.test(r.certification));
  check("locally-proven MECHANISMS are tests 1/7/8 (network isolation, /work persistence, no canonical access)", JSON.stringify(r.locallyProvenMechanism) === JSON.stringify([1, 7, 8]));
  check("in-session-required (owner-gated) tests are 2/3/4/5/6 (proxy, auth, claude-invocation, relay, generation)", JSON.stringify(r.inSessionRequired) === JSON.stringify([2, 3, 4, 5, 6]));
  check("each test carries real V196/V197/V198 evidence (no empty references)", r.tests.every((t: any) => typeof t.evidence === "string" && t.evidence.length > 10 && typeof t.test === "string"));
  check("evidence composes existing proofs: V196 bwrap probe, V197 relay 9/9, V198 netns e2e", r.tests.some((t: any) => /V196 bwrap probe/.test(t.evidence)) && r.tests.some((t: any) => /V197 odg-ollama-relay\.py 9\/9/.test(t.evidence)) && r.tests.some((t: any) => /V198 netns e2e/.test(t.evidence)));
  check("V198 patch is PREPARED+VALIDATED and its apply is OWNER_GATED (host launcher NOT modified)", /PREPARED\+VALIDATED \(12\/12\)/.test(r.v198Patch) && /OWNER_GATED/.test(r.v198Patch) && /NOT modified/.test(r.v198Patch));
  check("exact owner actions listed: install relay, apply patch, launch as OUTER process, run the 8 tests in-session", r.ownerActions.length === 4 && r.ownerActions.some((a: string) => /apply docs\/odg\/V198_launcher_ollama_integration\.patch/.test(a)) && r.ownerActions.some((a: string) => /OUTER process/.test(a) && /cannot self-isolate/.test(a)));
  check("honesty: PREPARES only — runs nothing, launches nothing, certifies nothing", /runs nothing, launches nothing, certifies nothing/.test(r.honesty));

  check("contract: enumerate-only, certified-always-false, owner-gated in-session, composes existing (no new engine)", H.SANDBOX_CERTIFICATION_HARNESS_CONTRACT.invariants.some((i: string) => /runs nothing, launches nothing/.test(i)) && H.SANDBOX_CERTIFICATION_HARNESS_CONTRACT.invariants.some((i: string) => /certified is ALWAYS false/.test(i)) && H.SANDBOX_CERTIFICATION_HARNESS_CONTRACT.invariants.some((i: string) => /no new engine/.test(i)));
  check("deterministic + frozen", JSON.stringify(H.certify().tests) === JSON.stringify(r.tests) && Object.isFrozen(r) && Object.isFrozen(H.TESTS));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — sandbox-certification-harness (V215 §9: enumerates the 8 tests; certifies NOTHING [certified:false]; locally-proven mechanisms 1/7/8 vs in-session-required 2/3/4/5/6 OWNER_GATED; composes V196/V197/V198 evidence; runs/launches nothing)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
