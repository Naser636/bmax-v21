#!/usr/bin/env node
/*
 * Mission Scheduler — PURE driver over the EXISTING canonical mechanisms (no second orchestrator, no second
 * queue, no new permanent primitive). It reuses the first-PENDING selection discipline, the mission-ledger
 * proven-gate (dedup/idempotence), and the mission-attempt-log (audit) — ALL via INJECTED dependencies. It
 * NEVER executes a real effect itself: `dispatch` is injected (a double in tests; in production it would be the
 * governed pipeline, whose wiring + activation are OUT OF SCOPE and gated).
 *
 * QUEUE SOURCE — CANONICAL vs CANARY (explicit, not silent): the queue is whatever the caller INJECTS; this
 * module owns neither a queue nor its source. Two distinct injections exist and MUST NOT be conflated:
 *   - CANARY (current live use, odg-schedule-tick): a SYNTHETIC, allowlist-derived queue — one PENDING item per
 *     `ODG_CANARY_ALLOWLIST` id. Deny-by-default, read-only, bounded; an isolated canary interface BY DESIGN.
 *   - CANONICAL runtime queue: the real pending-mission queue. Injecting it here would WIDEN the set of
 *     executable missions and is therefore a SECURITY BOUNDARY — a separate, gated CTO decision requiring
 *     non-regression proof before activation. It is NOT wired into the read-only canary and is not assumed here.
 *
 * SAFETY BY CONSTRUCTION: this module has NO top-level execution (it is a library of pure functions), so
 * requiring it launches nothing and starts no background mission. Unattended autonomous execution of
 * consequential missions is NOT enabled here and requires a separate explicit CTO approval of the perimeter.
 *
 * Dual-port: mission-scheduler.js is the ODG_RUNTIME=js rollback twin, maintained in parity.
 */
"use strict";

const EXC = require("./excellence-policy.js");

const DEFAULT_SCHEDULER_POLICY = { maxAttemptsPerMission: 3, maxBudget: Infinity, maxDurationMs: Infinity, maxConsecutiveFailures: 2 };

/**
 * buildExcellenceReviewer — canonical factory so the standing excellence rule is applied to EVERY scheduled mission
 * WITHOUT a per-mission human reminder. `inputForMission(mission)` maps a mission to an excellence-policy input
 * (domain/registry/currentPractices/thresholds/measured/claims/now). The returned reviewer is injected as
 * ctx.reviewExcellence; schedulerStep then consults it automatically. Pure; reuses excellence-policy (no new orchestrator).
 */
function buildExcellenceReviewer(inputForMission: any): (mission: any) => any {
  if (typeof inputForMission !== "function") throw new TypeError("buildExcellenceReviewer requires an (mission)=>input function");
  return (mission: any) => EXC.reviewForExcellence(inputForMission(mission) || {});
}

// Eligibility of a queue item. preAuthorized = the EXPLICIT allow-list of mission ids the scheduler may drive;
// anything else is refused (no implicit authority). Proven missions are de-duplicated; attempt bounds enforced.
function evaluateEligibility(item: any, ctx: any): any {
  if (!item || item.status !== "PENDING") return { eligible: false, reason: "not PENDING" };
  const id = item.mission;
  if (!Array.isArray(ctx.preAuthorized) || !ctx.preAuthorized.includes(id)) return { eligible: false, reason: `NOT_PRE_AUTHORIZED: ${id}` };
  if (typeof ctx.isProven === "function" && ctx.isProven(id)) return { eligible: false, reason: `ALREADY_PROVEN (dedup): ${id}` };
  const attempts = (ctx.attemptsByMission && ctx.attemptsByMission[id]) || 0;
  const policy = ctx.policy || DEFAULT_SCHEDULER_POLICY;
  if (attempts >= policy.maxAttemptsPerMission) return { eligible: false, reason: `MAX_ATTEMPTS (${attempts}/${policy.maxAttemptsPerMission})` };
  return { eligible: true, reason: "eligible" };
}

// Selection: the FIRST eligible PENDING item in the INJECTED queue (same first-PENDING order the canonical
// runtime queue / odg-status use). The queue is whatever the caller injects — see the module header on the
// canonical-vs-canary distinction. Resuming after interruption = re-reading that injected state (no
// in-memory-only state).
function selectNext(ctx: any): any {
  const q = ctx.queue && Array.isArray(ctx.queue.queue) ? ctx.queue.queue : [];
  for (const item of q) { if (evaluateEligibility(item, ctx).eligible) return item; }
  return null;
}

// IDLE observability: expose WHY nothing was eligible. Instead of a single opaque sentence, surface the
// per-mission eligibility reason for each injected queue item (ALREADY_PROVEN (dedup), NOT_PRE_AUTHORIZED,
// MAX_ATTEMPTS, not PENDING …) or an explicit empty-queue marker. The canonical sentence is preserved as a
// PREFIX so existing substring consumers keep working; the per-mission detail is purely additive.
function idleReason(ctx: any): string {
  const base = "no eligible pre-authorized PENDING mission";
  const q = ctx && ctx.queue && Array.isArray(ctx.queue.queue) ? ctx.queue.queue : [];
  if (!q.length) return `${base} (empty queue)`;
  const per = q.map((it: any) => `${it && it.mission}: ${evaluateEligibility(it, ctx).reason}`);
  return `${base} [${per.join("; ")}]`;
}

function decision(status: string, item: any, reason: string): any {
  return { status, mission: item ? item.mission : null, reason };
}

// Classify a dispatch result into a terminal category — FAIL-CLOSED. A result is PASS only when the dispatch
// reports verified===true; provider-unavailable / inconsistent-state / absent-proof ⇒ BLOCKED; explicit
// verification failure ⇒ FAIL; anything unobservable ⇒ NOT_MEASURABLE (never silently PASS).
function classifyDispatch(r: any): any {
  if (!r || typeof r !== "object") return { status: "NOT_MEASURABLE", detail: "no dispatch result" };
  if (r.providerUnavailable === true) return { status: "BLOCKED", detail: "provider unavailable" };
  if (r.inconsistentState === true) return { status: "BLOCKED", detail: "inconsistent state" };
  if (r.proofPresent === false) return { status: "BLOCKED", detail: "proof absent" };
  if (r.verified === true) return { status: "PASS", detail: r.detail || "verified" };
  if (r.verified === false) return { status: "FAIL", detail: r.detail || "verification failed" };
  return { status: "NOT_MEASURABLE", detail: r.detail || "unmeasurable" };
}

// One scheduler STEP. ALL side-effecting deps INJECTED. Returns a typed decision; never performs a real effect
// itself. ORDER: stop → bounds → select → authorize → dedup → dispatch → classify → audit.
function schedulerStep(ctx: any): any {
  ctx = ctx || {};
  const policy = { ...DEFAULT_SCHEDULER_POLICY, ...(ctx.policy || {}) };
  ctx = { ...ctx, policy };
  const audit = (d: any) => { if (typeof ctx.recordAttempt === "function") { try { ctx.recordAttempt(d); } catch { /* audit best-effort */ } } };
  // 1. emergency / normal stop
  const stopped = (typeof ctx.stopSignal === "function" && ctx.stopSignal() === true) || process.env.ODG_SCHEDULER_STOP === "1";
  if (stopped) { const d = decision("STOPPED", null, "ODG_SCHEDULER_STOP / emergency stop"); audit(d); return d; }
  // 2. budget / duration / consecutive-failure bounds
  if ((ctx.budgetSpent || 0) >= policy.maxBudget) { const d = decision("BLOCKED", null, "budget exhausted"); audit(d); return d; }
  if (typeof ctx.now === "function" && typeof ctx.startedAt === "number" && (ctx.now() - ctx.startedAt) >= policy.maxDurationMs) { const d = decision("STOPPED", null, "max duration reached"); audit(d); return d; }
  if ((ctx.consecutiveFailures || 0) >= policy.maxConsecutiveFailures) { const d = decision("BLOCKED", null, "consecutive-failure cap"); audit(d); return d; }
  // 3. canonical selection + eligibility
  const next = selectNext(ctx);
  if (!next) { const d = decision("IDLE", null, idleReason(ctx)); audit(d); return d; }
  // 4. per-mission + per-effect authorization — INJECTED; the scheduler NEVER self-authorizes (deny-by-default).
  const authz = typeof ctx.authorize === "function" ? ctx.authorize(next) : { ok: false, reason: "no authorizer injected" };
  if (!authz || authz.ok !== true) { const d = decision("BLOCKED", next, `AUTHORIZATION_DENIED: ${authz && authz.reason}`); audit(d); return d; }
  // 5. dedup / idempotence (proven-gate) re-checked at dispatch time
  if (typeof ctx.isProven === "function" && ctx.isProven(next.mission)) { const d = decision("BLOCKED", next, "already proven (dedup at dispatch)"); audit(d); return d; }
  // 5.5 EXCELLENCE RULE (canonical, auto-applied when a reviewer is injected). Consults reviewForExcellence for the
  // mission. FAIL-CLOSED **only** on a PROHIBITED claim (an unproven superlative — "world #1"/"best"/"optimal"
  // without a benchmark). Stale/offline references, open gaps, and INSUFFICIENT_EVIDENCE are ADVISORY and
  // NON-blocking: a mission is NEVER blocked merely because reference search is offline, and a reviewer error is
  // caught (advisory, non-blocking). The review is attached to the decision for audit. Absent reviewer ⇒ no change.
  let excellence: any = null;
  if (typeof ctx.reviewExcellence === "function") {
    try {
      const rev = ctx.reviewExcellence(next);
      const gate = EXC.requireExcellence(rev, {});                        // SHARED enforcement boundary (no duplication)
      if (rev && typeof rev === "object") {
        excellence = { verdict: rev.verdict, staleReferences: Array.isArray(rev.staleReferences) ? rev.staleReferences : [], openGaps: Array.isArray(rev.gaps) ? rev.gaps.filter((g: any) => !g.present).length : 0, recommendation: rev.recommendation, admit: gate.admit };
        if (!gate.admit) { const d = decision("BLOCKED", next, `EXCELLENCE_PROHIBITED_CLAIM: ${gate.reason}`); (d as any).excellence = excellence; audit(d); return d; }
      } else { excellence = { verdict: "INSUFFICIENT_EVIDENCE", advisory: true, note: "reviewer returned no review (non-blocking)" }; }
    } catch (e: any) { excellence = { verdict: "ADVISORY_ERROR", advisory: true, note: `excellence review errored (non-blocking): ${(e && e.message) || e}` }; }
  }
  // 6. dispatch via the INJECTED seam (double in tests; real governed pipeline in production — activation gated)
  let result: any;
  try { result = typeof ctx.dispatch === "function" ? ctx.dispatch(next) : null; }
  catch (e: any) { const d = decision("FAIL", next, `dispatch threw: ${(e && e.message) || e}`); if (excellence) (d as any).excellence = excellence; audit(d); return d; }
  // 7. classify (fail-closed) + audit
  const c = classifyDispatch(result);
  const d = decision(c.status, next, c.detail);
  if (excellence) (d as any).excellence = excellence;
  audit(d);
  return d;
}

export {};
module.exports = { DEFAULT_SCHEDULER_POLICY, evaluateEligibility, selectNext, classifyDispatch, schedulerStep, buildExcellenceReviewer };
