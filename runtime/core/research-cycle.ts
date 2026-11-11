#!/usr/bin/env node
"use strict";

/*
 * research-cycle (mission M9, Phase 10 — OPERATIONAL facade over the governed-research subsystem). PURE,
 * deterministic, fail-closed. Closes a demonstrable operational gap: the isolated gates (M4 govern, M7 budget,
 * M6 ledger) never ACCRUE usage, so in a real multi-call loop the per-grant budget could never actually deplete.
 * This facade runs ONE governed-research step — compose govern()+budget (M7), RECORD the decision (M6), and on
 * ALLOW ACCRUE usage (calls +1, bytes += respBytes) — so the quota genuinely bites across calls (prolonged use is
 * really bounded). It performs NO egress: the actual fetch stays the caller's, runnable only on ALLOW. A DENY
 * accrues nothing (a refused call consumes no quota). Inherits M7 MONOTONICITY: a govern() DENY is never loosened.
 * No I/O, no clock (nowMs injected), no randomness, no network ⇒ NO egress authority.
 */

const BUDGET = require("./research-budget.js");   // M7: govern()+quota, monotonic
const LEDGER = require("./research-ledger.js");   // M6: observability + dedup

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function fin(v: any): boolean { return typeof v === "number" && Number.isFinite(v); }
function nn(v: any): number { return fin(v) && v >= 0 ? v : 0; }                 // non-negative finite, else 0

/**
 * runResearchStep(input): one governed-research step. input = { request, grant, nowMs, usage?, ledger?, respBytes?, at? }.
 *   decision = governWithBudget(request, grant, nowMs, usage, {bytes: respBytes}); the decision is RECORDED in the
 *   ledger; on ALLOW the returned nextUsage accrues (calls+1, bytes+respBytes), on DENY nextUsage is unchanged.
 * Returns frozen { decision, reasons, plan, budget, recorded, nextUsage, ledger }. Never throws.
 */
function runResearchStep(input: any = {}): any {
  // Whole body guarded: a throwing getter on ANY input field (or nested) must fail CLOSED (DENY), never throw —
  // matching the fail-closed discipline the composed M7 modules already apply to their own accessors.
  try {
    const i = isObj(input) ? input : {};
    const usage = isObj(i.usage) ? i.usage : { calls: 0, bytes: 0 };
    const respBytes = Math.floor(nn(i.respBytes));                               // integer, non-negative (shared by gate + accrual)
    const ledgerIn = isObj(i.ledger) ? i.ledger : LEDGER.emptyLedger();

    const d = BUDGET.governWithBudget(i.request, i.grant, i.nowMs, usage, { bytes: respBytes });
    const decision = d && d.decision === "ALLOW" ? "ALLOW" : "DENY";
    const reasons = d && Array.isArray(d.reasons) ? d.reasons : [];
    const plan = d && d.plan ? d.plan : null;
    const budget = d && d.budget ? d.budget : null;

    // RECORD the decision (M6). A govern() DENY has no plan object, so synthesize the minimal shape the ledger needs.
    const forLedger = isObj(d) && d.plan ? d : { decision, reasons, plan: { domains: [], query: isObj(i.request) && typeof i.request.query === "string" ? i.request.query : null } };
    const rec = LEDGER.recordDecision(ledgerIn, forLedger, { at: typeof i.at === "string" ? i.at : undefined, query: isObj(i.request) ? i.request.query : undefined });

    // ACCRUE usage ONLY on ALLOW — a denied call consumes no quota. Floored to non-negative INTEGERS so the carried
    // call/byte counters can never become fractional or NaN, even from corrupt caller usage on an unbounded grant.
    const baseCalls = Math.floor(nn(usage.calls)), baseBytes = Math.floor(nn(usage.bytes));
    const nextUsage = decision === "ALLOW"
      ? Object.freeze({ calls: baseCalls + 1, bytes: baseBytes + respBytes })
      : Object.freeze({ calls: baseCalls, bytes: baseBytes });

    return Object.freeze({
      decision,
      reasons: Object.freeze(Array.isArray(reasons) ? reasons.slice() : []),
      plan,
      budget,
      recorded: rec.ok === true,
      nextUsage,
      ledger: rec.ledger,
    });
  } catch {
    // throwing accessor / unexpected error ⇒ fail-closed DENY, no accrual, fresh ledger (input unreadable).
    return Object.freeze({ decision: "DENY", reasons: Object.freeze(["STEP_EVAL_ERROR"]), plan: null, budget: null, recorded: false, nextUsage: Object.freeze({ calls: 0, bytes: 0 }), ledger: LEDGER.emptyLedger() });
  }
}

/** recordFinding(ledger, finding, at?): passthrough to M6 — stamp-and-record a finding (deduped). Fail-closed. */
function recordFinding(ledger: any, finding: any, at?: any): any {
  return LEDGER.recordFinding(isObj(ledger) ? ledger : LEDGER.emptyLedger(), finding, { at: typeof at === "string" ? at : undefined });
}

/** summary(ledger): passthrough to M6 observability read-model. */
function summary(ledger: any): any { return LEDGER.summarize(isObj(ledger) ? ledger : LEDGER.emptyLedger()); }

module.exports = { runResearchStep, recordFinding, summary };
export {};
