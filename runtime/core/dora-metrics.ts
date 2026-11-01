#!/usr/bin/env node
/**
 * dora-metrics — a PURE, denominator-explicit DORA four-key read-model over a campaign-loop transition stream.
 * Nicole Forsgren's measurement discipline made honest: report a key ONLY where the events actually support
 * it; otherwise return it as `observed:false, value:null` with an explicit reason. NEVER fabricate a DORA
 * number. CAPABILITY_GAP_REGISTER_V1.md G-06 (P3; D07 observability).
 *
 * Consumes the SAME shape as campaign-metrics.summarizeRun: run = { transitions:[{lot,event,t?}], deployments?,
 * startedAt?, endedAt? }, events RUNNING / COMPLETED / FAILED / WAITING_* / RETRY_WAIT. It does NOT modify
 * campaign-metrics; it mirrors its event vocabulary and its null-with-reason doctrine.
 *
 * THE FOUR KEYS, honestly scoped:
 *   - deploymentFrequency: ODG is PRE-DEPLOYMENT this phase — a COMPLETED mission is NOT a production
 *     deployment. Unless the caller supplies explicit `deployments[]`, this is observed:false (never
 *     fabricated from mission completions).
 *   - leadTimeForChanges: per-lot COMPLETED.t − RUNNING.t, ONLY when both carry numeric `t` stamps (a proxy
 *     at this layer, labelled as such); denominator = # timestamped change completions. No stamps ⇒ null.
 *   - changeFailureRate: FAILED / (COMPLETED + FAILED) over TERMINAL change outcomes (WAITING_* and RETRY are
 *     not completed outcomes, so excluded from the denominator); denominator 0 ⇒ null (survivorship-safe).
 *   - timeToRestore: per-lot FAILED → next same-lot COMPLETED, ONLY with `t` stamps; denominator = # restore
 *     pairs. None ⇒ null.
 *
 * Every key carries { observed, value, denominator, reason? }. Fail-soft (never throws on a malformed run).
 * PURE (no clock/fs/net). NO new primitive. Dual export (ESM + CJS).
 */
"use strict";

const EV_RUNNING = "RUNNING";
const EV_COMPLETED = "COMPLETED";
const EV_FAILED = "FAILED";
const SCHEMA = "odg.dora-metrics.v1";

function isNum(v: any): boolean { return typeof v === "number" && isFinite(v); }
function mean(xs: number[]): number | null { return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null; }
function median(xs: number[]): number | null { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); }

function fourKeys(run: any = {}): any {
  const trs = Array.isArray(run.transitions) ? run.transitions : [];

  // ---- change failure rate: counts only (no stamps needed) ----
  let completed = 0, failed = 0;
  for (const tr of trs) { if (tr && tr.event === EV_COMPLETED) completed++; else if (tr && tr.event === EV_FAILED) failed++; }
  const cfrDenom = completed + failed;
  const changeFailureRate = cfrDenom > 0
    ? { observed: true, value: Number((failed / cfrDenom).toFixed(3)), denominator: cfrDenom, failed, completed }
    : { observed: false, value: null, denominator: 0, reason: "no terminal change outcomes (COMPLETED/FAILED) observed — WAITING_*/RETRY are not completed outcomes" };

  // ---- lead time (proxy = RUNNING→COMPLETED per lot) + time-to-restore (FAILED→next same-lot COMPLETED) ----
  const openRun: Record<string, number> = {};   // lot -> t of its last RUNNING (stamped)
  const lastFail: Record<string, number> = {};   // lot -> t of its last FAILED (stamped)
  const leadMs: number[] = [];
  const restoreMs: number[] = [];
  let stampedCompletions = 0;
  for (const tr of trs) {
    if (!tr || typeof tr.lot !== "string") { // lot is needed to pair events; a lot-less transition can't pair
      if (tr && tr.event === EV_COMPLETED && isNum(tr.t)) stampedCompletions++;
      continue;
    }
    const lot = tr.lot;
    if (tr.event === EV_RUNNING) { if (isNum(tr.t)) openRun[lot] = tr.t; }
    else if (tr.event === EV_FAILED) { if (isNum(tr.t)) lastFail[lot] = tr.t; }
    else if (tr.event === EV_COMPLETED) {
      if (isNum(tr.t)) {
        stampedCompletions++;
        if (lot in openRun) { leadMs.push(Math.max(0, tr.t - openRun[lot])); delete openRun[lot]; }
        if (lot in lastFail) { restoreMs.push(Math.max(0, tr.t - lastFail[lot])); delete lastFail[lot]; }
      }
    }
  }
  const leadTimeForChanges = leadMs.length > 0
    ? { observed: true, value: mean(leadMs), medianMs: median(leadMs), denominator: leadMs.length, basis: "proxy: RUNNING→COMPLETED duration at the campaign layer" }
    : { observed: false, value: null, denominator: 0, reason: completed > 0 && stampedCompletions === 0 ? "change completions carry no timestamp (run without an injected clock)" : "no timestamped RUNNING→COMPLETED change pairs observed" };
  const timeToRestore = restoreMs.length > 0
    ? { observed: true, value: mean(restoreMs), medianMs: median(restoreMs), denominator: restoreMs.length }
    : { observed: false, value: null, denominator: 0, reason: failed > 0 ? "no timestamped FAILED→restore(COMPLETED) pairs observed" : "no failures observed, so no restore time to measure" };

  // ---- deployment frequency: ONLY from explicit deployment events; a COMPLETED mission is NOT a deployment ----
  const deps = Array.isArray(run.deployments) ? run.deployments : null;
  const deploymentFrequency = deps && deps.length > 0
    ? { observed: true, value: deps.length, denominator: deps.length, windowMs: isNum(run.startedAt) && isNum(run.endedAt) ? Math.max(0, run.endedAt - run.startedAt) : null }
    : { observed: false, value: null, denominator: 0, reason: "no deployment events observed — ODG is pre-deployment this phase; a COMPLETED mission is NOT a production deployment (never fabricated from completions)" };

  const keys = { deploymentFrequency, leadTimeForChanges, changeFailureRate, timeToRestore };
  const observedCount = Object.values(keys).filter((k: any) => k.observed === true).length;
  return {
    ok: true,
    schema: SCHEMA,
    keys,
    observedCount,
    note: observedCount === 4
      ? "All four DORA keys observed from the run's events."
      : `Only ${observedCount}/4 DORA keys are observable from this run; the rest are null with an explicit reason (Forsgren discipline: never fabricate an unmeasured key). ODG's pre-deployment phase makes deploymentFrequency/timeToRestore commonly unobservable.`,
  };
}

export { fourKeys, SCHEMA };
module.exports = { fourKeys, SCHEMA };

if (require.main === module) {
  const run = { transitions: [
    { lot: "a", event: "RUNNING", t: 0 }, { lot: "a", event: "COMPLETED", t: 100 },
    { lot: "b", event: "RUNNING", t: 100 }, { lot: "b", event: "FAILED", t: 150 }, { lot: "b", event: "RUNNING", t: 160 }, { lot: "b", event: "COMPLETED", t: 200 },
  ] };
  const r = fourKeys(run);
  process.stdout.write(JSON.stringify({ observedCount: r.observedCount, cfr: r.keys.changeFailureRate.value, lead: r.keys.leadTimeForChanges.value, mttr: r.keys.timeToRestore.value, deployObserved: r.keys.deploymentFrequency.observed }, null, 2) + "\n");
}
