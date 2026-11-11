#!/usr/bin/env node
"use strict";

/*
 * research-budget (mission M7, Phase 10 — SECURITY + resource bounding over governed egress). PURE, deterministic,
 * fail-closed. Closes a demonstrable gap in M4: a research-governor grant authorizes DOMAINS + EXPIRY but places NO
 * quantitative bound on egress — one grant permits unlimited calls/bytes. This module adds a per-grant QUOTA gate and
 * composes it with govern() MONOTONICALLY: it can only ever ADD a DENY (QUOTA_*), never loosen a govern() DENY.
 *
 * Fail-closed is SYMMETRIC: corrupt usage, a corrupt/typo'd budget cap, a corrupt req.bytes hint, and a throwing
 * accessor on any input all DENY (never silently widen the quota). An honestly-absent budget is NOT invented — it
 * returns ok:true but unbounded:true (a surfaced security signal), distinct from a real quota pass.
 *
 *  - withinBudget(grant, usage, req?) → { ok, declared, unbounded, reasons[], remaining:{calls,bytes} }.
 *  - governWithBudget(request, grant, nowMs, usage, req?) → govern() result, DOWNGRADED to DENY iff govern ALLOWed
 *      but the quota is exhausted/invalid. govern()'s own DENY is returned untouched (monotonic — never loosened).
 * No I/O, no clock (nowMs injected), no randomness, no network ⇒ NO egress authority.
 */

const GOV = require("./research-governor.js");   // REUSE M4: compose the egress decision; never loosen it

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function fin(v: any): boolean { return typeof v === "number" && Number.isFinite(v); }

/**
 * budgetOf(grant): the declared quota dims. A cap that is PRESENT but not a finite ≥0 number marks the budget
 * `invalid` (fail-closed — a typo'd cap must never silently become unbounded). Defensive against throwing getters.
 */
function budgetOf(grant: any): { maxCalls: number | null; maxBytes: number | null; declared: boolean; invalid: boolean } {
  let maxCalls: number | null = null, maxBytes: number | null = null, invalid = false, present = false;
  try {
    const b = isObj(grant) && isObj(grant.budget) ? grant.budget : {};
    if (b.maxCalls !== undefined) { present = true; if (fin(b.maxCalls) && b.maxCalls >= 0) maxCalls = b.maxCalls; else invalid = true; }
    if (b.maxBytes !== undefined) { present = true; if (fin(b.maxBytes) && b.maxBytes >= 0) maxBytes = b.maxBytes; else invalid = true; }
  } catch { invalid = true; present = true; }                                   // throwing accessor ⇒ fail-closed
  return { maxCalls, maxBytes, declared: present, invalid };
}

/** usageOf(usage): recorded consumption as non-negative finite numbers; corrupt input / throwing getter fails CLOSED. */
function usageOf(usage: any): { calls: number; bytes: number; corrupt: boolean } {
  try {
    if (usage === undefined || usage === null) return { calls: 0, bytes: 0, corrupt: false };   // new grant: zero used
    if (!isObj(usage)) return { calls: Infinity, bytes: Infinity, corrupt: true };               // malformed ⇒ fail-closed
    const rawC = usage.calls, rawB = usage.bytes;
    const badC = rawC !== undefined && (!fin(rawC) || rawC < 0);
    const badB = rawB !== undefined && (!fin(rawB) || rawB < 0);
    return { calls: badC ? Infinity : (fin(rawC) ? rawC : 0), bytes: badB ? Infinity : (fin(rawB) ? rawB : 0), corrupt: badC || badB };
  } catch { return { calls: Infinity, bytes: Infinity, corrupt: true }; }        // throwing getter ⇒ fail-closed
}

/** reqBytesOf(req): the pre-flight byte hint. Absent ⇒ 0 (by design). PRESENT-but-corrupt ⇒ fail-closed (flagged). */
function reqBytesOf(req: any): { bytes: number; corrupt: boolean } {
  try {
    if (!isObj(req) || req.bytes === undefined) return { bytes: 0, corrupt: false };
    if (fin(req.bytes) && req.bytes >= 0) return { bytes: req.bytes, corrupt: false };
    return { bytes: 0, corrupt: true };                                          // present but corrupt ⇒ fail-closed
  } catch { return { bytes: 0, corrupt: true }; }
}

/** withinBudget(grant, usage, req?): would ONE more egress (1 call + req.bytes) stay inside the grant's quota? Never throws. */
function withinBudget(grant: any, usage: any, req: any = {}): any {
  const { maxCalls, maxBytes, declared, invalid } = budgetOf(grant);
  if (!declared) {
    // No quota declared — not this gate's job to invent one, but surface the unbounded state (security signal).
    return Object.freeze({ ok: true, declared: false, unbounded: true, reasons: Object.freeze([]), remaining: Object.freeze({ calls: null, bytes: null }) });
  }
  const u = usageOf(usage);
  const rb = reqBytesOf(req);
  const reasons: string[] = [];
  if (invalid) reasons.push("BUDGET_INVALID");                                   // corrupt/typo'd cap ⇒ fail-closed (not unbounded)
  if (u.corrupt) reasons.push("USAGE_CORRUPT");                                  // fail-closed on corrupt usage
  if (rb.corrupt) reasons.push("REQ_BYTES_INVALID");                            // fail-closed on corrupt pre-flight size
  if (maxCalls !== null && u.calls + 1 > maxCalls) reasons.push("QUOTA_CALLS_EXHAUSTED");
  if (maxBytes !== null && (maxBytes === 0 || u.bytes + rb.bytes > maxBytes)) reasons.push("QUOTA_BYTES_EXHAUSTED");   // maxBytes:0 ⇒ hard block
  return Object.freeze({
    ok: reasons.length === 0,
    declared: true,
    unbounded: false,
    reasons: Object.freeze(reasons.slice()),
    remaining: Object.freeze({
      calls: maxCalls === null ? null : Math.max(0, maxCalls - (Number.isFinite(u.calls) ? u.calls : maxCalls)),
      bytes: maxBytes === null ? null : Math.max(0, maxBytes - (Number.isFinite(u.bytes) ? u.bytes : maxBytes)),
    }),
  });
}

/**
 * governWithBudget(request, grant, nowMs, usage, req?): compose M4 govern() with the quota gate MONOTONICALLY.
 * govern() DENY ⇒ returned untouched (never loosened). govern() ALLOW + quota ok ⇒ ALLOW (+budget view). govern()
 * ALLOW + quota exhausted/invalid/error ⇒ DOWNGRADED to DENY with govern()'s reasons preserved and QUOTA_* appended.
 */
function governWithBudget(request: any, grant: any, nowMs: any, usage: any, req: any = {}): any {
  const g = GOV.govern(request, grant, nowMs);
  if (!g || g.decision !== "ALLOW") return g;                                     // monotonic: never upgrade a DENY
  let b: any;
  try { b = withinBudget(grant, usage, req); }
  catch { b = Object.freeze({ ok: false, declared: true, unbounded: false, reasons: Object.freeze(["BUDGET_EVAL_ERROR"]), remaining: Object.freeze({ calls: null, bytes: null }) }); }
  if (b.ok) return Object.freeze({ decision: "ALLOW", reasons: g.reasons, plan: g.plan, budget: b });
  const reasons = Object.freeze([...(Array.isArray(g.reasons) ? g.reasons : []), ...b.reasons]);
  return Object.freeze({ decision: "DENY", reasons, plan: g.plan, budget: b });   // ALLOW ⊆ govern.ALLOW (strictly ≤ permissive)
}

/** usageFromLedgerSummary(summary): derive call usage from an M6 research-ledger summary (ALLOW decisions). bytes:0 (M6 does not track bytes). */
function usageFromLedgerSummary(summary: any): { calls: number; bytes: number } {
  const allow = isObj(summary) && isObj(summary.decisions) && fin(summary.decisions.allow) ? summary.decisions.allow : 0;
  return { calls: allow, bytes: 0 };
}

module.exports = { budgetOf, usageOf, reqBytesOf, withinBudget, governWithBudget, usageFromLedgerSummary };
export {};
