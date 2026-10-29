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

// Loop-level stop reasons (distinct from per-lot status).
const STOP = ["COMPLETED", "IDLE_BLOCKED", "WAITING_EXTERNAL", "MAX_ITERATIONS", "STOP_REQUESTED"];
// execute(lot) verdict statuses the driver understands.
const VERDICT = ["ACCEPTED", "FAILED", "WAITING_EXTERNAL", "RETRY"];

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
    } else if (res.status === "WAITING_EXTERNAL") {
      C.advance(register, lot.id, { status: "BLOCKED", blockReason: res.blockReason || res.reason || "awaiting external action" });
      rec({ lot: lot.id, event: "WAITING_EXTERNAL", reason: res.reason || null });
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

function finish(reason: string, register: any, iterations: number, transitions: any[], extra: any = {}, timing: any = null): any {
  const summary = C.summary(register);
  const startedAt = timing && typeof timing.startedAt === "number" ? timing.startedAt : null;
  const endedAt = timing && typeof timing.endedAt === "number" ? timing.endedAt : null;
  // §1 operating baseline for THIS run — derived only from observed transitions/timing (honest unmeasured elsewhere).
  const metrics = M.summarizeRun({ stopped: reason, iterations, transitions, summary, startedAt, endedAt, blocked: extra.blocked });
  return {
    stopped: reason,
    campaignComplete: reason === "COMPLETED",
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

export { STOP, VERDICT, runCampaignLoop };
module.exports = { STOP, VERDICT, runCampaignLoop };

if (require.main === module) {
  // dry-run over the real register with a NO-OP executor that declines everything ⇒ shows the honest stop reason.
  const path = process.argv[2] || "docs/odg/closure-register.json";
  const r = runCampaignLoop({ registerPath: path, execute: () => ({ status: "WAITING_EXTERNAL", reason: "dry-run: no autonomous executor attached" }), maxIterations: 50 });
  process.stdout.write(JSON.stringify({ stopped: r.stopped, iterations: r.iterations, campaignComplete: r.campaignComplete, counts: r.summary.counts }, null, 2) + "\n");
}
