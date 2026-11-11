#!/usr/bin/env node
"use strict";

/*
 * research-radar (mission M5, Phase 10 — governed research PLANNING layer) — PURE, deterministic, FAIL-CLOSED.
 * It decides WHICH watchlist topics are worth re-researching next and in what order, WITHOUT performing or
 * authorizing any egress. It consumes prior DATED findings (the shape research-governor.stampFinding emits,
 * tagged with a topic) and a watchlist, and emits a prioritized, DEDUPLICATED refresh plan. Every emitted
 * target still carries requiresGrant:true — it must pass research-governor.govern() with a valid grant before
 * any fetch, so the radar holds NO egress authority of its own. No I/O, no clock (nowMs injected), no randomness.
 *
 * REUSE (not reinvention): date validation (isIsoDate) and confidence banding (credName) are imported from
 * research-governor (M4) — the radar and the governor agree on provenance semantics by construction.
 *
 *  - planRadar(watchlist, findings, opts) → frozen { generatedAtMs, targets[], excluded[], dropped[] }.
 *      Due classification (fail-closed): NEVER_RESEARCHED (no dated finding) > STALE (age ≥ refreshAfterMs) /
 *      LOW_CONFIDENCE (best finding band LOW) ; FRESH_AND_CONFIDENT topics are excluded (not an error).
 *      Malformed time ⇒ every topic excluded INVALID_TIME (never a fabricated schedule). Duplicate topics are
 *      deduped (DUPLICATE_TOPIC). A maxTargets cap SURFACES the overflow in `dropped` (CAPACITY_BOUND) — never a
 *      silent truncation. Ordering is deterministic: score desc, then normalized topic asc.
 */

const GOV = require("./research-governor.js");           // REUSE M4: isIsoDate + credName (shared provenance semantics)

const DEFAULT_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;      // 7 days — a topic un-refreshed this long is "stale"
const DEFAULT_MAX_TARGETS = 10;
const CONF_RANK: Readonly<Record<string, number>> = Object.freeze({ LOW: 0, MEDIUM: 1, HIGH: 2 });
// Disjoint score BANDS so the due CLASS always dominates the (bounded) within-band tiebreaks. Guarantees the
// advertised order NEVER_RESEARCHED > STALE > LOW_CONFIDENCE for ANY priority/age: NEVER ∈ [3e6, 3e6+PR_MAX],
// STALE ∈ [2e6, 2e6+AGE_MAX+LOWCONF_BONUS+PR_MAX] (< 3e6), LOW_CONFIDENCE ∈ [1e6, 1e6+PR_MAX] (< 2e6).
const BAND_NEVER = 3_000_000, BAND_STALE = 2_000_000, BAND_LOWCONF = 1_000_000;
const AGE_MAX = 900_000, LOWCONF_BONUS = 50_000, PR_MAX = 999;

function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function isNum(v: any): boolean { return typeof v === "number" && Number.isFinite(v); }
function normTopic(t: any): string { return isStr(t) ? String(t).trim().toLowerCase() : ""; }
function posInt(v: any, dflt: number): number { return isNum(v) && v > 0 ? Math.floor(v) : dflt; }
// Fail-CLOSED cap coercion: an explicit non-negative cap is honoured (0 ⇒ emit none, all due surfaced as dropped);
// a provided-but-invalid cap (negative / NaN / non-number) ⇒ 0 (never fail-OPEN to the default = emit more egress).
function capOf(v: any, dflt: number): number { if (v === undefined) return dflt; return isNum(v) && v >= 0 ? Math.floor(v) : 0; }
// Deterministic, locale-INDEPENDENT codepoint comparison (no ICU/localeCompare cross-environment risk).
function cmpStr(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }

/** latestFinding(topicKey, findings, nowMs): most-recent VALID, NON-FUTURE-dated finding for a normalized topic. */
function latestFinding(topicKey: string, findings: any[], nowMs: number): any {
  let best: any = null, bestMs = -Infinity;
  for (const f of findings) {
    if (!f || typeof f !== "object") continue;
    if (normTopic(f.topic) !== topicKey) continue;
    if (!GOV.isIsoDate(f.date)) continue;                // reuse M4: an undated/garbage finding cannot prove freshness
    const ms = Date.parse(f.date);
    if (!Number.isFinite(ms)) continue;
    if (isNum(nowMs) && ms > nowMs) continue;            // future-dated provenance is not a freshness signal (no fail-open suppression)
    if (ms > bestMs) { bestMs = ms; best = f; }
  }
  return best ? { finding: best, atMs: bestMs } : null;
}

/**
 * planRadar(watchlist, findings, opts): rank which topics to re-research. PURE + deterministic + fail-closed.
 * watchlist item: { topic, allowedDomains?, refreshAfterMs?, priority? }. findings: tagged stampFinding outputs.
 * opts: { nowMs (required), maxTargets?, defaultRefreshAfterMs? }.
 */
function planRadar(watchlist: any, findings: any, opts: any = {}): any {
  const list: any[] = Array.isArray(watchlist) ? watchlist : [];
  const hist: any[] = Array.isArray(findings) ? findings : [];
  const o = opts && typeof opts === "object" ? opts : {};
  const nowMs = o.nowMs;
  const maxTargets = capOf(o.maxTargets, DEFAULT_MAX_TARGETS);
  const defaultRefresh = posInt(o.defaultRefreshAfterMs, DEFAULT_REFRESH_MS);

  const excluded: any[] = [];
  // fail-closed: without a valid clock we cannot judge staleness ⇒ schedule NOTHING (never a fabricated plan).
  if (!isNum(nowMs)) {
    for (const it of list) excluded.push(Object.freeze({ topic: (it && it.topic) ?? null, reason: "INVALID_TIME" }));
    return Object.freeze({ generatedAtMs: null, targets: Object.freeze([]), excluded: Object.freeze(excluded), dropped: Object.freeze([]) });
  }

  const seen = new Set<string>();
  const candidates: any[] = [];
  for (const it of list) {
    const topic = it && typeof it === "object" ? it.topic : it;
    const key = normTopic(topic);
    if (!key) { excluded.push(Object.freeze({ topic: topic ?? null, reason: "INVALID_TOPIC" })); continue; }
    if (seen.has(key)) { excluded.push(Object.freeze({ topic, reason: "DUPLICATE_TOPIC" })); continue; }
    seen.add(key);

    const refreshAfterMs = posInt(it && it.refreshAfterMs, defaultRefresh);
    const priority = isNum(it && it.priority) ? Math.floor(it.priority) : 0;
    const pr = Math.max(0, Math.min(PR_MAX, priority));  // bounded within-band tiebreak — CANNOT cross a due-class band
    const allowedDomains = Array.isArray(it && it.allowedDomains) ? it.allowedDomains.filter(isStr) : [];
    const latest = latestFinding(key, hist, nowMs);

    let dueReason: string | null = null;
    let score = 0;
    let lowConfidence = false;
    let ageMs: number | null = null;
    if (!latest) {
      dueReason = "NEVER_RESEARCHED";
      score = BAND_NEVER + pr;                            // never-seen topics outrank ANY refresh (band-separated)
    } else {
      ageMs = Math.max(0, nowMs - latest.atMs);
      const stale = ageMs >= refreshAfterMs;
      lowConfidence = (CONF_RANK[GOV.credName(latest.finding.confidence)] ?? 0) === 0;
      if (stale) {
        dueReason = "STALE";
        const ageContribution = Math.min(AGE_MAX, Math.floor((ageMs / refreshAfterMs) * 1000));
        score = BAND_STALE + ageContribution + (lowConfidence ? LOWCONF_BONUS : 0) + pr;   // STALE band < NEVER band
      } else if (lowConfidence) {
        dueReason = "LOW_CONFIDENCE";                     // fresh but weak evidence ⇒ worth strengthening
        score = BAND_LOWCONF + pr;                        // LOW_CONFIDENCE band < STALE band
      } else {
        excluded.push(Object.freeze({ topic, reason: "FRESH_AND_CONFIDENT" }));   // not due — honest, not an error
        continue;
      }
    }
    candidates.push({
      topic: String(topic), topicKey: key, dueReason, score, priority, ageMs, lowConfidence,
      allowedDomains: Object.freeze(allowedDomains), refreshAfterMs,
      lastDate: latest ? latest.finding.date : null,
      lastConfidence: latest ? GOV.credName(latest.finding.confidence) : null,
      requiresGrant: true,                               // radar holds NO egress authority — govern() + grant still required
      note: "requires research-governor.govern() ALLOW under a valid grant before any fetch",
    });
  }

  // Deterministic order: most-due first (score desc), ties broken by normalized topic (stable, no randomness).
  candidates.sort((a, b) => b.score - a.score || cmpStr(a.topicKey, b.topicKey));
  const targets = candidates.slice(0, maxTargets).map((c) => Object.freeze(c));
  // No silent cap: anything beyond maxTargets is SURFACED, never dropped silently.
  const dropped = candidates.slice(maxTargets).map((c) => Object.freeze({ topic: c.topic, score: c.score, dueReason: c.dueReason, reason: "CAPACITY_BOUND" }));

  return Object.freeze({
    generatedAtMs: nowMs,
    targets: Object.freeze(targets),
    excluded: Object.freeze(excluded),
    dropped: Object.freeze(dropped),
  });
}

/** proposeRequest(target): map a radar target to a research-governor.govern() request shape. Pure; no egress. */
function proposeRequest(target: any): any {
  const t = target && typeof target === "object" ? target : {};
  // D6 FIX — emit ONLY {query, urls}. The request never carried scoping authority (govern reads grant.allowedDomains, not the
  // request); a request-level allowedDomains was INERT and gave a false sense of scoping. Scope lives in the grant. With the
  // D1 fix, a query-only request is now domain-scoped by the grant's allowedDomains (fail-closed if the grant has none).
  return Object.freeze({ query: isStr(t.topic) ? t.topic : null, urls: Object.freeze([]) });
}

module.exports = { planRadar, proposeRequest, latestFinding, DEFAULT_REFRESH_MS, DEFAULT_MAX_TARGETS };
export {};
