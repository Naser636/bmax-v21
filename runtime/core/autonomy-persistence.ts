#!/usr/bin/env node
"use strict";

/*
 * V12.4 §38–§42 — A3+ PERSISTENT AUTONOMY driver + metrics. PURE orchestration over the EXISTING canonical mechanisms
 * (NO second scheduler/queue): it drives the autonomous loop select→execute→accept/fail→persist→select using
 * campaign-controller (selectNextLot + advance, which already enforce dep-order, BLOCKED-skip and NO-REPEAT), and
 * DEMONSTRATES — not assumes — persistence: a controlled interruption leaves a recoverable register, resumeAutonomy
 * continues at the right point WITHOUT re-running an ACCEPTED lot, an INCOMPLETE lot is never marked ACCEPTED, a
 * BLOCKED lot is isolated while independent lots proceed. It also measures native-vs-delegated autonomy (so "ODG did
 * it natively" is never claimed for work a provider executed). The `execute` callback is injected (the real executor
 * stays external/governed). Dual export.
 */

const CC = require("./campaign-controller");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function round(n: number): number { return Number(n.toFixed(4)); }

/** autonomyMetrics(d) -> native vs delegated ratio, success rate, resumes. Honest: nativeCount counts ONLY lots the
 * executor reported as native:true (work ODG did with its own mechanisms), never delegated work. */
function autonomyMetrics(d: any): any {
  const accepted = Array.isArray(d.accepted) ? d.accepted.length : 0;
  const failed = Array.isArray(d.failed) ? d.failed.length : 0;
  const executed = accepted + failed;
  const native = d.native || 0; const delegated = d.delegated || 0;
  return Object.freeze({
    missionsExecuted: executed, accepted, failed, nativeCount: native, delegatedCount: delegated,
    nativeRatio: (native + delegated) > 0 ? round(native / (native + delegated)) : 0,
    successRate: executed > 0 ? round(accepted / executed) : 0,
    resumes: d.resumes || 0,
  });
}

/**
 * runAutonomyCycle(register, opts) -> { iterations, accepted, failed, stopped, register, metrics }. opts: { execute,
 * maxIter, resumes }. execute(lot) -> { accepted, evidence, native?, incomplete?, reason? } (may throw — caught).
 * Drives the canonical loop; an INCOMPLETE/failed lot is advanced as a failed attempt (stalled, NOT accepted).
 */
function runAutonomyCycle(register: any, opts: any): any {
  const o = isObj(opts) ? opts : {};
  const execute = typeof o.execute === "function" ? o.execute : (() => ({ accepted: false, reason: "no executor" }));
  const maxIter = typeof o.maxIter === "number" && o.maxIter > 0 ? o.maxIter : 1000;
  const reg = isObj(register) ? register : { items: [] };
  const accepted: string[] = []; const failed: string[] = [];
  let native = 0, delegated = 0, iter = 0, reason = "";
  while (iter < maxIter) {
    const sel = CC.selectNextLot(reg);
    if (!sel.lot) { reason = sel.reason || "no admissible lot"; break; }
    iter++;
    let r: any;
    try { r = execute(sel.lot); } catch (e: any) { r = { accepted: false, reason: "executor threw: " + (e && e.message ? e.message : String(e)) }; }
    r = isObj(r) ? r : { accepted: false };
    if (r.incomplete === true) { CC.advance(reg, sel.lot.id, { attemptFailed: true, reason: "incomplete (never ACCEPTED)" }); failed.push(sel.lot.id); continue; }
    if (r.accepted === true) {
      const ev = isStr(r.evidence) ? r.evidence : ("autonomy:" + sel.lot.id);
      CC.advance(reg, sel.lot.id, { status: "ACCEPTED", evidence: ev });
      accepted.push(sel.lot.id); if (r.native === true) native++; else delegated++;
    } else { CC.advance(reg, sel.lot.id, { attemptFailed: true, reason: isStr(r.reason) ? r.reason : "failed" }); failed.push(sel.lot.id); }
  }
  return Object.freeze({
    iterations: iter, accepted: Object.freeze(accepted), failed: Object.freeze(failed),
    stopped: iter >= maxIter ? "MAX_ITER" : "IDLE", reason, register: reg,
    metrics: autonomyMetrics({ accepted, failed, native, delegated, resumes: o.resumes || 0 }),
  });
}

/** resumeAutonomy(register, opts) -> continues from a (persisted, possibly partially-executed) register. The register's
 * ACCEPTED lots are preserved and NEVER re-run (campaign-controller NO-REPEAT + OPEN_STATES); resumes is incremented. */
function resumeAutonomy(register: any, opts: any): any {
  const o = isObj(opts) ? opts : {};
  return runAutonomyCycle(register, { ...o, resumes: (o.resumes || 0) + 1 });
}

const AUTONOMY_PERSISTENCE_CONTRACT = Object.freeze({
  id: "V124-A3-PLUS-AUTONOMY",
  source: "V12.4 §38–§42 — A3+ persistent autonomy (demonstrated, not assumed)",
  reuses: Object.freeze(["campaign-controller (selectNextLot + advance: dep-order, BLOCKED-skip, NO-REPEAT, fail-closed ACCEPTED)"]),
  notAuthority: "drives the autonomous loop over the single canonical scheduler; the executor is injected/external; it measures native-vs-delegated honestly and creates no second scheduler",
  invariants: Object.freeze([
    "NO second scheduler/queue — composes campaign-controller only",
    "an INCOMPLETE lot is advanced as a failed attempt and is NEVER marked ACCEPTED (fail-closed)",
    "a controlled interruption leaves a recoverable register; resumeAutonomy continues WITHOUT re-running an ACCEPTED lot (NO-REPEAT)",
    "a BLOCKED lot is isolated; independent admissible lots continue",
    "native autonomy is counted ONLY for work the executor reports as native (never claimed for delegated work)",
    "pure/deterministic; the executor is injected",
  ]),
});

module.exports = { AUTONOMY_PERSISTENCE_CONTRACT, runAutonomyCycle, resumeAutonomy, autonomyMetrics };

if (require.main === module) { process.stdout.write(JSON.stringify(AUTONOMY_PERSISTENCE_CONTRACT, null, 2) + "\n"); }

export {};
