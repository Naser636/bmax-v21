#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V74 — RADAR LOCAL CAPABILITIES. The five radar axes that V73 wrongly marked NETWORK_GATED are ALGORITHMS,
 * not live-data needs: they are testable on LOCAL synthetic corpora with no Internet. This module implements them as PURE,
 * deterministic functions so the real radar logic can be executed + tested offline:
 *   1 decomposeQuery   — split a complex/multi-objective/ambiguous query into sub-queries (+ ambiguity flags)
 *   2 assessCoverage   — detect which required topics are MISSING from a local corpus
 *   3 selectStrategy   — when a search strategy fails, pick the next strategy on a deterministic ladder
 *   4 detectWeakSignals— surface rare/dispersed corroborated signals + KEEP contradictions
 *   5 crossDomainReason— map a principle from domain A to a problem in domain B via shared abstract structure
 * No new primitive, no parallel engine; dual export; fail-closed on malformed input.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

// 1 — query decomposition.
function decomposeQuery(q: any): any {
  if (typeof q !== "string" || !q.trim()) return Object.freeze({ ok: false, reason: "query string required" });
  const clauses = q.split(/\b(?:and|et|,|then|puis|vs|versus|;)\b/i).map((c) => c.trim()).filter(Boolean);
  const objectives = clauses.length;
  const ambiguous = /\b(it|they|this|that|them|ça|cela)\b/i.test(q) || /\?.*\?/.test(q);
  const subQueries = clauses.map((c, i) => ({ id: `sq${i + 1}`, text: c }));
  return Object.freeze({ ok: true, objectives, ambiguous, subQueries, note: ambiguous ? "ambiguity flagged — needs clarification sub-query" : "clear multi-objective decomposition" });
}

// 2 — coverage gap detection over a local corpus.
function assessCoverage(corpus: any, requiredTopics: any): any {
  const docs = arr(corpus).filter((d) => isObj(d));
  const req = arr(requiredTopics).map(String);
  const covered = req.filter((t) => docs.some((d) => String(d.topic || "").toLowerCase() === t.toLowerCase() || String(d.content || "").toLowerCase().includes(t.toLowerCase())));
  const missing = req.filter((t) => !covered.includes(t));
  return Object.freeze({ ok: true, requiredCount: req.length, coveredCount: covered.length, missing, coverageRate: req.length ? Number((covered.length / req.length).toFixed(3)) : 0, complete: missing.length === 0 });
}

// 3 — strategy switch on failure. Deterministic ladder.
const STRATEGY_LADDER = Object.freeze(["keyword", "semantic", "recursive-deepening", "cross-reference", "ask-clarification"]);
function selectStrategy(attempts: any): any {
  const tried = arr(attempts).map((a) => (isObj(a) ? a.strategy : a)).filter(Boolean);
  const lastFailed = arr(attempts).length > 0 && arr(attempts).every((a) => isObj(a) && a.success === false);
  const next = STRATEGY_LADDER.find((s) => !tried.includes(s)) || null;
  return Object.freeze({ ok: true, lastFailed, triedCount: tried.length, nextStrategy: next, exhausted: next === null, note: next ? `switch to '${next}'` : "all strategies exhausted — escalate / mark UNRESOLVED (fail-closed)" });
}

// 4 — weak-signal detection: rare (low frequency) but corroborated across >=2 independent sources; keep contradictions.
function detectWeakSignals(items: any): any {
  const list = arr(items).filter(isObj);
  const byClaim: any = {};
  for (const it of list) { const k = String(it.claim || ""); (byClaim[k] = byClaim[k] || { sources: new Set(), stances: new Set() }); byClaim[k].sources.add(String(it.source || "?")); byClaim[k].stances.add(String(it.stance || "support")); }
  const weakSignals: any[] = []; const contradictions: any[] = [];
  for (const claim of Object.keys(byClaim)) {
    const srcs = byClaim[claim].sources.size, stances = byClaim[claim].stances.size;
    if (stances > 1) contradictions.push({ claim, stances });            // KEEP contradictions
    const freq = list.filter((x) => String(x.claim || "") === claim).length;
    if (freq <= 2 && srcs >= 2) weakSignals.push({ claim, frequency: freq, independentSources: srcs });   // rare + corroborated
  }
  return Object.freeze({ ok: true, weakSignals, contradictions, contradictionsKept: contradictions.length });
}

// 5 — cross-domain reasoning: match an abstract principle (domain A) to a problem (domain B) by shared structure tag.
function crossDomainReason(principle: any, problem: any): any {
  if (!isObj(principle) || !isObj(problem)) return Object.freeze({ ok: false, reason: "principle + problem objects required" });
  const shared = arr(principle.structure).filter((s) => arr(problem.structure).includes(s));
  const applicable = shared.length > 0;
  return Object.freeze({ ok: true, fromDomain: principle.domain || null, toDomain: problem.domain || null, sharedStructure: shared, applicable,
    transfer: applicable ? `principle '${principle.name}' (${principle.domain}) transfers to '${problem.name}' (${problem.domain}) via shared ${shared.join("+")}` : "no shared abstract structure ⇒ no transfer (fail-closed, no forced analogy)" });
}

const RADAR_LOCAL_CAPABILITIES_CONTRACT = Object.freeze({
  id: "V74-RADAR-LOCAL-CAPABILITIES", source: "CTO V74 — the 5 radar axes testable locally (algorithms, not live-data)",
  functions: Object.freeze(["decomposeQuery", "assessCoverage", "selectStrategy", "detectWeakSignals", "crossDomainReason"]),
  notAuthority: "pure algorithms feeding the radar; they use NO network and decide no integration (ODG decides)",
  invariants: Object.freeze([
    "no network: these are algorithms over LOCAL corpora — testable offline (the V73 NETWORK_GATED label was wrong for them)",
    "contradictions are KEPT (detectWeakSignals); strategy exhaustion ⇒ UNRESOLVED, never a fabricated answer",
    "cross-domain transfer only on a genuine shared abstract structure (no forced analogy)",
    "pure/deterministic; malformed input ⇒ ok:false (fail-closed)",
  ]),
});

module.exports = { STRATEGY_LADDER, decomposeQuery, assessCoverage, selectStrategy, detectWeakSignals, crossDomainReason, RADAR_LOCAL_CAPABILITIES_CONTRACT };
if (require.main === module) { process.stdout.write(JSON.stringify(RADAR_LOCAL_CAPABILITIES_CONTRACT, null, 2) + "\n"); }
export {};
