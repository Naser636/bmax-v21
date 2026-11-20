#!/usr/bin/env node
"use strict";
/*
 * V327 §4/§5 — BELIEF REFRESH (anti self-reinforcing error). PURE, deterministic, fail-closed. World-reference guard:
 * the central risk of reflective/calibrated memory (Reflexion; "Memory for Autonomous LLM Agents") is SELF-REINFORCING
 * ERROR — once an agent concludes a class "always fails" it avoids it forever, never collecting evidence that could
 * OVERTURN the false belief. ODG's calibrated-low → escalate decision has exactly this risk if the belief is never
 * refreshed. This classifies a belief by (calibration quality, success estimate, evidence AGE): a CALIBRATED belief is
 * only acted on as settled while FRESH; once STALE it must be RE-PROBED (overturn-able), not trusted indefinitely.
 *
 * It composes the staleness notion calibration.ts already uses (ageDays vs maxAgeDays) — it does NOT re-implement
 * calibration; it is the decision layer that keeps a calibrated belief overturn-able. No network/clock (age injected).
 */

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

const ACTION = Object.freeze({ PROBE: "PROBE", RE_PROBE_STALE: "RE_PROBE_STALE", TRUST_LOW: "TRUST_LOW", TRUST_HIGH: "TRUST_HIGH" });
const DEFAULT_MAX_AGE_DAYS = 90;
const DEFAULT_LOW = 0.5;

/**
 * classifyBelief(signal) -> { action, overturnable, reason }. signal: { quality ("CALIBRATED"|...), pForPlanner,
 * evidenceAgeDays?, maxAgeDays?=90, lowThreshold?=0.5 }.
 *  - not CALIBRATED ⇒ PROBE (no settled belief; gather).
 *  - CALIBRATED but evidenceAgeDays > maxAgeDays ⇒ RE_PROBE_STALE (belief stale ⇒ re-collect to allow overturning —
 *    the anti self-reinforcing-error guard). overturnable:true.
 *  - CALIBRATED + fresh + pForPlanner < lowThreshold ⇒ TRUST_LOW (act on the low belief, e.g. escalate).
 *  - CALIBRATED + fresh + pForPlanner ≥ lowThreshold ⇒ TRUST_HIGH.
 * Fresh is assumed when no age is supplied (backward-compatible; the caller opts into staleness by passing an age).
 */
function classifyBelief(signal: any): any {
  const s = isObj(signal) ? signal : {};
  const maxAge = Number.isFinite(Number(s.maxAgeDays)) && Number(s.maxAgeDays) >= 0 ? Number(s.maxAgeDays) : DEFAULT_MAX_AGE_DAYS;
  const low = Number.isFinite(Number(s.lowThreshold)) ? Number(s.lowThreshold) : DEFAULT_LOW;
  if (s.quality !== "CALIBRATED") return freeze({ action: ACTION.PROBE, overturnable: true, reason: `belief not CALIBRATED (${s.quality || "?"}) — gather evidence (no settled belief to act on)` });
  const age = Number(s.evidenceAgeDays);
  if (Number.isFinite(age) && age > maxAge) return freeze({ action: ACTION.RE_PROBE_STALE, overturnable: true, reason: `calibrated belief is STALE (${age}d > ${maxAge}d) — RE-PROBE to allow overturning (anti self-reinforcing error); never trust a stale belief as permanent` });
  const p = Number(s.pForPlanner);
  if (Number.isFinite(p) && p < low) return freeze({ action: ACTION.TRUST_LOW, overturnable: false, reason: `fresh calibrated-low (P=${p} < ${low}) — act on the low belief (e.g. escalate)` });
  return freeze({ action: ACTION.TRUST_HIGH, overturnable: false, reason: `fresh calibrated belief (P=${Number.isFinite(p) ? p : "n/a"} ≥ ${low}) — trust` });
}

const DAY_MS = 86400000;
/**
 * evidenceAgeDays(outcomes, asOfMs) -> number | null. Age (in days) of the FRESHEST outcome's timestamp — the recency
 * of the belief. outcomes: array of records with an `at` (ISO string or epoch ms). Returns null when NO outcome carries
 * a usable timestamp (⇒ the caller omits evidenceAgeDays ⇒ classifyBelief treats the belief as fresh — honest: absence
 * of recency data is not evidence of staleness). This makes the staleness guard operational on real timestamped history.
 */
function evidenceAgeDays(outcomes: any, asOfMs: any): any {
  if (!Array.isArray(outcomes) || typeof asOfMs !== "number" || !Number.isFinite(asOfMs)) return null;
  let freshest: number | null = null;
  for (const o of outcomes) {
    if (!isObj(o) || o.at === undefined || o.at === null) continue;
    const ms = typeof o.at === "number" ? o.at : Date.parse(String(o.at));
    if (!Number.isFinite(ms)) continue;
    if (freshest === null || ms > freshest) freshest = ms;
  }
  if (freshest === null) return null;
  const age = Number(((asOfMs - freshest) / DAY_MS).toFixed(2));
  return age < 0 ? 0 : age;   // future timestamp ⇒ treat as fresh (0), never negative
}

const BELIEF_REFRESH_CONTRACT = Object.freeze({
  id: "V327-BELIEF-REFRESH",
  purpose: "§4/§5 — keep a calibrated belief OVERTURN-ABLE: a settled (CALIBRATED) belief is acted on only while FRESH; once STALE it must be RE-PROBED, guarding against the world-reference self-reinforcing-error failure mode of reflective memory",
  reference: Object.freeze(["Reflexion (Shinn et al., arXiv:2303.11366) — reflective memory", "Memory for Autonomous LLM Agents (arXiv:2603.07670) — self-reinforcing error warning", "composes calibration.ts staleness (ageDays vs maxAgeDays) — not reimplemented"]),
  invariants: Object.freeze([
    "a CALIBRATED belief is TRUSTED only while FRESH; STALE (age > maxAgeDays) ⇒ RE_PROBE_STALE (overturn-able) — never permanent avoidance",
    "not-CALIBRATED ⇒ PROBE (gather) — no settled belief to act on; never escalate/avoid on thin evidence",
    "no age supplied ⇒ treated as fresh (backward-compatible; staleness is opt-in by passing an age)",
    "PURE/deterministic/frozen; age injected (no clock); composes calibration staleness, no reimplementation",
  ]),
});

module.exports = { classifyBelief, evidenceAgeDays, ACTION, BELIEF_REFRESH_CONTRACT };
export {};
