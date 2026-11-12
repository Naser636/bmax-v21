#!/usr/bin/env node
"use strict";
/*
 * V171 (§5 — the REAL weekly radar scheduler runtime). PURE, deterministic, fail-closed. Builds the runtime decision +
 * execution state-machine that radar-schedule.ts (a config VALIDATOR) does not provide, REUSING its canonical WINDOW
 * envelope (Sunday 02:00–05:00 Europe/Paris, 3h max) — NO second envelope, NO parallel scheduler, NO second mission authority.
 *
 * Time is INJECTED (epoch ms) — the module never calls Date.now()/argless new Date() (forbidden); new Date(epochMs) + Intl
 * Europe/Paris give DST-correct local parts. Research "units" run through an injected doUnit seam (NO real network egress).
 * The real system timer/cron is owner/root-gated: this implements + tests every local mechanism and keeps realScheduledRun
 * NOT_MEASURED until an actual scheduled execution is observed.
 */
const RS = require("./radar-schedule.js"); // canonical WINDOW envelope (reused, not redefined)
const WINDOW = RS.WINDOW;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/* parisParts(epochMs) — DST-correct {weekday, hour, minute} in Europe/Paris. */
function parisParts(epochMs: number): any {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: WINDOW.tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const parts: any = {}; for (const p of f.formatToParts(new Date(epochMs))) parts[p.type] = p.value;
  return { weekday: (parts.weekday || "").toUpperCase().slice(0, 3), hour: parseInt(parts.hour, 10), minute: parseInt(parts.minute, 10) };
}

/* isWindowOpen(epochMs) — Sunday, startHour ≤ localHour < endHour, in Europe/Paris (DST-correct). */
function isWindowOpen(epochMs: number): boolean {
  const p = parisParts(epochMs);
  return p.weekday === WINDOW.day && p.hour >= WINDOW.startHour && p.hour < WINDOW.endHour;
}

// week bucket anchored so one Sunday window maps to one key (dedup "already ran this week").
function weekKey(epochMs: number): number { return Math.floor(epochMs / WEEK_MS); }

/* grantValid(grant, epochMs) — recheck authorization BEFORE use; never valid at/after exact expiry. */
function grantValid(grant: any, epochMs: number): boolean { return !!(grant && grant.authorized === true && typeof grant.expiresMs === "number" && epochMs < grant.expiresMs); }

/* shouldTrigger(state, epochMs, grant) — the gate: window open AND grant valid AND not already run this week AND not
 * currently running (no overlap). Returns {trigger, reason}. */
function shouldTrigger(state: any, epochMs: number, grant: any): any {
  const s = state || {};
  if (s.running === true) return { trigger: false, reason: "a cycle is already running — concurrent trigger REJECTED (no overlap)" };
  if (!isWindowOpen(epochMs)) return { trigger: false, reason: "outside the Sunday 02:00–05:00 Europe/Paris window" };
  if (!grantValid(grant, epochMs)) return { trigger: false, reason: "research grant expired/invalid — refusing (no use after expiry)" };
  if (s.lastRunWeek === weekKey(epochMs)) return { trigger: false, reason: "already ran this week — duplicate cycle prevented" };
  return { trigger: true, reason: "window open, grant valid, not yet run this week, no overlap" };
}

/* runWindow(state, opts) — the controlled cycle. opts: { now, grant, sources[], missions[], maxCalls, maxDurationMs?,
 * clock(stepIndex)->epochMs (injected; models elapsed time for the 3h cap), doUnit(source)->{ok} (injected; NO real egress) }.
 * Enforces: dedup (sources+missions), budget cap, grant-expiry mid-run, 3h max duration (controlled shutdown), backoff on
 * failure, owner-gated/Truth-Lock mission skipping, persistent checkpoint (resumable). Returns an immutable run report. */
function runWindow(state: any, opts: any): any {
  const o = opts || {}; const start = o.now;
  const gate = shouldTrigger(state, start, o.grant);
  if (!gate.trigger) return Object.freeze({ ran: false, reason: gate.reason, state: Object.freeze({ ...(state || {}) }) });

  const maxDur = Number.isFinite(o.maxDurationMs) ? o.maxDurationMs : WINDOW.maxDurationMs;
  const maxCalls = Number.isFinite(o.maxCalls) ? o.maxCalls : 200;
  const sources: any[] = [...new Set(Array.isArray(o.sources) ? o.sources : [])];      // dedup sources
  const missions: any[] = [...new Set(Array.isArray(o.missions) ? o.missions : [])];   // dedup missions
  const clock = typeof o.clock === "function" ? o.clock : (() => start);
  const doUnit = typeof o.doUnit === "function" ? o.doUnit : (() => ({ ok: true }));

  // resume from a prior checkpoint (no duplicate work)
  const done = new Set<string>((state && state.checkpoint && Array.isArray(state.checkpoint.doneSources)) ? state.checkpoint.doneSources : []);
  let calls = (state && state.checkpoint && Number.isFinite(state.checkpoint.calls)) ? state.checkpoint.calls : 0;
  const backoff: any[] = []; let shutdownReason = "window completed";
  const processed: string[] = []; let step = 0;

  for (const src of sources) {
    if (done.has(src)) { continue; }                                   // already done (resume) — no duplicate
    const nowT = clock(step++);
    if (nowT - start >= maxDur) { shutdownReason = "3h max duration reached — controlled shutdown"; break; }
    if (calls >= maxCalls) { shutdownReason = "call budget exhausted — stopped"; break; }
    if (!grantValid(o.grant, nowT)) { shutdownReason = "grant expired mid-cycle — stopped"; break; }
    // execute one research unit (injected; NO real egress). Failure ⇒ bounded backoff + retry once.
    let res = doUnit(src); calls++;
    if (!res || res.ok !== true) {
      backoff.push({ source: src, attempt: 1, delayMs: 1000 });
      const retryT = clock(step++);
      if (retryT - start < maxDur && calls < maxCalls && grantValid(o.grant, retryT)) { res = doUnit(src); calls++; backoff[backoff.length - 1].retried = true; }
    }
    if (res && res.ok === true) { done.add(src); processed.push(src); }
  }

  // owner-gated / Truth-Lock: never auto-execute owner-gated missions in an unattended cycle; surface for ODG/owner.
  const ownerGated = missions.filter((m: any) => /VPS|DEPLOY|PROD|TLS|SYSTEMD|SECRET/i.test(String(m)));
  const autoRunnable = missions.filter((m: any) => !ownerGated.includes(m));

  const complete = processed.length + [...done].filter((d) => !processed.includes(d)).length >= sources.length && shutdownReason === "window completed";
  const newState = Object.freeze({
    running: false,
    lastRunWeek: complete ? weekKey(start) : (state && state.lastRunWeek),   // only mark the week done if the cycle completed
    checkpoint: Object.freeze({ doneSources: Object.freeze([...done]), calls, resumable: !complete }),
  });
  return Object.freeze({
    ran: true, shutdownReason, complete,
    processedSources: Object.freeze(processed), deduplicatedSourceCount: sources.length, deduplicatedMissionCount: missions.length,
    calls, budgetRemaining: Math.max(0, maxCalls - calls), backoff: Object.freeze(backoff),
    ownerGatedMissionsSkipped: Object.freeze(ownerGated), autoRunnableMissions: Object.freeze(autoRunnable),
    state: newState,
    realScheduledRun: "NOT_MEASURED",
  });
}

/* beginLock/isLocked — overlap prevention primitive: a running cycle sets running=true; a concurrent trigger is rejected. */
function beginLock(state: any): any { return Object.freeze({ ...(state || {}), running: true }); }

function realScheduledRunStatus(): any {
  return Object.freeze({ status: "NOT_MEASURED", reason: "no actual Sunday timer/cron execution has been observed; the real system-timer integration is owner/root-gated. All local scheduling mechanisms are implemented + tested.", ownerDependency: "systemd user timer or cron with least privilege (owner/root authorization)" });
}

const WEEKLY_RADAR_SCHEDULER_CONTRACT = Object.freeze({
  id: "V171-WEEKLY-RADAR-SCHEDULER",
  purpose: "§5 — runtime weekly radar scheduler (window gate + controlled cycle with budget/dedup/backoff/persistence/no-overlap/recovery), reusing the canonical radar-schedule WINDOW",
  reuses: ["radar-schedule.WINDOW (canonical Sunday 02:00–05:00 Europe/Paris envelope) — NO second envelope/scheduler/mission-authority"],
  invariants: Object.freeze([
    "time INJECTED (epoch ms); DST-correct via Intl Europe/Paris; never calls Date.now()/argless new Date()",
    "research units via an injected seam — NO real network egress; grant rechecked before + during the cycle (no use after expiry)",
    "enforces: window gate, 3h max (controlled shutdown), call-budget cap, source+mission dedup, backoff+retry, overlap rejection, owner-gated/Truth-Lock mission skipping, persistent resumable checkpoint",
    "realScheduledRun = NOT_MEASURED until an actual scheduled execution is observed (a scheduler implementation is NOT a real scheduled run)",
    "deterministic + fail-closed; composes the canonical envelope; no parallel scheduler",
  ]),
});
module.exports = { parisParts, isWindowOpen, weekKey, grantValid, shouldTrigger, runWindow, beginLock, realScheduledRunStatus, WINDOW, WEEKLY_RADAR_SCHEDULER_CONTRACT };
export {};
