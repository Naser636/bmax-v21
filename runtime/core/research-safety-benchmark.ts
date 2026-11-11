#!/usr/bin/env node
"use strict";

/*
 * research-safety-benchmark (mission M8, Phase 10 — INDEPENDENT benchmark of the governed-research subsystem).
 * PURE, deterministic. Runs a SEALED (deep-frozen, provenance-digested) adversarial corpus through the REAL M4–M7
 * modules and measures a single emergent SAFETY metric: how many cases VIOLATE the subsystem's invariants. It is a
 * RESISTANCE measure, not a capability claim — the headline target is 0 violations, and a violation is only ever
 * COUNTED from the real modules' actual behaviour (never fabricated, never suppressed).
 *
 * Properties probed (each case declares the one it tests + the safe outcome):
 *   GOVERN_FAILCLOSED  — govern() must DENY without a valid, unexpired, domain-scoped grant.
 *   BUDGET_MONOTONIC   — governWithBudget() must NEVER be more permissive than govern() (a DENY stays DENY).
 *   BUDGET_FAILCLOSED  — a declared-but-exhausted/corrupt quota must DENY an otherwise-allowed call.
 *   STAMP_ANTIFAB      — stampFinding() must REFUSE an undated/sourceless/contentless finding.
 *   LEDGER_DEDUP       — identical findings must collapse (distinct==1, repeated>=1).
 *   RADAR_FAILCLOSED   — a malformed clock must yield zero scheduled targets.
 * No I/O, no network, no randomness; crypto hash is deterministic. Holds NO egress authority.
 */

const crypto = require("crypto");
const GOV = require("./research-governor.js");
const RADAR = require("./research-radar.js");
const LEDGER = require("./research-ledger.js");
const BUDGET = require("./research-budget.js");

const BENCH_VERSION = "research-safety-benchmark-v1";
const NOW = Date.parse("2026-11-11T00:00:00Z");
const OK_GRANT = { authorized: true, allowedDomains: ["example.com"], expiresMs: NOW + 100000 };
const REQ = { query: "q", urls: ["https://example.com/a"] };

// deepFreeze: recursively freeze every nested input so the sealed corpus is truly immutable (not just shallow).
// A `seen` set tolerates shared references (REQ/OK_GRANT aliased across cases) without revisiting.
function deepFreeze<T>(o: T, seen?: Set<any>): T {
  const s = seen || new Set<any>();
  if (o === null || typeof o !== "object" || s.has(o)) return o;
  s.add(o);
  for (const k of Object.keys(o as any)) deepFreeze((o as any)[k], s);
  Object.freeze(o);
  return o;
}

// SEALED adversarial corpus. Each case: a property + the inputs; the scorer runs the REAL module and checks the
// safe outcome. DEEP-frozen so its provenance digest is stable and the inputs are genuinely immutable (tamper-evident).
const CORPUS: ReadonlyArray<any> = deepFreeze([
  // GOVERN_FAILCLOSED — must DENY
  Object.freeze({ id: "gov-no-grant", property: "GOVERN_FAILCLOSED", request: REQ, grant: {}, nowMs: NOW }),
  Object.freeze({ id: "gov-unauth", property: "GOVERN_FAILCLOSED", request: REQ, grant: { authorized: false, allowedDomains: ["example.com"] }, nowMs: NOW }),
  Object.freeze({ id: "gov-expired", property: "GOVERN_FAILCLOSED", request: REQ, grant: { authorized: true, allowedDomains: ["example.com"], expiresMs: NOW - 1 }, nowMs: NOW }),
  Object.freeze({ id: "gov-no-expiry", property: "GOVERN_FAILCLOSED", request: REQ, grant: { authorized: true, allowedDomains: ["example.com"] }, nowMs: NOW }),
  Object.freeze({ id: "gov-bad-domain", property: "GOVERN_FAILCLOSED", request: { urls: ["https://evil.com/x"] }, grant: OK_GRANT, nowMs: NOW }),
  Object.freeze({ id: "gov-bad-time", property: "GOVERN_FAILCLOSED", request: REQ, grant: OK_GRANT, nowMs: "nope" }),
  // BUDGET_MONOTONIC — govern DENY must stay DENY under any budget
  Object.freeze({ id: "mono-no-grant-huge-budget", property: "BUDGET_MONOTONIC", request: REQ, grant: { budget: { maxCalls: 1e9 } }, nowMs: NOW, usage: { calls: 0 } }),
  Object.freeze({ id: "mono-expired-huge-budget", property: "BUDGET_MONOTONIC", request: REQ, grant: { authorized: true, allowedDomains: ["example.com"], expiresMs: NOW - 1, budget: { maxCalls: 1e9 } }, nowMs: NOW, usage: { calls: 0 } }),
  Object.freeze({ id: "mono-bad-domain-budget", property: "BUDGET_MONOTONIC", request: { urls: ["https://evil.com/x"] }, grant: { ...OK_GRANT, budget: { maxCalls: 1e9 } }, nowMs: NOW, usage: { calls: 0 } }),
  // BUDGET_FAILCLOSED — allowed grant but quota exhausted/corrupt ⇒ DENY
  Object.freeze({ id: "bud-exhausted", property: "BUDGET_FAILCLOSED", request: REQ, grant: { ...OK_GRANT, budget: { maxCalls: 3 } }, nowMs: NOW, usage: { calls: 3 } }),
  Object.freeze({ id: "bud-corrupt-usage", property: "BUDGET_FAILCLOSED", request: REQ, grant: { ...OK_GRANT, budget: { maxCalls: 3 } }, nowMs: NOW, usage: { calls: -5 } }),
  Object.freeze({ id: "bud-corrupt-cap", property: "BUDGET_FAILCLOSED", request: REQ, grant: { ...OK_GRANT, budget: { maxCalls: "3" } }, nowMs: NOW, usage: { calls: 0 } }),
  Object.freeze({ id: "bud-zero-bytes", property: "BUDGET_FAILCLOSED", request: REQ, grant: { ...OK_GRANT, budget: { maxBytes: 0 } }, nowMs: NOW, usage: { calls: 0, bytes: 0 } }),
  // STAMP_ANTIFAB — must refuse
  Object.freeze({ id: "stamp-no-date", property: "STAMP_ANTIFAB", content: "x", source: { url: "https://example.com/p" } }),
  Object.freeze({ id: "stamp-no-source", property: "STAMP_ANTIFAB", content: "x", source: { date: "2026-11-10" } }),
  Object.freeze({ id: "stamp-bad-date", property: "STAMP_ANTIFAB", content: "x", source: { url: "https://example.com/p", date: "2026-13-40" } }),
  // LEDGER_DEDUP — identical findings collapse
  Object.freeze({ id: "ledger-dedup", property: "LEDGER_DEDUP", finding: { content: "price X", source: "https://example.com/p", date: "2026-11-10", confidence: "HIGH" }, times: 3 }),
  // RADAR_FAILCLOSED — malformed clock ⇒ no targets
  Object.freeze({ id: "radar-bad-clock", property: "RADAR_FAILCLOSED", watchlist: [{ topic: "t" }], nowMs: null }),
]);

function digest(): string { return crypto.createHash("sha256").update(JSON.stringify(CORPUS)).digest("hex"); }

/** scoreCase(c): run the REAL module for case c and return { id, property, safe, observed }. Pure; never throws. */
function scoreCase(c: any): any {
  let safe = false, observed = "", id: any = null, property: any = "UNKNOWN";
  try {
    id = (c && typeof c === "object") ? c.id : null;          // read inside try — a hostile getter cannot escape
    property = (c && typeof c === "object" && typeof c.property === "string") ? c.property : "UNKNOWN";
    switch (property) {
      case "GOVERN_FAILCLOSED": {
        const d = GOV.govern(c.request, c.grant, c.nowMs); observed = d.decision; safe = d.decision === "DENY"; break;
      }
      case "BUDGET_MONOTONIC": {
        const g = GOV.govern(c.request, c.grant, c.nowMs);
        const wb = BUDGET.governWithBudget(c.request, c.grant, c.nowMs, c.usage, {});
        observed = `${g.decision}->${wb.decision}`;
        // monotonic: govern DENY must remain DENY (budget must not loosen it)
        safe = !(g.decision === "DENY" && wb.decision === "ALLOW");
        break;
      }
      case "BUDGET_FAILCLOSED": {
        const wb = BUDGET.governWithBudget(c.request, c.grant, c.nowMs, c.usage, {}); observed = wb.decision; safe = wb.decision === "DENY"; break;
      }
      case "STAMP_ANTIFAB": {
        const r = GOV.stampFinding(c.content, c.source); observed = r.ok ? "ACCEPTED" : "REFUSED"; safe = r.ok === false; break;
      }
      case "LEDGER_DEDUP": {
        let led = LEDGER.emptyLedger();
        for (let i = 0; i < (c.times || 2); i++) led = LEDGER.recordFinding(led, c.finding, {}).ledger;
        const s = LEDGER.summarize(led); observed = `distinct=${s.findings.distinct},repeated=${s.findings.repeated}`;
        safe = s.findings.distinct === 1 && s.findings.repeated === (c.times || 2) - 1; break;
      }
      case "RADAR_FAILCLOSED": {
        const p = RADAR.planRadar(c.watchlist, [], { nowMs: c.nowMs }); observed = `targets=${p.targets.length}`; safe = p.targets.length === 0; break;
      }
      default: observed = "UNKNOWN_PROPERTY"; safe = false;
    }
  } catch (e: any) { observed = "THREW:" + ((e && e.message) || e); safe = false; }   // a thrown exception is NOT safe
  return { id: id ?? null, property, safe, observed };
}

/** runBenchmark(): score every sealed case; report the single safety metric (violations target 0). Pure, frozen. */
function runBenchmark(): any {
  const results = CORPUS.map(scoreCase);
  const violations = results.filter((r) => !r.safe);
  const byProperty: Record<string, { total: number; safe: number }> = {};
  for (const r of results) { (byProperty[r.property] = byProperty[r.property] || { total: 0, safe: 0 }).total++; if (r.safe) byProperty[r.property].safe++; }
  return Object.freeze({
    version: BENCH_VERSION,
    digest: digest(),
    total: results.length,
    safe: results.length - violations.length,
    safetyViolations: violations.length,
    safetyViolationRate: results.length ? Number((violations.length / results.length).toFixed(4)) : null,
    byProperty: Object.freeze(byProperty),
    violations: Object.freeze(violations.map((v) => Object.freeze(v))),
    results: Object.freeze(results.map((r) => Object.freeze(r))),
  });
}

module.exports = { BENCH_VERSION, CORPUS, digest, scoreCase, runBenchmark };
export {};

if (require.main === module) {
  const r = runBenchmark();
  process.stdout.write(JSON.stringify({ version: r.version, digest: r.digest, total: r.total, safetyViolations: r.safetyViolations, byProperty: r.byProperty }, null, 2) + "\n");
}
