#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V76 §4 — MISSION PRIORITY SELECTOR (ODG's native decision engine). Given candidate missions from the
 * canonical registers (each with the §4 attributes), it DETERMINISTICALLY scores + ranks them so ODG itself selects the
 * next mission — the technical provider does NOT hand-pick. Scoring criteria (V76 §4/§9): strategic importance, roadmap
 * priority, dependencies-unblocked-count, risk (lowers), immediate-executability, operational value, closure-with-proof.
 * A mission with an unmet dependency is DEFERRED (not selected) while independents proceed; already-ACCEPTED missions are
 * excluded (no repeat). PURE/deterministic (ties broken by id) so the choice is reproducible + justifiable. No new
 * primitive. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function num(v: any, d: number): number { return typeof v === "number" && isFinite(v) ? v : d; }
function clamp01(n: number): number { return Math.min(1, Math.max(0, n)); }

/*
 * scoreMission(m, allIds, acceptedIds) -> { eligible, score, factors, reason }. m:
 *   { id, strategicImportance(0..1), roadmapPriority(0..1), unblocks:[ids], risk(0..1), immediatelyExecutable(bool),
 *     operationalValue(0..1), closureWithProof(bool), deps:[ids], status }
 */
function scoreMission(m: any, acceptedIds: any): any {
  const a = new Set((Array.isArray(acceptedIds) ? acceptedIds : []).map(String));
  if (!isObj(m) || typeof m.id !== "string") return Object.freeze({ eligible: false, score: 0, reason: "malformed mission" });
  if (a.has(m.id) || m.status === "ACCEPTED") return Object.freeze({ eligible: false, score: 0, reason: "already ACCEPTED (no repeat)" });
  const depsMet = (Array.isArray(m.deps) ? m.deps : []).every((d: string) => a.has(String(d)));
  if (!depsMet) return Object.freeze({ eligible: false, score: 0, reason: "dependency unmet ⇒ DEFERRED (independents proceed)" });
  const unblocks = Array.isArray(m.unblocks) ? m.unblocks.length : 0;
  const factors = {
    strategicImportance: clamp01(num(m.strategicImportance, 0.5)),
    roadmapPriority: clamp01(num(m.roadmapPriority, 0.5)),
    unblocksNormalized: clamp01(unblocks / 3),
    immediatelyExecutable: m.immediatelyExecutable === true ? 1 : 0,
    operationalValue: clamp01(num(m.operationalValue, 0.5)),
    closureWithProof: m.closureWithProof === true ? 1 : 0,
    riskPenalty: clamp01(num(m.risk, 0.2)),
  };
  // weighted: importance + priority + unblocking + executability + value + closure, minus risk. Deterministic.
  const score = Number((
    0.22 * factors.strategicImportance + 0.18 * factors.roadmapPriority + 0.20 * factors.unblocksNormalized +
    0.15 * factors.immediatelyExecutable + 0.12 * factors.operationalValue + 0.13 * factors.closureWithProof -
    0.15 * factors.riskPenalty
  ).toFixed(4));
  return Object.freeze({ eligible: true, score, factors, reason: `eligible: deps met; unblocks ${unblocks}; executable=${factors.immediatelyExecutable === 1}` });
}

/* selectNext(candidates, acceptedIds) -> { selected, ranking, deferred }. ODG's native selection, deterministic. */
function selectNext(candidates: any, acceptedIds: any): any {
  const list = (Array.isArray(candidates) ? candidates : []).filter(isObj);
  const scored = list.map((m) => ({ id: m.id, ...scoreMission(m, acceptedIds) }));
  const eligible = scored.filter((s) => s.eligible).sort((a, b) => (b.score - a.score) || (a.id < b.id ? -1 : 1));
  const deferred = scored.filter((s) => !s.eligible).map((s) => ({ id: s.id, reason: s.reason }));
  const selected = eligible[0] || null;
  return Object.freeze({
    selected: selected ? { id: selected.id, score: selected.score, factors: selected.factors } : null,
    selectionJustification: selected ? `ODG selected '${selected.id}' — highest priority score ${selected.score} among ${eligible.length} eligible (${selected.reason})` : "no eligible mission (all accepted/deferred)",
    ranking: eligible.map((s) => ({ id: s.id, score: s.score })),
    deferred,
  });
}

const MISSION_PRIORITY_SELECTOR_CONTRACT = Object.freeze({
  id: "V76-MISSION-PRIORITY-SELECTOR", source: "CTO V76 §4 — ODG's native mission-selection decision engine",
  reuses: Object.freeze(["campaign-controller dep-order + NO-REPEAT discipline (composed, not duplicated)"]),
  criteria: Object.freeze(["strategicImportance", "roadmapPriority", "unblocks", "immediatelyExecutable", "operationalValue", "closureWithProof", "risk(penalty)"]),
  notAuthority: "ODG's own selector — it ranks + chooses deterministically so the choice is ODG's and reproducible; the provider never hand-picks",
  invariants: Object.freeze([
    "deterministic: same candidates+accepted ⇒ same selection (ties broken by id) — the decision is reproducible + justifiable",
    "a mission with an unmet dependency is DEFERRED, never selected; independents proceed",
    "an already-ACCEPTED mission is excluded (no repeat); malformed ⇒ ineligible",
    "ODG selects; the technical provider does not choose the mission; no new primitive",
  ]),
});

module.exports = { scoreMission, selectNext, MISSION_PRIORITY_SELECTOR_CONTRACT };
if (require.main === module) { process.stdout.write(JSON.stringify(MISSION_PRIORITY_SELECTOR_CONTRACT, null, 2) + "\n"); }
export {};
