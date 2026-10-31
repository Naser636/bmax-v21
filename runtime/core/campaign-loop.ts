#!/usr/bin/env node
/**
 * campaign-loop — the PERSISTENT inter-mission continuity driver. It closes the gap diagnosed in the engine: the
 * campaign-controller SELECTS the next admissible lot (pure), but nothing drove the full cycle
 *
 *   MISSION_DONE → EVIDENCE_VERIFIED → STATE_PERSISTED → DEPS_RECOMPUTED → NEXT_ADMISSIBLE → EXECUTE → …
 *
 * across missions, so a campaign stopped after one mission. This driver loops that cycle until a JUSTIFIED stop.
 *
 * It is NOT a tenth primitive and NOT a second orchestrator: like campaign-controller/mission-scheduler it is a pure
 * RESOLVER/ALLOCATOR-style driver over STATE. It NEVER self-executes a real effect — the caller injects `execute(lot)`
 * (ODG performs the mission and returns a verdict). The register (persisted after EACH mission) is the durable
 * checkpoint, so an interrupted loop RESUMES from the last valid state and a re-run is idempotent (ACCEPTED lots are
 * not re-run). Fail-closed: an ACCEPTED verdict WITHOUT evidence is rejected (no false terminal state). A repeatedly-
 * failing UNCHANGED lot is not re-selected (no-repeat guard); a retry requires a changed strategy within an attempt cap.
 */
"use strict";

const C = require("./campaign-controller.js");
const M = require("./campaign-metrics.js");
const MEV = require("./mission-evidence.js");

// Loop-level stop reasons (distinct from per-lot status). UNCHANGED (back-compat): the §5 directive vocabulary is
// exposed ADDITIVELY as result.lifecycleState (see lifecycleStateOf), NOT by changing these.
const STOP = ["COMPLETED", "IDLE_BLOCKED", "WAITING_EXTERNAL", "MAX_ITERATIONS", "STOP_REQUESTED"];
// §5 lifecycle classification (additive) — a diagnosis over (stopReason, register), surfaced as result.lifecycleState
// so a supervisor can distinguish WHY the loop parked (CI vs provider vs dependency vs external-authorization vs
// recovering vs session-interrupted vs genuinely-no-safe-work). Not a new orchestrator; pure classification.
const LIFECYCLE = ["COMPLETED", "WAITING_FOR_CI", "WAITING_FOR_PROVIDER", "WAITING_FOR_DEPENDENCY", "WAITING_FOR_EXTERNAL_AUTHORIZATION", "RECOVERING", "BLOCKED", "NO_SAFE_WORK_AVAILABLE", "SESSION_INTERRUPTED", "IN_PROGRESS"];
// execute(lot) verdict statuses the driver understands. The WAITING_FOR_* refine WAITING_EXTERNAL with a waitKind
// (identical BLOCKED effect, distinct diagnosis + CI parkability); WAITING_EXTERNAL remains the generic/back-compat alias.
const VERDICT = ["ACCEPTED", "FAILED", "WAITING_EXTERNAL", "WAITING_FOR_CI", "WAITING_FOR_PROVIDER", "WAITING_FOR_DEPENDENCY", "WAITING_FOR_EXTERNAL_AUTHORIZATION", "RETRY"];
const WAIT_KIND: any = { WAITING_EXTERNAL: "EXTERNAL", WAITING_FOR_CI: "CI", WAITING_FOR_PROVIDER: "PROVIDER", WAITING_FOR_DEPENDENCY: "DEPENDENCY", WAITING_FOR_EXTERNAL_AUTHORIZATION: "EXTERNAL_AUTHORIZATION" };

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function openLots(reg: any): any[] { return (reg.items || []).filter((it: any) => it.status === "READY" || it.status === "IN_PROGRESS"); }

/**
 * runCampaignLoop({ register | registerPath, execute, maxIterations, maxAttemptsPerLot, onPersist, shouldStop }):
 * drive the campaign to a justified stop. Returns { stopped, reason, iterations, transitions[], summary }.
 * - execute(lot, register) ⇒ { status: ACCEPTED|FAILED|WAITING_EXTERNAL|RETRY, evidence?, reason?, strategy?, blockReason? }
 * - persistence: registerPath ⇒ saveRegister after EACH mission; else onPersist(register) if supplied.
 */
function runCampaignLoop(opts: any = {}): any {
  if (typeof opts.execute !== "function") return { stopped: "ERROR", reason: "execute(lot) function required" };
  let register: any;
  if (isObj(opts.register)) register = opts.register;
  else if (typeof opts.registerPath === "string") { const l = C.loadRegister(opts.registerPath); if (!l.ok) return { stopped: "ERROR", reason: l.reason || "register not loadable" }; register = l.register; }
  else return { stopped: "ERROR", reason: "register or registerPath required" };

  const maxIter = Number.isFinite(opts.maxIterations) ? opts.maxIterations : 1000;
  const maxAttempts = Number.isFinite(opts.maxAttemptsPerLot) ? opts.maxAttemptsPerLot : 3;
  const persist = () => { if (typeof opts.registerPath === "string") C.saveRegister(opts.registerPath, register); else if (typeof opts.onPersist === "function") opts.onPersist(register); };
  const now = typeof opts.now === "function" ? opts.now : Date.now;   // injectable clock (deterministic in tests)
  const startedAt = now();
  const transitions: any[] = [];
  const rec = (o: any) => { o.t = now(); transitions.push(o); };       // stamp every transition with a monotonic ms time
  const stopNow = () => typeof opts.shouldStop === "function" && opts.shouldStop();

  // Recompute the graph first: invalidate ACCEPTED evidence whose dependency has regressed (no stale reuse).
  C.reconcile(register, { demote: true }); persist();

  let iter = 0;
  while (iter < maxIter) {
    if (stopNow()) { persist(); return finish("STOP_REQUESTED", register, iter, transitions, {}, { startedAt, endedAt: now() }); }
    const sel = C.selectNextLot(register);
    if (!sel.lot) {
      const open = openLots(register);
      const blockedLots = (register.items || []).filter((it: any) => it.status === "BLOCKED");
      // COMPLETED only when NO non-terminal work remains at all — no open (READY/IN_PROGRESS) AND no BLOCKED.
      // A BLOCKED lot is unfinished (awaiting external action), never a completed campaign.
      const reason = open.length === 0 && blockedLots.length === 0 ? "COMPLETED" : "IDLE_BLOCKED";
      persist();
      return finish(reason, register, iter, transitions, { open: open.map((o: any) => o.id), stalled: sel.stalled || [], blocked: (register.items || []).filter((it: any) => it.status === "BLOCKED").map((it: any) => it.id), selectReason: sel.reason }, { startedAt, endedAt: now() });
    }
    const lot = sel.lot;
    rec({ lot: lot.id, event: "RUNNING" });
    let res: any;
    try { res = opts.execute(lot, register); } catch (e: any) { res = { status: "FAILED", reason: (e && e.message) || "execute threw", retryable: false }; }
    if (!isObj(res) || !VERDICT.includes(res.status)) res = { status: "FAILED", reason: "execute returned no valid verdict", retryable: false };

    if (res.status === "ACCEPTED") {
      // POLICY opts.requireProof (default false): when ODG mandates proof for this campaign, an ACCEPTED verdict WITHOUT
      // a proof record is REFUSED — closing the "bypass by omission" where an executor silently falls back to the
      // legacy evidence-string accept. This makes the mission-evidence proof genuinely CONSUMED, not merely available.
      if (opts.requireProof === true && !isObj(res.proof)) {
        C.advance(register, lot.id, { attemptFailed: true, reason: "proof required by campaign policy but none provided (bypass-by-omission refused)" });
        rec({ lot: lot.id, event: "FAILED", reason: "proof-required: none provided" });
        C.reconcile(register, { demote: true }); persist(); iter++; continue;
      }
      // OPT-IN false-success gate: if the executor returns a `proof` record, acceptance must pass the adversarial
      // mission-evidence gate (decisive exit 0, artifacts present, independent verification) — a non-empty evidence
      // string alone is not proof. No `proof` (and not requireProof) ⇒ unchanged behaviour (backward compatible).
      if (isObj(res.proof)) {
        // expect:"ACCEPTED" forces the gate to judge the ACCEPTED criteria regardless of the proof's self-reported
        // transition (closes the spoofed/missing-transition bypass). Verification requirement is a LOOP policy
        // (opts.requireProofVerification, default true) — the executor cannot waive its own gate.
        const gate = MEV.assertAcceptable(res.proof, { expect: "ACCEPTED", requireVerification: opts.requireProofVerification !== false });
        if (!gate.acceptable) {
          C.advance(register, lot.id, { attemptFailed: true, reason: `evidence gate rejected acceptance: ${gate.reasons.join("; ")}` });
          rec({ lot: lot.id, event: "FAILED", reason: `evidence-gate: ${gate.reasons.join("; ")}` });
          C.reconcile(register, { demote: true }); persist(); iter++; continue;   // NOT a terminal success
        }
      }
      const r = C.advance(register, lot.id, { status: "ACCEPTED", evidence: res.evidence });
      if (!r.ok) {                                    // fail-closed: ACCEPTED claimed without evidence ⇒ NOT a terminal success
        C.advance(register, lot.id, { attemptFailed: true, reason: `ACCEPTED rejected: ${r.code}` });
        rec({ lot: lot.id, event: "FAILED", reason: r.code });
      } else rec({ lot: lot.id, event: "COMPLETED" });
    } else if (WAIT_KIND[res.status]) {
      // Any WAITING_* verdict ⇒ BLOCK this lot (awaiting an external condition) and CONTINUE to the next admissible lot
      // (a blocked lot never freezes independent work). The waitKind refines the generic WAITING_EXTERNAL so a
      // supervisor can distinguish CI / PROVIDER / DEPENDENCY / EXTERNAL_AUTHORIZATION; a CI wait also parks the run id
      // so resolveCiWaiters() can later re-admit it on CI completion (the CI-completion→next-action mechanism).
      const waitKind = WAIT_KIND[res.status];
      const a = C.advance(register, lot.id, { status: "BLOCKED", blockReason: res.blockReason || res.reason || `awaiting ${String(waitKind).toLowerCase()}` });
      if (a.ok && a.item) { a.item.waitKind = waitKind; if (waitKind === "CI" && res.ciRunId) a.item.ciRunId = res.ciRunId; else delete a.item.ciRunId; }
      rec({ lot: lot.id, event: res.status, waitKind, ciRunId: (waitKind === "CI" && res.ciRunId) || null, reason: res.reason || null });
    } else if (res.status === "RETRY") {
      const attempts = (lot.attempts || 0) + 1;
      if (attempts < maxAttempts && typeof res.strategy === "string" && res.strategy) {
        C.advance(register, lot.id, { attemptFailed: true, reason: res.reason || "retry", strategy: res.strategy });  // changed strategy ⇒ re-admissible
        rec({ lot: lot.id, event: "RETRY_WAIT", attempts, strategy: res.strategy });
      } else {
        C.advance(register, lot.id, { attemptFailed: true, reason: res.reason || "retry exhausted" });                 // no change / cap ⇒ stalled (no-repeat)
        rec({ lot: lot.id, event: "FAILED", attempts, reason: "retry-exhausted-or-unchanged" });
      }
    } else {                                           // FAILED
      C.advance(register, lot.id, { attemptFailed: true, reason: res.reason || "failed" });                             // unchanged ⇒ stalled (no infinite repeat)
      rec({ lot: lot.id, event: "FAILED", reason: res.reason || null });
    }

    C.reconcile(register, { demote: true });           // recompute graph after the mission
    persist();                                         // durable checkpoint after EACH mission (resume point)
    iter++;
  }
  persist();
  return finish("MAX_ITERATIONS", register, iter, transitions, {}, { startedAt, endedAt: now() });
}

/** A prior run was interrupted mid-mission iff a lot is left IN_PROGRESS (the loop only ever leaves lots
 *  ACCEPTED/BLOCKED/READY on a clean stop). Pure; used to classify SESSION_INTERRUPTED and to resume idempotently. */
function detectInterrupted(register: any): any {
  const ids = (register.items || []).filter((it: any) => it.status === "IN_PROGRESS").map((it: any) => it.id);
  return { interrupted: ids.length > 0, ids };
}

/** §5 lifecycle classification over (stopReason, register) — additive diagnosis, never changes STOP. */
function lifecycleStateOf(reason: string, register: any): string {
  if (reason === "COMPLETED") return "COMPLETED";
  if (reason === "STOP_REQUESTED") return detectInterrupted(register).interrupted ? "SESSION_INTERRUPTED" : "IN_PROGRESS";
  const items = register.items || [];
  const open = items.filter((it: any) => it.status === "READY" || it.status === "IN_PROGRESS");
  const blocked = items.filter((it: any) => it.status === "BLOCKED");
  if (open.length === 0 && blocked.length > 0) {
    // All remaining work is externally blocked ⇒ classify by the dominant distinct waitKind, else generic.
    const kinds = Array.from(new Set(blocked.map((b: any) => b.waitKind).filter(Boolean)));
    if (kinds.length === 1) {
      const k = kinds[0];
      if (k === "CI") return "WAITING_FOR_CI";
      if (k === "PROVIDER") return "WAITING_FOR_PROVIDER";
      if (k === "DEPENDENCY") return "WAITING_FOR_DEPENDENCY";
      if (k === "EXTERNAL_AUTHORIZATION") return "WAITING_FOR_EXTERNAL_AUTHORIZATION";
      if (k === "RECOVERING") return "RECOVERING";
    }
    return "NO_SAFE_WORK_AVAILABLE";
  }
  if (reason === "MAX_ITERATIONS") return "IN_PROGRESS";
  // open lots remain but none admissible now (deps unsatisfied / stalled) — more work exists, just not this instant.
  return "WAITING_FOR_DEPENDENCY";
}

/**
 * resolveCiWaiters(register, ciStatus): the CI-completion→next-action mechanism. PURE + INJECTED (no real CI call here).
 * For each BLOCKED lot parked on CI (waitKind "CI" + ciRunId), ask ciStatus(ciRunId) ⇒ "success"|"failure"|"pending":
 *  - success ⇒ re-admit (status READY, clear CI wait + failure) so the loop re-selects it.
 *  - failure ⇒ bounded recovery: keep BLOCKED, mark waitKind "RECOVERING" + a diagnosis blockReason (NOT auto-retried,
 *    NOT auto-accepted — a human/ODG diagnosis must change the strategy before re-admission).
 *  - pending ⇒ unchanged.
 * Never advances a lot to ACCEPTED. Returns { resolved[], failed[], pending[] }.
 */
function resolveCiWaiters(register: any, ciStatus: any): any {
  const out = { resolved: [] as string[], failed: [] as string[], pending: [] as string[] };
  if (typeof ciStatus !== "function") return out;
  for (const it of (register.items || [])) {
    if (it.status !== "BLOCKED" || it.waitKind !== "CI" || !it.ciRunId) continue;
    let verdict: any; try { verdict = ciStatus(it.ciRunId); } catch { verdict = "pending"; }
    if (verdict === "success") { it.status = "READY"; delete it.waitKind; delete it.ciRunId; delete it.blockReason; delete it.lastFailureFingerprint; delete it.lastFailureReason; out.resolved.push(it.id); }
    else if (verdict === "failure") { it.waitKind = "RECOVERING"; it.blockReason = `CI run ${it.ciRunId} FAILED — diagnosis/recovery required (not auto-retried)`; out.failed.push(it.id); }
    else out.pending.push(it.id);
  }
  return out;
}

function finish(reason: string, register: any, iterations: number, transitions: any[], extra: any = {}, timing: any = null): any {
  const summary = C.summary(register);
  const startedAt = timing && typeof timing.startedAt === "number" ? timing.startedAt : null;
  const endedAt = timing && typeof timing.endedAt === "number" ? timing.endedAt : null;
  // §1 operating baseline for THIS run — derived only from observed transitions/timing (honest unmeasured elsewhere).
  const metrics = M.summarizeRun({ stopped: reason, iterations, transitions, summary, startedAt, endedAt, blocked: extra.blocked });
  const lifecycleState = lifecycleStateOf(reason, register);
  // reconSuggested: the loop found NO admissible work yet the campaign is NOT complete and nothing is actively
  // CI/provider-waiting that will self-resolve — i.e. the READY list is empty but the frontier may not be. This is a
  // SIGNAL to the supervisor/ODG to run read-only frontier reconnaissance; the loop never runs recon itself.
  const reconSuggested = reason !== "COMPLETED" && lifecycleState === "NO_SAFE_WORK_AVAILABLE";
  return {
    stopped: reason,
    campaignComplete: reason === "COMPLETED",
    lifecycleState,
    reconSuggested,
    iterations,
    transitions,
    summary,
    startedAt,
    endedAt,
    metrics,
    ...extra,
    note: reason === "COMPLETED"
      ? "no open lots remain — campaign drained (all ACCEPTED/terminal)."
      : reason === "IDLE_BLOCKED"
        ? "open lots remain but NONE admissible now (await deps / blocked / stalled / external) — NOT a completed campaign; resume point persisted."
        : `loop stopped: ${reason}.`,
  };
}

export { STOP, VERDICT, LIFECYCLE, runCampaignLoop, detectInterrupted, resolveCiWaiters, lifecycleStateOf };
module.exports = { STOP, VERDICT, LIFECYCLE, runCampaignLoop, detectInterrupted, resolveCiWaiters, lifecycleStateOf };

if (require.main === module) {
  // dry-run over the real register with a NO-OP executor that declines everything ⇒ shows the honest stop reason.
  const path = process.argv[2] || "docs/odg/closure-register.json";
  const r = runCampaignLoop({ registerPath: path, execute: () => ({ status: "WAITING_EXTERNAL", reason: "dry-run: no autonomous executor attached" }), maxIterations: 50 });
  process.stdout.write(JSON.stringify({ stopped: r.stopped, iterations: r.iterations, campaignComplete: r.campaignComplete, counts: r.summary.counts }, null, 2) + "\n");
}
