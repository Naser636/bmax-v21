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

/*
 * V16.4 §3 — EXPLAINED STRATEGIC SELECTION (additive, opt-in). selectNext/scoreMission above are UNCHANGED (every existing
 * caller keeps its exact behaviour, including the documented id tie-break). selectNextExplained() is a second ENTRY POINT
 * of the SAME selector (not a second engine): it reuses scoreMission's eligibility gates (malformed / ACCEPTED / unmet
 * dependency) and adds, for callers that supply per-criterion evidence (e.g. odg-strategic-register):
 *   - INTERVAL scoring: a NOT_MEASURED criterion never defaults to 0.5 — it contributes 0 to the evidence score (lower
 *     bound) and its full weight to `uncertainty` (upper bound = lower + uncertainty);
 *   - NO id tie-break: candidates within `epsilon` of the leader form a tied set; declared secondary rules are applied in
 *     order; if none isolates one candidate ⇒ DECISION_REQUIRED (no choice is made by id);
 *   - high uncertainty (> uncertaintyMax) on the would-be choice ⇒ DECISION_REQUIRED with a PROPOSED candidate;
 *   - items with requiresOwnerAuthorization (financial / budget / external access / governance) are ranked but NEVER
 *     auto-selected; non-selectable statuses are excluded with a reason.
 * Output is a PROPOSAL record: selection ≠ authorization (the work item still needs PROPOSED → AUTHORIZED).
 */
const EXPLAINED_DEFAULTS = Object.freeze({
  epsilon: 0.02,
  uncertaintyMax: 0.5,
  nonSelectableStatuses: Object.freeze({
    ACCEPTED: "already ACCEPTED (no repeat)",
    PASS_IN_SCOPE: "acceptance criteria met within the contract scope; remaining items are recorded extensions, not this contract",
    BLOCKED: "blocked on an owner-gated / external condition",
    NOT_ADOPTED: "tested under a stated rule and not adopted; re-test only with new data",
    FAILED: "failed; a re-attempt needs a new strategy decision, not an automatic re-selection",
    NOT_MEASURED: "current state not measured; it must be measured before it can be selected",
    // V16.9 Phase 1 — statuses derived by odg-strategic-register CLOSE-1 / RES-1 from committed closure/resolution records
    CLOSED_PASS: "closed (all scoped steps validated, graded PASS) — further work is a new mission",
    CLOSED_PARTIAL: "closed as PARTIAL — further work is a new mission, not a re-grade",
    CLOSED_FAIL: "closed as FAIL — negative result preserved; a re-attempt needs a new mission",
    CLOSED_NOT_MEASURED: "closed as NOT_MEASURED — a new measurement needs a new mission",
    RESOLVED_BY_EVIDENCE: "resolved by a committed resolution record (fix merged + repro tests cited)",
  }),
  secondaryRules: Object.freeze(["R1_MORE_UNBLOCKING", "R2_LOWER_UNCERTAINTY", "R3_LOWER_RISK", "R4_HIGHER_EVIDENCE"]),
  riskCriterion: "costRiskComplexity",
  evidenceCriterion: "evidenceLevel",
});

const SECONDARY_RULE_TEXT: any = Object.freeze({
  R1_MORE_UNBLOCKING: "prefer the candidate that more OTHER register items depend on (deps edges stated in evidence)",
  R2_LOWER_UNCERTAINTY: "prefer the candidate with the lower uncertainty (less criterion weight NOT_MEASURED)",
  R3_LOWER_RISK: "prefer the candidate with the lower MEASURED cost/risk/complexity value (not applicable if any tied candidate has it NOT_MEASURED)",
  R4_HIGHER_EVIDENCE: "prefer the candidate with the higher MEASURED evidence level (not applicable if any tied candidate has it NOT_MEASURED)",
});

function r4(n: number): number { return Number(n.toFixed(4)); }

/* scoreExplained(m, weights, directions, multipliers?) -> { evidenceScore, upperBound, uncertainty, breakdown, measuredWeightShare }.
 * V17.6 OFB-APPLY-1 (odg-outcome-feedback, owner « V176 : DÉBLOCAGE FINAL » item 3): optional per-criterion `multipliers`
 * (name → finite number > 0; absent/invalid ⇒ 1) scale MEASURED contributions only; NOT_MEASURED still adds 0 + its weight to
 * uncertainty. When multipliers are given each row also carries baseContribution + multiplier and the result carries
 * baseEvidenceScore + scoreDelta (base kept). Without multipliers the output is byte-identical to the pre-V17.6 output. */
function scoreExplained(m: any, weights: any, directions: any, multipliers?: any): any {
  const mult = isObj(multipliers) ? multipliers : null;
  const names = Object.keys(weights).sort();
  const total = names.reduce((s, k) => s + num(weights[k], 0), 0) || 1;
  let lower = 0, unc = 0, base = 0;
  const breakdown: any[] = [];
  for (const k of names) {
    const w = num(weights[k], 0) / total;
    const c = isObj(m.criteria) && isObj(m.criteria[k]) ? m.criteria[k] : null;
    const measured = !!c && c.status === "MEASURED" && typeof c.value === "number" && isFinite(c.value);
    if (!measured) { unc += w; breakdown.push({ criterion: k, status: "NOT_MEASURED", weight: r4(w), contribution: 0, uncertaintyContribution: r4(w) }); continue; }
    const v = clamp01(c.value);
    const eff = directions && directions[k] === "LOWER_IS_BETTER" ? 1 - v : v;
    const mk = mult && typeof mult[k] === "number" && isFinite(mult[k]) && mult[k] > 0 ? mult[k] : 1;
    base += w * eff;
    lower += mult ? w * eff * mk : w * eff;
    breakdown.push({ criterion: k, status: "MEASURED", value: v, direction: directions && directions[k] === "LOWER_IS_BETTER" ? "LOWER_IS_BETTER" : "HIGHER_IS_BETTER", weight: r4(w), contribution: r4(mult ? w * eff * mk : w * eff), uncertaintyContribution: 0, ...(mult ? { baseContribution: r4(w * eff), multiplier: mk } : {}) });
  }
  if (mult) return Object.freeze({ evidenceScore: r4(lower), baseEvidenceScore: r4(base), scoreDelta: r4(r4(lower) - r4(base)), upperBound: r4(lower + unc), uncertainty: r4(unc), measuredWeightShare: r4(1 - unc), breakdown: Object.freeze(breakdown) });
  return Object.freeze({ evidenceScore: r4(lower), upperBound: r4(lower + unc), uncertainty: r4(unc), measuredWeightShare: r4(1 - unc), breakdown: Object.freeze(breakdown) });
}

function measuredValue(m: any, k: string): number | null {
  const c = isObj(m.criteria) && isObj(m.criteria[k]) ? m.criteria[k] : null;
  return c && c.status === "MEASURED" && typeof c.value === "number" && isFinite(c.value) ? clamp01(c.value) : null;
}

/*
 * selectNextExplained(candidates, options) -> frozen decision record. candidates: { id, status, deps:[ids],
 * requiresOwnerAuthorization:bool, ownerReason, criteria:{ name:{ status:"MEASURED"|"NOT_MEASURED", value } } }.
 * options: { weights (required, name→w), directions (name→"LOWER_IS_BETTER"), acceptedIds, epsilon, uncertaintyMax,
 * scoreMultipliers (V17.6 OFB-APPLY-1, optional: name→multiplier, passed only by odg-outcome-feedback.selectorOptions when ACTIVE),
 * nonSelectableStatuses, secondaryRules, riskCriterion, evidenceCriterion }.
 */
function selectNextExplained(candidates: any, options: any): any {
  const o = Object.assign({}, EXPLAINED_DEFAULTS, isObj(options) ? options : {});
  const weights = isObj(o.weights) ? o.weights : {};
  const list = (Array.isArray(candidates) ? candidates : []).filter((m: any) => isObj(m) && typeof m.id === "string");
  const accepted = (Array.isArray(o.acceptedIds) ? o.acceptedIds : []).map(String).concat(list.filter((m: any) => m.status === "ACCEPTED").map((m: any) => m.id));
  const adjusting = isObj(o.scoreMultipliers);   // V17.6 OFB-APPLY-1 — only when the caller passes multipliers (odg-outcome-feedback active)
  const unblockCount = (id: string) => list.filter((x: any) => Array.isArray(x.deps) && x.deps.map(String).includes(id)).length;
  const excluded: any[] = [];
  const ranked: any[] = [];
  for (const m of list) {
    const gate = scoreMission({ id: m.id, deps: m.deps, status: m.status }, accepted); // REUSED eligibility gates
    if (!gate.eligible) { excluded.push({ id: m.id, status: m.status, reason: gate.reason }); continue; }
    if (Object.prototype.hasOwnProperty.call(o.nonSelectableStatuses, m.status)) { excluded.push({ id: m.id, status: m.status, reason: o.nonSelectableStatuses[m.status] }); continue; }
    const s = scoreExplained(m, weights, o.directions, adjusting ? o.scoreMultipliers : undefined);
    ranked.push({ id: m.id, status: m.status, evidenceScore: s.evidenceScore, ...(adjusting ? { baseEvidenceScore: s.baseEvidenceScore, scoreDelta: s.scoreDelta } : {}), upperBound: s.upperBound, uncertainty: s.uncertainty, measuredWeightShare: s.measuredWeightShare, breakdown: s.breakdown, unblocks: unblockCount(m.id), requiresOwnerAuthorization: m.requiresOwnerAuthorization === true, ownerReason: m.requiresOwnerAuthorization === true ? (m.ownerReason || "owner authorization required") : null, autoSelectable: m.requiresOwnerAuthorization !== true, _m: m });
  }
  // display order: evidence score desc; equal scores are listed by id for READABILITY ONLY — the decision below never uses id.
  ranked.sort((a, b) => (b.evidenceScore - a.evidenceScore) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const pool = ranked.filter((r) => r.autoSelectable);
  const ownerGatedRanked = ranked.filter((r) => !r.autoSelectable).map((r) => ({ id: r.id, evidenceScore: r.evidenceScore, ownerReason: r.ownerReason }));
  const clean = (r: any) => { if (!r) return null; const { _m, ...rest } = r; return rest; };
  const base = { thresholds: { epsilon: o.epsilon, uncertaintyMax: o.uncertaintyMax }, secondaryRulesDeclared: o.secondaryRules.map((k: string) => ({ rule: k, text: SECONDARY_RULE_TEXT[k] || "unknown rule (ignored)" })), ranking: ranked.map(clean), excluded, ownerAuthorizationRequired: ownerGatedRanked, isProposalOnly: true, selectionIsNotAuthorization: "the selected item is a PROPOSAL: it still needs PROPOSED → AUTHORIZED before EXECUTING", ...(adjusting ? { scoreAdjustment: { multipliers: o.scoreMultipliers, provenance: isObj(o.scoreAdjustmentProvenance) ? o.scoreAdjustmentProvenance : null, note: "OFB-APPLY-1: evidenceScore = adjusted score (MEASURED contributions × multiplier); baseEvidenceScore kept on every ranked row; thresholds / eligibility / secondary rules unchanged" } } : {}) };
  if (pool.length === 0) return deepFreeze({ decision: "NO_ELIGIBLE", selected: null, proposed: null, tiedSet: [], justification: "no auto-selectable candidate (all excluded, deferred or owner-gated)", ...base });
  const top = pool[0].evidenceScore;
  let tied = pool.filter((r) => top - r.evidenceScore < o.epsilon);
  const steps: any[] = [];
  let resolvedBy: string | null = null;
  if (tied.length > 1) {
    for (const rule of o.secondaryRules) {
      let vals: any[] | null = null;
      let better: (a: number, b: number) => boolean = (a, b) => a > b;
      if (rule === "R1_MORE_UNBLOCKING") vals = tied.map((r) => r.unblocks);
      else if (rule === "R2_LOWER_UNCERTAINTY") { vals = tied.map((r) => r.uncertainty); better = (a, b) => a < b; }
      else if (rule === "R3_LOWER_RISK") { vals = tied.map((r) => measuredValue(r._m, o.riskCriterion)); better = (a, b) => a < b; }
      else if (rule === "R4_HIGHER_EVIDENCE") vals = tied.map((r) => measuredValue(r._m, o.evidenceCriterion));
      if (!vals) { steps.push({ rule, outcome: "UNKNOWN_RULE_IGNORED" }); continue; }
      if (vals.some((v) => v === null)) { steps.push({ rule, outcome: "NOT_APPLICABLE (a tied candidate has this value NOT_MEASURED)" }); continue; }
      const best = vals.reduce((b, v) => (better(v, b) ? v : b), vals[0]);
      const keep = tied.filter((_, i) => vals![i] === best);
      steps.push({ rule, values: tied.map((r, i) => ({ id: r.id, value: vals![i] })), kept: keep.map((r) => r.id), outcome: keep.length === tied.length ? "NO_DISCRIMINATION" : keep.length === 1 ? "RESOLVED" : "NARROWED" });
      tied = keep;
      if (tied.length === 1) { resolvedBy = rule; break; }
    }
  }
  const tiedIds = pool.filter((r) => top - r.evidenceScore < o.epsilon).map((r) => r.id);
  const proposedRule = "PROPOSED resolution (needs OWNER/ODG decision): measure the NOT_MEASURED criteria of the tied candidates (it is their unmeasured weight that keeps them tied or uncertain), or have the owner set an explicit priority in an owner-controlled field; never break by id";
  const couldOvertake = (leader: any) => pool.filter((r) => r.id !== leader.id && r.upperBound > leader.evidenceScore).map((r) => r.id);
  if (tied.length > 1) {
    return deepFreeze({ decision: "DECISION_REQUIRED", selected: null, proposed: null, tiedSet: tiedIds, remainingAfterRules: tied.map((r) => r.id), tieExplanation: `${tiedIds.length} candidates have evidence scores within epsilon ${o.epsilon} of the leader (${top}); declared secondary rules did not isolate one`, resolutionSteps: steps, proposedResolutionRule: proposedRule, justification: "ODG does not choose among the tied set by id; OWNER/ODG decision required", ...base });
  }
  const winner = tied[0];
  const overtake = couldOvertake(winner);
  const tieInfo = tiedIds.length > 1 ? { tiedSet: tiedIds, tieExplanation: `${tiedIds.length} candidates within epsilon ${o.epsilon} of the leader (${top})`, resolutionSteps: steps, resolvedBy, resolvedByText: SECONDARY_RULE_TEXT[resolvedBy as string] } : { tiedSet: [] };
  if (winner.uncertainty > o.uncertaintyMax) {
    return deepFreeze({ decision: "DECISION_REQUIRED", selected: null, proposed: { id: winner.id, evidenceScore: winner.evidenceScore, upperBound: winner.upperBound, uncertainty: winner.uncertainty }, ...tieInfo, couldOvertakeIfUnmeasuredWereFavourable: overtake, uncertaintyExplanation: `the would-be choice '${winner.id}' has uncertainty ${winner.uncertainty} > uncertaintyMax ${o.uncertaintyMax}: more than the declared share of criterion weight is NOT_MEASURED`, proposedResolutionRule: proposedRule, justification: `'${winner.id}' leads on measured evidence but the decision is not robust; OWNER/ODG decision required`, ...base });
  }
  return deepFreeze({
    decision: tiedIds.length > 1 ? "TIE_EXPLAINED" : "SELECTED",
    selected: { id: winner.id, evidenceScore: winner.evidenceScore, ...(adjusting ? { baseEvidenceScore: winner.baseEvidenceScore } : {}), upperBound: winner.upperBound, uncertainty: winner.uncertainty, breakdown: winner.breakdown },
    proposed: null, ...tieInfo,
    couldOvertakeIfUnmeasuredWereFavourable: overtake,
    justification: `ODG proposes '${winner.id}': evidence score ${winner.evidenceScore} (uncertainty ${winner.uncertainty} ≤ ${o.uncertaintyMax})` + (tiedIds.length > 1 ? `; tie of ${tiedIds.length} resolved by ${resolvedBy}: ${SECONDARY_RULE_TEXT[resolvedBy as string]}` : `; next best is ≥ epsilon ${o.epsilon} lower`) + (overtake.length ? `; ${overtake.length} candidate(s) could overtake only if their NOT_MEASURED criteria were favourable: ${overtake.join(", ")}` : ""),
    ...base,
  });
}

function deepFreeze(o: any): any { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(o[k]); } return o; }

const STRATEGIC_SELECTION_CONTRACT = Object.freeze({
  id: "V164-EXPLAINED-STRATEGIC-SELECTION", source: "owner directive V16.4 §3 — explicit criteria, no alphabetical choice",
  entryPoint: "selectNextExplained (opt-in); selectNext/scoreMission unchanged",
  invariants: Object.freeze([
    "NOT_MEASURED never defaults to a numeric value: it adds 0 to the evidence score and its weight to uncertainty",
    "no id tie-break: a tie within epsilon is resolved only by a declared secondary rule, else DECISION_REQUIRED",
    "uncertainty above uncertaintyMax on the would-be choice ⇒ DECISION_REQUIRED (proposed, not selected)",
    "requiresOwnerAuthorization items are ranked but never auto-selected",
    "eligibility gates are scoreMission's (reused, not duplicated); output is a PROPOSAL, never an authorization",
  ]),
});

module.exports = { scoreMission, selectNext, MISSION_PRIORITY_SELECTOR_CONTRACT, scoreExplained, selectNextExplained, EXPLAINED_DEFAULTS, SECONDARY_RULE_TEXT, STRATEGIC_SELECTION_CONTRACT };
if (require.main === module) { process.stdout.write(JSON.stringify(MISSION_PRIORITY_SELECTOR_CONTRACT, null, 2) + "\n"); }
export {};
