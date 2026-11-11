#!/usr/bin/env node
"use strict";

/*
 * spend-governor (mission G1) — PURE, deterministic, FAIL-CLOSED multi-dimensional spend governor. It closes the three
 * governance gaps surfaced by V104/F6 (no per-provider cap, no daily cap, no repeated-action/loop guard) and tightens the
 * per-mission cap. It does NOT duplicate the money primitives: budget-ledger.ts still owns the AVAILABLE→RESERVED→
 * COMMITTED→SPENT lifecycle and launch-budget.ts the global cash plan; this module adds the DIMENSIONAL admission
 * decision (per provider / per UTC day / per mission / global) plus an anti-loop guard, over a flat log of prior ADMITTED
 * spends. No I/O, no clock (nowMs is injected), no network.
 *
 * govern(request, history, caps, nowMs) → frozen { decision: ADMIT|DENY, reasons[], usage }. Deny-by-default:
 *   - invalid request/amount/time                      ⇒ DENY
 *   - a defined cap would be exceeded by this request  ⇒ DENY (all breached caps reported)
 *   - per-provider policy active but the provider has NO cap and NO default ⇒ DENY UNCAPPED_PROVIDER (never spend blind)
 *   - the same actionKey already occurred >= loop.maxRepeats within loop.windowMs ⇒ DENY LOOP_GUARD (oscillation/runaway)
 * A zero spend (amount===0) is always admissible (never moves a total past a cap). record() appends an admitted spend.
 *
 * CONTRACT NOTES: (a) a PRESENT but malformed cap/loop value is a configuration error and DENIES (fail-closed), rather
 * than silently disabling that dimension; an ABSENT dimension is simply unconfigured. (b) the loop guard keys on exact
 * actionKey equality — callers MUST pass a STABLE actionKey for the class of action being rate-limited (varying the key
 * per call defeats the guard by design). (c) history amounts that are not non-negative finite numbers are ignored by the
 * sums (they cannot reduce a total).
 */

export type Decision = "ADMIT" | "DENY";
const DECISION = Object.freeze({ ADMIT: "ADMIT" as Decision, DENY: "DENY" as Decision });
const REASON = Object.freeze({
  INVALID_REQUEST: "INVALID_REQUEST", INVALID_AMOUNT: "INVALID_AMOUNT", INVALID_TIME: "INVALID_TIME", INVALID_HISTORY: "INVALID_HISTORY",
  GLOBAL_CAP: "GLOBAL_CAP", PROVIDER_CAP: "PROVIDER_CAP", UNCAPPED_PROVIDER: "UNCAPPED_PROVIDER", DAILY_CAP: "DAILY_CAP", MISSION_CAP: "MISSION_CAP", LOOP_GUARD: "LOOP_GUARD",
  // a PRESENT but malformed cap/loop config fails CLOSED (deny), never silently disables a dimension:
  INVALID_GLOBAL_CAP: "INVALID_GLOBAL_CAP", INVALID_DAILY_CAP: "INVALID_DAILY_CAP", INVALID_MISSION_CAP: "INVALID_MISSION_CAP", INVALID_PROVIDER_CONFIG: "INVALID_PROVIDER_CONFIG", INVALID_LOOP_CONFIG: "INVALID_LOOP_CONFIG",
});

function isNum(v: any): boolean { return typeof v === "number" && Number.isFinite(v); }
function isNonNeg(v: any): boolean { return isNum(v) && v >= 0; }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function utcDay(ms: number): string { const d = new Date(ms); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`; }

// Resolve the per-provider cap. caps.perProvider may be { default?, caps?: {<provider>: number} } OR a flat
// { <provider>: number, default?: number } map. Returns undefined when neither a provider-specific nor a default cap
// exists — that absence is intentionally treated as DENY (UNCAPPED_PROVIDER) by the caller (fail-closed).
function resolveProviderCap(pp: any, provider: string): number | undefined {
  if (!pp || typeof pp !== "object") return undefined;
  const nested = pp.caps && typeof pp.caps === "object" ? pp.caps : null;
  const specific = nested ? nested[provider] : pp[provider];
  if (isNonNeg(specific)) return specific;
  if (isNonNeg(pp.default)) return pp.default;
  return undefined;
}

function sum(history: any[], pred: (r: any) => boolean): number {
  let s = 0;
  for (const r of history) { if (pred(r) && isNonNeg(r.amount)) s += r.amount; }
  return s;
}

function govern(request: any, history: any, caps: any, nowMs: any): any {
  const reasons: string[] = [];
  const req = request && typeof request === "object" ? request : {};
  const c = caps && typeof caps === "object" ? caps : {};
  const hist: any[] = Array.isArray(history) ? history : [];
  if (!Array.isArray(history)) reasons.push(REASON.INVALID_HISTORY);
  if (!isStr(req.provider) || !isStr(req.mission) || !isStr(req.actionKey)) reasons.push(REASON.INVALID_REQUEST);
  if (!isNonNeg(req.amount)) reasons.push(REASON.INVALID_AMOUNT);
  if (!isNum(nowMs)) reasons.push(REASON.INVALID_TIME);
  // On any structural invalidity, stop here — fail closed, do not compute against garbage.
  if (reasons.length) return Object.freeze({ decision: DECISION.DENY, reasons: Object.freeze(reasons.slice()), usage: Object.freeze({}) });

  // Caps-config validation (fail-closed CONSISTENCY): a PRESENT dimension with a malformed value must DENY, never be
  // silently skipped — otherwise a typo'd cap (e.g. the string "1000", a negative, NaN, or Infinity window) removes the
  // protection. Mirrors the per-provider dimension's deny-by-default posture. An ABSENT dimension stays unconfigured.
  const has = (k: string): boolean => Object.prototype.hasOwnProperty.call(c, k);
  const cfg: string[] = [];
  if (has("global") && !isNonNeg(c.global)) cfg.push(REASON.INVALID_GLOBAL_CAP);
  if (has("perDay") && !isNonNeg(c.perDay)) cfg.push(REASON.INVALID_DAILY_CAP);
  if (has("perMission") && !isNonNeg(c.perMission)) cfg.push(REASON.INVALID_MISSION_CAP);
  if (has("perProvider") && (!c.perProvider || typeof c.perProvider !== "object")) cfg.push(REASON.INVALID_PROVIDER_CONFIG);
  if (has("loop") && (!c.loop || typeof c.loop !== "object" || !isNonNeg(c.loop.windowMs) || !isNonNeg(c.loop.maxRepeats))) cfg.push(REASON.INVALID_LOOP_CONFIG);
  if (cfg.length) return Object.freeze({ decision: DECISION.DENY, reasons: Object.freeze(cfg.slice()), usage: Object.freeze({ configError: true }) });

  const amount: number = req.amount;
  const globalSpent = sum(hist, () => true);
  const providerSpent = sum(hist, (r) => r.provider === req.provider);
  const daySpent = sum(hist, (r) => isNum(r.at) && utcDay(r.at) === utcDay(nowMs));
  const missionSpent = sum(hist, (r) => r.mission === req.mission);
  let loopCount = 0;
  if (c.loop && isNum(c.loop.windowMs) && isNum(c.loop.maxRepeats)) {
    for (const r of hist) { if (r.actionKey === req.actionKey && isNum(r.at) && r.at >= nowMs - c.loop.windowMs) loopCount++; }
  }

  if (isNonNeg(c.global) && globalSpent + amount > c.global) reasons.push(REASON.GLOBAL_CAP);
  if (c.perProvider && typeof c.perProvider === "object") {
    const cap = resolveProviderCap(c.perProvider, req.provider);
    if (cap === undefined) reasons.push(REASON.UNCAPPED_PROVIDER);
    else if (providerSpent + amount > cap) reasons.push(REASON.PROVIDER_CAP);
  }
  if (isNonNeg(c.perDay) && daySpent + amount > c.perDay) reasons.push(REASON.DAILY_CAP);
  if (isNonNeg(c.perMission) && missionSpent + amount > c.perMission) reasons.push(REASON.MISSION_CAP);
  if (c.loop && isNum(c.loop.windowMs) && isNum(c.loop.maxRepeats) && loopCount >= c.loop.maxRepeats) reasons.push(REASON.LOOP_GUARD);

  return Object.freeze({
    decision: reasons.length ? DECISION.DENY : DECISION.ADMIT,
    reasons: Object.freeze(reasons.slice()),
    usage: Object.freeze({ globalSpent, providerSpent, daySpent, missionSpent, loopCount, amount, provider: req.provider, mission: req.mission, day: utcDay(nowMs) }),
  });
}

// Append an ADMITTED spend to the history (pure; returns a new array). Callers should only record ADMIT decisions.
function record(history: any, request: any, nowMs: any): any[] {
  const hist: any[] = Array.isArray(history) ? history : [];
  return hist.concat([Object.freeze({ at: nowMs, provider: request.provider, mission: request.mission, amount: request.amount, actionKey: request.actionKey })]);
}

module.exports = { DECISION, REASON, govern, record, resolveProviderCap, utcDay };
export {};
