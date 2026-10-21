#!/usr/bin/env node
/*
 * Mission Scheduler — PURE driver (ODG_RUNTIME=js rollback twin of mission-scheduler.ts; parity-maintained).
 * Reuses first-PENDING selection, ledger proven-gate (dedup) and attempt-log (audit) via INJECTED deps. NEVER
 * executes a real effect (dispatch injected). NO top-level execution ⇒ requiring it launches nothing.
 * Unattended autonomous execution is NOT enabled here (gated on explicit CTO approval).
 *
 * QUEUE SOURCE — CANONICAL vs CANARY (explicit, not silent): the queue is whatever the caller INJECTS. CANARY
 * (live, odg-schedule-tick): a SYNTHETIC allowlist-derived queue (one PENDING per ODG_CANARY_ALLOWLIST id) —
 * deny-by-default, read-only, isolated BY DESIGN. CANONICAL runtime queue: injecting it would WIDEN executable
 * missions ⇒ a gated SECURITY BOUNDARY (separate CTO decision + non-regression proof); NOT wired into the canary.
 */
"use strict";

const DEFAULT_SCHEDULER_POLICY = { maxAttemptsPerMission: 3, maxBudget: Infinity, maxDurationMs: Infinity, maxConsecutiveFailures: 2 };

function evaluateEligibility(item, ctx) {
  if (!item || item.status !== "PENDING") return { eligible: false, reason: "not PENDING" };
  const id = item.mission;
  if (!Array.isArray(ctx.preAuthorized) || !ctx.preAuthorized.includes(id)) return { eligible: false, reason: `NOT_PRE_AUTHORIZED: ${id}` };
  if (typeof ctx.isProven === "function" && ctx.isProven(id)) return { eligible: false, reason: `ALREADY_PROVEN (dedup): ${id}` };
  const attempts = (ctx.attemptsByMission && ctx.attemptsByMission[id]) || 0;
  const policy = ctx.policy || DEFAULT_SCHEDULER_POLICY;
  if (attempts >= policy.maxAttemptsPerMission) return { eligible: false, reason: `MAX_ATTEMPTS (${attempts}/${policy.maxAttemptsPerMission})` };
  return { eligible: true, reason: "eligible" };
}

function selectNext(ctx) {
  const q = ctx.queue && Array.isArray(ctx.queue.queue) ? ctx.queue.queue : [];
  for (const item of q) { if (evaluateEligibility(item, ctx).eligible) return item; }
  return null;
}

// IDLE observability: surface the per-mission eligibility reason for each injected queue item (ALREADY_PROVEN
// (dedup), NOT_PRE_AUTHORIZED, MAX_ATTEMPTS …) or an explicit empty-queue marker. Canonical sentence preserved
// as a PREFIX (substring consumers keep working); per-mission detail is additive. Parity twin of the .ts.
function idleReason(ctx) {
  const base = "no eligible pre-authorized PENDING mission";
  const q = ctx && ctx.queue && Array.isArray(ctx.queue.queue) ? ctx.queue.queue : [];
  if (!q.length) return `${base} (empty queue)`;
  const per = q.map((it) => `${it && it.mission}: ${evaluateEligibility(it, ctx).reason}`);
  return `${base} [${per.join("; ")}]`;
}

function decision(status, item, reason) { return { status, mission: item ? item.mission : null, reason }; }

function classifyDispatch(r) {
  if (!r || typeof r !== "object") return { status: "NOT_MEASURABLE", detail: "no dispatch result" };
  if (r.providerUnavailable === true) return { status: "BLOCKED", detail: "provider unavailable" };
  if (r.inconsistentState === true) return { status: "BLOCKED", detail: "inconsistent state" };
  if (r.proofPresent === false) return { status: "BLOCKED", detail: "proof absent" };
  if (r.verified === true) return { status: "PASS", detail: r.detail || "verified" };
  if (r.verified === false) return { status: "FAIL", detail: r.detail || "verification failed" };
  return { status: "NOT_MEASURABLE", detail: r.detail || "unmeasurable" };
}

function schedulerStep(ctx) {
  ctx = ctx || {};
  const policy = { ...DEFAULT_SCHEDULER_POLICY, ...(ctx.policy || {}) };
  ctx = { ...ctx, policy };
  const audit = (d) => { if (typeof ctx.recordAttempt === "function") { try { ctx.recordAttempt(d); } catch { /* audit best-effort */ } } };
  const stopped = (typeof ctx.stopSignal === "function" && ctx.stopSignal() === true) || process.env.ODG_SCHEDULER_STOP === "1";
  if (stopped) { const d = decision("STOPPED", null, "ODG_SCHEDULER_STOP / emergency stop"); audit(d); return d; }
  if ((ctx.budgetSpent || 0) >= policy.maxBudget) { const d = decision("BLOCKED", null, "budget exhausted"); audit(d); return d; }
  if (typeof ctx.now === "function" && typeof ctx.startedAt === "number" && (ctx.now() - ctx.startedAt) >= policy.maxDurationMs) { const d = decision("STOPPED", null, "max duration reached"); audit(d); return d; }
  if ((ctx.consecutiveFailures || 0) >= policy.maxConsecutiveFailures) { const d = decision("BLOCKED", null, "consecutive-failure cap"); audit(d); return d; }
  const next = selectNext(ctx);
  if (!next) { const d = decision("IDLE", null, idleReason(ctx)); audit(d); return d; }
  const authz = typeof ctx.authorize === "function" ? ctx.authorize(next) : { ok: false, reason: "no authorizer injected" };
  if (!authz || authz.ok !== true) { const d = decision("BLOCKED", next, `AUTHORIZATION_DENIED: ${authz && authz.reason}`); audit(d); return d; }
  if (typeof ctx.isProven === "function" && ctx.isProven(next.mission)) { const d = decision("BLOCKED", next, "already proven (dedup at dispatch)"); audit(d); return d; }
  let result;
  try { result = typeof ctx.dispatch === "function" ? ctx.dispatch(next) : null; }
  catch (e) { const d = decision("FAIL", next, `dispatch threw: ${(e && e.message) || e}`); audit(d); return d; }
  const c = classifyDispatch(result);
  const d = decision(c.status, next, c.detail);
  audit(d);
  return d;
}

module.exports = { DEFAULT_SCHEDULER_POLICY, evaluateEligibility, selectNext, classifyDispatch, schedulerStep };
