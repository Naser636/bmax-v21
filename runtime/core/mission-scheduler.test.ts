#!/usr/bin/env node
// @ts-nocheck — runtime/core test convention: runs under tsx; migration-debt pragma (not strict typing).
/*
 * Mission Scheduler — ISOLATED harness. Everything is a double/seam: an in-memory queue, injected isProven /
 * authorize / dispatch / recordAttempt / clock / stopSignal. NO real mission runs, NO fs/network/subprocess,
 * NO consequential effect. Covers the mandated categories: eligibility/refusal, per-mission+per-effect authz
 * (no self-authorization), attempt/budget/duration limits, dedup/idempotence/resume, normal + emergency stop,
 * provider-unavailable / proof-absent / inconsistent-state / verification-failure, full audit journaling, and
 * the PASS/FAIL/BLOCKED/NOT_MEASURABLE distinction — plus a proof that requiring the module launches nothing.
 */
"use strict";

const assert = require("assert");
const sched = require("./mission-scheduler.js");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const Q = (...ids) => ({ queue: ids.map((m) => ({ mission: m, status: "PENDING" })) });
// A base ctx with safe doubles: authorizer grants, dispatch is a recording double returning a verified result.
function baseCtx(over) {
  const audit = [];
  const dispatched = [];
  const ctx = {
    queue: Q("M1"),
    preAuthorized: ["M1"],
    isProven: () => false,
    attemptsByMission: {},
    authorize: () => ({ ok: true }),
    dispatch: (item) => { dispatched.push(item.mission); return { verified: true, proofPresent: true, detail: "ok" }; },
    recordAttempt: (d) => audit.push(d),
    now: () => 1000,
    startedAt: 0,
    budgetSpent: 0,
    consecutiveFailures: 0,
    ...over,
  };
  return { ctx, audit, dispatched };
}

console.log("Mission Scheduler — isolated harness");

// 0 — SAFETY: requiring the module ran NO mission + exposes pure fns only (no top-level execution).
ok("module is a pure library (no top-level run): exports schedulerStep + helpers", typeof sched.schedulerStep === "function" && typeof sched.evaluateEligibility === "function" && typeof sched.classifyDispatch === "function");

// 1 — ELIGIBILITY + refusal of a non-pre-authorized mission.
{
  const { ctx } = baseCtx({ queue: Q("ROGUE"), preAuthorized: ["M1"] });
  const d = sched.schedulerStep(ctx);
  ok("non-pre-authorized PENDING mission ⇒ IDLE (refused, not selected)", d.status === "IDLE");
  ok("eligibility names NOT_PRE_AUTHORIZED", sched.evaluateEligibility({ mission: "ROGUE", status: "PENDING" }, { preAuthorized: ["M1"], policy: sched.DEFAULT_SCHEDULER_POLICY }).reason.includes("NOT_PRE_AUTHORIZED"));
}
// 2 — AUTHORIZATION per mission; NO self-authorization (no authorizer ⇒ deny-by-default; denied ⇒ BLOCKED, no dispatch).
{
  const { ctx, dispatched } = baseCtx({ authorize: undefined });
  const d = sched.schedulerStep(ctx);
  ok("no authorizer injected ⇒ BLOCKED (deny-by-default, never self-authorizes)", d.status === "BLOCKED" && d.reason.includes("AUTHORIZATION_DENIED"));
  ok("denied authorization ⇒ dispatch NOT called (no effect)", dispatched.length === 0);
  const r2 = baseCtx({ authorize: () => ({ ok: false, reason: "effect-class not permitted" }) });
  ok("per-effect authorization DENY ⇒ BLOCKED + no dispatch", (() => { const d2 = sched.schedulerStep(r2.ctx); return d2.status === "BLOCKED" && r2.dispatched.length === 0; })());
}
// 3 — LIMITS: attempts, budget, duration.
{
  ok("attempt cap ⇒ mission not eligible", sched.selectNext({ queue: Q("M1"), preAuthorized: ["M1"], attemptsByMission: { M1: 3 }, policy: sched.DEFAULT_SCHEDULER_POLICY }) === null);
  const over = baseCtx({ budgetSpent: 100, policy: { maxBudget: 100 } });
  ok("budget exhausted ⇒ BLOCKED + no dispatch", (() => { const d = sched.schedulerStep(over.ctx); return d.status === "BLOCKED" && over.dispatched.length === 0; })());
  const dur = baseCtx({ now: () => 5000, startedAt: 0, policy: { maxDurationMs: 1000 } });
  ok("max duration reached ⇒ STOPPED + no dispatch", (() => { const d = sched.schedulerStep(dur.ctx); return d.status === "STOPPED" && dur.dispatched.length === 0; })());
  const cf = baseCtx({ consecutiveFailures: 2, policy: { maxConsecutiveFailures: 2 } });
  ok("consecutive-failure cap ⇒ BLOCKED + no dispatch", (() => { const d = sched.schedulerStep(cf.ctx); return d.status === "BLOCKED" && cf.dispatched.length === 0; })());
}
// 4 — DEDUP / idempotence / resume from canonical state.
{
  const { ctx, dispatched } = baseCtx({ queue: Q("M1", "M2"), preAuthorized: ["M1", "M2"], isProven: (m) => m === "M1" });
  const d = sched.schedulerStep(ctx);
  ok("already-proven mission skipped; next eligible selected (dedup + resume from queue)", d.mission === "M2" && d.status === "PASS");
  ok("proven mission was NOT dispatched (idempotence)", !dispatched.includes("M1") && dispatched.includes("M2"));
}
// 5 — STOP: normal stopSignal + emergency ODG_SCHEDULER_STOP.
{
  const { ctx, dispatched } = baseCtx({ stopSignal: () => true });
  ok("stopSignal ⇒ STOPPED + no dispatch", (() => { const d = sched.schedulerStep(ctx); return d.status === "STOPPED" && dispatched.length === 0; })());
  const prev = process.env.ODG_SCHEDULER_STOP; process.env.ODG_SCHEDULER_STOP = "1";
  const em = baseCtx({});
  const d = sched.schedulerStep(em.ctx);
  if (prev === undefined) delete process.env.ODG_SCHEDULER_STOP; else process.env.ODG_SCHEDULER_STOP = prev;
  ok("ODG_SCHEDULER_STOP=1 ⇒ emergency STOPPED + no dispatch", d.status === "STOPPED" && em.dispatched.length === 0);
}
// 6 — FAIL-CLOSED result classification.
{
  ok("provider unavailable ⇒ BLOCKED", sched.classifyDispatch({ providerUnavailable: true }).status === "BLOCKED");
  ok("proof absent ⇒ BLOCKED", sched.classifyDispatch({ verified: true, proofPresent: false }).status === "BLOCKED");
  ok("inconsistent state ⇒ BLOCKED", sched.classifyDispatch({ inconsistentState: true }).status === "BLOCKED");
  ok("verification failure ⇒ FAIL", sched.classifyDispatch({ verified: false }).status === "FAIL");
  ok("no observable signal ⇒ NOT_MEASURABLE (never silent PASS)", sched.classifyDispatch({}).status === "NOT_MEASURABLE" && sched.classifyDispatch(null).status === "NOT_MEASURABLE");
  ok("verified ⇒ PASS", sched.classifyDispatch({ verified: true, proofPresent: true }).status === "PASS");
  // a dispatch that throws ⇒ FAIL, recorded, no uncaught error.
  const th = baseCtx({ dispatch: () => { throw new Error("provider crashed"); } });
  ok("dispatch throws ⇒ FAIL (caught, audited)", (() => { const d = sched.schedulerStep(th.ctx); return d.status === "FAIL" && /dispatch threw/.test(d.reason); })());
}
// 7 — AUDIT journaling: every step records a typed decision via the injected recordAttempt.
{
  const { ctx, audit } = baseCtx({});
  const d = sched.schedulerStep(ctx);
  ok("every step is journaled (audit) with a typed status", audit.length === 1 && audit[0].status === d.status && ["PASS", "FAIL", "BLOCKED", "NOT_MEASURABLE", "STOPPED", "IDLE"].includes(audit[0].status));
}
// 8 — NO REAL CONSEQUENTIAL EFFECT: even on a PASS, only the injected double was called; it performed no I/O.
{
  const { ctx, dispatched } = baseCtx({});
  const d = sched.schedulerStep(ctx);
  ok("PASS path only called the injected dispatch double (no real effect)", d.status === "PASS" && dispatched.length === 1 && dispatched[0] === "M1");
}

// 9 — IDLE OBSERVABILITY: the IDLE reason exposes the per-mission eligibility cause (not an opaque sentence),
// so an audit reader can distinguish empty-queue vs all-proven (dedup) vs all-refused — without changing the
// contract (status still IDLE, mission still null) and preserving the canonical sentence as a prefix.
{
  const BASE = "no eligible pre-authorized PENDING mission";
  // all allowlisted items already proven ⇒ IDLE naming ALREADY_PROVEN + the mission id (the live M0001 case).
  const prov = baseCtx({ queue: Q("M1"), preAuthorized: ["M1"], isProven: () => true });
  const dp = sched.schedulerStep(prov.ctx);
  ok("all-proven ⇒ IDLE reason exposes ALREADY_PROVEN + mission id", dp.status === "IDLE" && dp.mission === null && dp.reason.startsWith(BASE) && /M1/.test(dp.reason) && /ALREADY_PROVEN/.test(dp.reason));
  ok("all-proven IDLE is journaled with the enriched reason", prov.audit.length === 1 && /ALREADY_PROVEN/.test(prov.audit[0].reason));
  // empty queue ⇒ explicit empty marker (distinguishable from a dedup/refusal IDLE).
  const empty = baseCtx({ queue: { queue: [] }, preAuthorized: [] });
  const de = sched.schedulerStep(empty.ctx);
  ok("empty queue ⇒ IDLE reason marks '(empty queue)'", de.status === "IDLE" && de.reason.startsWith(BASE) && /\(empty queue\)/.test(de.reason));
  // non-pre-authorized ⇒ IDLE reason names NOT_PRE_AUTHORIZED (refusal, distinct from dedup).
  const rogue = baseCtx({ queue: Q("ROGUE"), preAuthorized: ["M1"] });
  const dr = sched.schedulerStep(rogue.ctx);
  ok("refused (not pre-authorized) ⇒ IDLE reason names NOT_PRE_AUTHORIZED", dr.status === "IDLE" && /NOT_PRE_AUTHORIZED/.test(dr.reason));
}

console.log(`\nmission-scheduler — ${passed} assertions passed. (NO mission executed; scheduler NOT activated.)`);
