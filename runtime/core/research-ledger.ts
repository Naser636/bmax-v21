#!/usr/bin/env node
"use strict";

/*
 * research-ledger (mission M6, Phase 10 — OBSERVABILITY + anti-repeat over the governed-research subsystem).
 * PURE, deterministic, fail-closed. It makes the M4 governor + M5 radar subsystem OBSERVABLE without performing
 * or authorizing any egress: it records the egress DECISIONS govern() made and the dated findings stampFinding()
 * produced, DEDUPLICATING identical findings (anti-repeat: the same source+date+content is counted, never stored
 * twice), and summarizes the subsystem's behaviour (ALLOW/DENY tallies, top DENY reasons, per-domain ALLOW counts,
 * distinct vs repeated findings, confidence mix). The ledger is a plain accumulator the caller persists; record
 * functions mutate it + return a typed result; summarize() returns a FROZEN read-model. No I/O, no clock (the
 * caller supplies `at`), no randomness, no network — it holds NO egress authority.
 */

const DECISIONS = Object.freeze({ ALLOW: "ALLOW", DENY: "DENY" });
const SCHEMA_VERSION = 1;

function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function s(v: any): string { return String(v); }

/** emptyLedger(): a fresh accumulator. decisions[] is append-only; findings is keyed by dedup signature. */
function emptyLedger(): any { return { version: SCHEMA_VERSION, decisions: [], findings: {} }; }
function ensure(l: any): any { return isObj(l) && Array.isArray(l.decisions) && isObj(l.findings) ? l : emptyLedger(); }

/** findingKey(f): the dedup signature of a finding — normalized source + date + content. */
function findingKey(f: any): string | null {
  if (!isObj(f) || !isStr(f.content) || !isStr(f.source) || !isStr(f.date)) return null;
  return [s(f.source).trim(), s(f.date).trim(), s(f.content).trim()].join("\u0000");
}

/**
 * recordDecision(ledger, govResult, meta): append an egress-decision record from a research-governor.govern()
 * result. Fail-closed: a result without an ALLOW/DENY decision is refused (no record). meta.at is caller-supplied.
 */
function recordDecision(ledger: any, govResult: any, meta: any = {}): any {
  const l = ensure(ledger);
  if (!isObj(govResult) || (govResult.decision !== DECISIONS.ALLOW && govResult.decision !== DECISIONS.DENY)) {
    return { ok: false, reason: "INVALID_DECISION", ledger: l };
  }
  const reasons = Array.isArray(govResult.reasons) ? govResult.reasons.filter(isStr).map(s) : [];
  const domains = isObj(govResult.plan) && Array.isArray(govResult.plan.domains) ? govResult.plan.domains.filter(isStr).map(s) : [];
  const query = isObj(govResult.plan) && isStr(govResult.plan.query) ? s(govResult.plan.query) : (isObj(meta) && isStr(meta.query) ? s(meta.query) : null);
  l.decisions.push({ decision: govResult.decision, reasons, domains, query, at: isObj(meta) && isStr(meta.at) ? s(meta.at) : null });
  return { ok: true, reason: null, ledger: l };
}

/**
 * recordFinding(ledger, finding, meta): record a stampFinding() output. DEDUP by (source,date,content): a repeat
 * increments `count` + updates lastAt (anti-repeat — the same evidence is never stored twice). Fail-closed: a
 * finding missing content/source/date is refused. Returns { ok, deduped, key }.
 */
function recordFinding(ledger: any, finding: any, meta: any = {}): any {
  const l = ensure(ledger);
  const key = findingKey(finding);
  if (!key) return { ok: false, reason: "INVALID_FINDING", deduped: false, ledger: l };
  const at = isObj(meta) && isStr(meta.at) ? s(meta.at) : null;
  const prior = l.findings[key];
  if (prior) {
    prior.count += 1;
    if (at) prior.lastAt = at;
    return { ok: true, reason: null, deduped: true, key, ledger: l };
  }
  l.findings[key] = {
    content: s(finding.content), source: s(finding.source), date: s(finding.date),
    confidence: isStr(finding.confidence) ? s(finding.confidence).toUpperCase() : "LOW",   // fail-closed band
    count: 1, firstAt: at, lastAt: at,
  };
  return { ok: true, reason: null, deduped: false, key, ledger: l };
}

/** tally(arr): count occurrences of each string into a plain object. */
function tally(arr: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of arr) out[k] = (out[k] || 0) + 1;
  return out;
}

/** summarize(ledger): a FROZEN observability read-model over the subsystem's recorded behaviour. Pure. */
/** D4 FIX — detectContradictions(ledger): surface CONFLICTING evidence instead of silently accepting it. Groups well-formed
 * findings by (source|date) and flags any group whose findings carry materially DIFFERENT content — a contradiction the
 * governor/caller must resolve before treating the newest as settled fact. Pure; never throws. */
function detectContradictions(ledger: any): any {
  const l = ensure(ledger);
  const findings = (Object.values(l.findings).filter(isObj) as any[]).filter((f) => Number.isInteger(f.count) && f.count >= 1 && isStr(f.source) && isStr(f.date));
  const byKey: Record<string, Set<string>> = {};
  for (const f of findings) { const k = s(f.source).toLowerCase() + "|" + s(f.date); (byKey[k] = byKey[k] || new Set()).add(isStr(f.content) ? s(f.content).trim() : ""); }
  const conflicts = Object.keys(byKey).filter((k) => byKey[k].size > 1).sort().map((k) => Object.freeze({ key: k, distinctClaims: byKey[k].size, claims: Object.freeze(Array.from(byKey[k]).sort().map((c) => c.slice(0, 120))) }));
  return Object.freeze({ contradictions: Object.freeze(conflicts), hasContradictions: conflicts.length > 0, note: "same source+date, materially different content ⇒ conflicting evidence surfaced (never silently settled as the newest)." });
}

function summarize(ledger: any): any {
  const l = ensure(ledger);
  const contra = detectContradictions(l);
  const allow = l.decisions.filter((d: any) => isObj(d) && d.decision === DECISIONS.ALLOW);
  const deny = l.decisions.filter((d: any) => isObj(d) && d.decision === DECISIONS.DENY);
  // Only real ALLOW/DENY count toward the denominator — a corrupted persisted ledger padded with non-decision junk
  // cannot inflate the rate (total == allow + deny by construction).
  const total = allow.length + deny.length;
  const denyReasons = tally(deny.flatMap((d: any) => (Array.isArray(d.reasons) ? d.reasons : [])));
  const allowByDomain = tally(allow.flatMap((d: any) => (Array.isArray(d.domains) ? d.domains : [])));

  // Only well-formed findings (positive-INTEGER count) contribute — a corrupted persisted ledger with a
  // negative/fractional/non-numeric count can never produce a negative or fractional observation total.
  const findings = (Object.values(l.findings).filter(isObj) as any[]).filter((f) => Number.isInteger(f.count) && f.count >= 1);
  const totalObservations = findings.reduce((n, f) => n + f.count, 0);
  const byConfidence = tally(findings.map((f) => (isStr(f.confidence) ? s(f.confidence).toUpperCase() : "LOW")));

  return Object.freeze({
    version: SCHEMA_VERSION,
    decisions: Object.freeze({
      total,
      allow: allow.length,
      deny: deny.length,
      allowRate: total ? Number((allow.length / total).toFixed(4)) : null,   // null, never a fake 0/0; denom = real decisions only
      denyReasons: Object.freeze(denyReasons),
      allowByDomain: Object.freeze(allowByDomain),
    }),
    findings: Object.freeze({
      distinct: findings.length,
      totalObservations,
      repeated: totalObservations - findings.length,   // observations deduped away (anti-repeat evidence)
      byConfidence: Object.freeze(byConfidence),
    }),
    contradictions: Object.freeze({ count: contra.contradictions.length, hasContradictions: contra.hasContradictions, groups: contra.contradictions }),
  });
}

module.exports = { DECISIONS, SCHEMA_VERSION, emptyLedger, findingKey, recordDecision, recordFinding, summarize, detectContradictions };
export {};
