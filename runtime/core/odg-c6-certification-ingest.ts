#!/usr/bin/env node
"use strict";
/*
 * V301 — C6 CERTIFICATION EVIDENCE INGEST (the missing resume link). PURE, deterministic, read-only, deny-by-default.
 *
 * The sandbox-certification harness (odg-sandbox-certification-harness) deliberately NEVER returns certified — a host
 * agent cannot self-isolate (V196). The OWNER launches the real isolated bwrap session (`$HOME/bin/odg-claude-sandbox`,
 * already V198-patched) from a TTY, runs the 8 canonical tests INSIDE it, and writes the results as evidence to /work
 * (bind-mounted ⇒ host-recoverable at ~/odg-sandbox-work). This module INGESTS that captured evidence and produces an
 * HONEST certification verdict — it RUNS NOTHING and cannot fabricate: certified is true ONLY when ALL 8 canonical
 * tests are present with pass===true + non-empty evidence AND the session-isolation markers prove a real isolated
 * session. Any gap ⇒ BLOCKED. Composes the harness TESTS (same 8 ids); no new gate/primitive.
 */

const HARNESS = require("./odg-sandbox-certification-harness.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function neStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

// the 8 canonical test numbers, taken from the harness (no second source of truth).
const CANONICAL_NS = Object.freeze(HARNESS.TESTS.map((t: any) => t.n).sort((a: number, b: number) => a - b));
// session-isolation markers that must ALL hold for the evidence to come from a real isolated session.
const REQUIRED_SESSION_MARKERS = Object.freeze(["netnsOnlyLo", "canonicalInvisible", "workWritable", "noAnthropicKey"]);

/**
 * ingestCertification(results) -> frozen verdict. results = {
 *   tests: [{ n:1..8, pass:boolean, evidence:string }],
 *   session: { netnsOnlyLo, canonicalInvisible, workWritable, noAnthropicKey } (booleans, from the in-session probes)
 * }. Deny-by-default: certified ONLY when every canonical test passed with evidence AND every session marker is true.
 */
function ingestCertification(results: any): any {
  const r = isObj(results) ? results : {};
  const tests = Array.isArray(r.tests) ? r.tests : [];
  const session = isObj(r.session) ? r.session : {};

  const byN = new Map<number, any>();
  for (const t of tests) { if (isObj(t) && Number.isInteger(t.n)) byN.set(t.n, t); }

  const perTest = CANONICAL_NS.map((n: number) => {
    const t = byN.get(n);
    const present = !!t;
    const passed = present && t.pass === true && neStr(t.evidence);
    return Object.freeze({ n, present, passed, reason: !present ? "no in-session result captured" : t.pass !== true ? "test did not pass" : !neStr(t.evidence) ? "no evidence recorded" : null });
  });
  const certifiedTests = perTest.filter((t: any) => t.passed).map((t: any) => t.n);
  const failedOrMissing = perTest.filter((t: any) => !t.passed).map((t: any) => t.n);

  const sessionMarkers = REQUIRED_SESSION_MARKERS.map((k: string) => Object.freeze({ marker: k, ok: session[k] === true }));
  const sessionIsolated = sessionMarkers.every((m: any) => m.ok);

  const allTestsPass = failedOrMissing.length === 0 && certifiedTests.length === CANONICAL_NS.length;
  const certified = allTestsPass && sessionIsolated;

  return Object.freeze({
    certified,
    c6Status: certified ? "PASS" : "BLOCKED",
    totalCanonical: CANONICAL_NS.length,
    certifiedTests: Object.freeze(certifiedTests),
    failedOrMissing: Object.freeze(failedOrMissing),
    sessionIsolated, sessionMarkers: Object.freeze(sessionMarkers),
    perTest: Object.freeze(perTest),
    remainingAction: certified ? null
      : !sessionIsolated ? "run the 8 tests INSIDE the real isolated session (session-isolation markers must all hold) and re-capture evidence"
      : `capture a passing in-session result + evidence for test(s): ${failedOrMissing.join(", ")}`,
    note: certified
      ? "C6 CERTIFIED from real in-session evidence: all 8 canonical tests passed with evidence AND the session-isolation markers hold. Feed productionReady via the canonical gate."
      : "deny-by-default: NOT certified — a locally-proven mechanism or incomplete evidence is not an in-session PASS; the owner-attached isolated session must produce all 8 results + isolation markers.",
  });
}

const C6_CERTIFICATION_INGEST_CONTRACT = Object.freeze({
  id: "V301-C6-CERTIFICATION-INGEST",
  source: "V301 — ingest the owner's in-session 8-test evidence into an honest C6 certification verdict",
  reuses: Object.freeze(["odg-sandbox-certification-harness TESTS (the 8 canonical tests)", "evidence captured to /work (~/odg-sandbox-work), written by the real isolated session"]),
  requiredSessionMarkers: REQUIRED_SESSION_MARKERS,
  notAuthority: "a pure evidence-ingest verdict; runs NO test, launches NO session, fabricates nothing, changes no status; no new gate/primitive",
  invariants: Object.freeze([
    "RUNS NOTHING: it ingests evidence captured by the OWNER's real isolated in-session run; a host agent cannot self-certify (V196)",
    "deny-by-default: certified ONLY when ALL 8 canonical tests pass WITH non-empty evidence AND every session-isolation marker is true",
    "any missing/failed test or any unmet session marker ⇒ BLOCKED (never certified by omission)",
    "composes the harness's 8 canonical tests — no second certification source; deterministic + read-only",
    "C6 ⇒ PASS only on a real certified verdict; this verdict then feeds the canonical production gate (no manual status edit)",
  ]),
});

module.exports = { ingestCertification, CANONICAL_NS, REQUIRED_SESSION_MARKERS, C6_CERTIFICATION_INGEST_CONTRACT };
export {};
