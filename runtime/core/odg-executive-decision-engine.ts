#!/usr/bin/env node
"use strict";

/*
 * V271 §7 (Agent 07) — ODG EXECUTIVE DECISION ENGINE (deterministic). Consumes the §6 executive dashboard and a supplied
 * policy set, and produces a PRIORITIZED decision queue. Each decision records the full §7 field set and carries an authority
 * level A/B/C/D (REUSES the V269 taxonomy — no second taxonomy). Deterministic/read-only (no clock/random/I/O).
 *
 * HARD INVARIANTS (§7):
 *   - A decision is NEVER taken on UNKNOWN/NO_DATA: an absent-evidence cell yields a level-A "GATHER_EVIDENCE" action, never a
 *     financial/operational decision on fabricated data.
 *   - Authority: A = autonomous (already authorized); B = conditional (only when ALL explicit guards pass, else escalates to C);
 *     C = human approval required; D = reserved professional/legal act — ODG prepares a complete dossier, NEVER executes.
 *   - No LLM / Ollama output can override deterministic policies, financial calculations or the Truth Lock. executionResult is
 *     ALWAYS null here (this engine proposes; it never self-executes a decision).
 *   - requiresApproval is true for C and D always, and for B unless its guards pass; false only for A.
 *
 * REUSE: odg-btp-company-management-coverage (V269 DECISION_LEVELS) + the §6 dashboard. No new engine/primitive.
 */

const COVERAGE = require("./odg-btp-company-management-coverage.js");  // V269 — DECISION_LEVELS (A/B/C/D)

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function isNum(v: any): boolean { return typeof v === "number" && isFinite(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

const AUTHORITY = Object.freeze(COVERAGE.DECISION_LEVELS.map((l: any) => l.level));   // ["A","B","C","D"] — reused, not redefined
const SEVERITY_RANK: Record<string, number> = Object.freeze({ A: 1, B: 2, C: 3, D: 4 });

/** requiresApproval(level, guardsPass) — A:no; B:only if guards fail; C/D: always. */
function requiresApproval(level: string, guardsPass: boolean): boolean {
  if (level === "A") return false;
  if (level === "B") return guardsPass !== true;
  return true;   // C, D
}

/** decision(spec) -> a frozen decision record with the full §7 field set. executionResult is ALWAYS null (propose, never self-execute). */
function decision(spec: any): any {
  const s = isObj(spec) ? spec : {};
  const level = AUTHORITY.indexOf(s.authorityLevel) >= 0 ? s.authorityLevel : "C";   // default to human approval (deny-by-default)
  const guardsPass = s.guardsPass === true;
  return Object.freeze({
    id: isStr(s.id) ? s.id : "DEC", condition: isStr(s.condition) ? s.condition : "", evidence: isStr(s.evidence) ? s.evidence : null,
    source: isStr(s.source) ? s.source : "UNKNOWN", currentState: isStr(s.currentState) ? s.currentState : null,
    policy: isStr(s.policy) ? s.policy : null, options: Object.freeze(arr(s.options).filter(isStr)), dependencies: Object.freeze(arr(s.dependencies).filter(isStr)),
    expectedBenefit: isStr(s.expectedBenefit) ? s.expectedBenefit : null, estimatedCost: isStr(s.estimatedCost) ? s.estimatedCost : null,
    risks: Object.freeze(arr(s.risks).filter(isStr)), reversibility: isStr(s.reversibility) ? s.reversibility : "unknown",
    confidence: isStr(s.confidence) ? s.confidence : "unknown", uncertainty: isStr(s.uncertainty) ? s.uncertainty : "unknown",
    recommendedAction: isStr(s.recommendedAction) ? s.recommendedAction : null,
    authorityLevel: level, requiresApproval: requiresApproval(level, guardsPass),
    executionResult: null,                                             // NEVER self-executed here
    validationEvidence: null,
    severityRank: SEVERITY_RANK[level] || 3,
  });
}

// find a dashboard cell by id across all sections.
function findCell(dash: any, id: string): any {
  if (!isObj(dash) || !isObj(dash.sections)) return null;
  for (const k of Object.keys(dash.sections)) { const hit = arr(dash.sections[k]).find((c: any) => c && c.id === id); if (hit) return hit; }
  return null;
}
function actualValue(cell: any): number | null { return isObj(cell) && cell.status === "ACTUAL" && isNum(cell.value) ? cell.value : null; }
// a usable numeric value for a cell whose status is a real datum (ACTUAL/ESTIMATED/FORECAST) — never UNKNOWN/NO_DATA.
function knownValue(cell: any): number | null { return isObj(cell) && isNum(cell.value) && cell.status !== "UNKNOWN" && cell.status !== "NO_DATA" ? cell.value : null; }

/** evaluate(dashboard, policies) -> prioritized decision queue derived deterministically from the §6 dashboard. */
function evaluate(dashboard: any, policies: any): any {
  const dash = isObj(dashboard) ? dashboard : {}; const pol = isObj(policies) ? policies : {};
  const decisions: any[] = [];

  // 1. OVERDUE receivables beyond the authorized ceiling ⇒ dunning. Level B (transactional, within rules) IF a dunning policy
  //    + ceiling are explicitly supplied (guards); otherwise it escalates to human approval. Never on UNKNOWN data.
  const overdue = actualValue(findCell(dash, "FIN_OVERDUE"));
  if (overdue !== null && isNum(pol.overdueCeilingMinor) && overdue > pol.overdueCeilingMinor) {
    const guardsPass = pol.dunningPolicyApproved === true;
    decisions.push(decision({ id: "DEC_OVERDUE", condition: "overdue receivables " + overdue + " > ceiling " + pol.overdueCeilingMinor, evidence: "FIN_OVERDUE", source: "dashboard A_FINANCIAL (V267)", currentState: "overdue=" + overdue, policy: "dunning within contract rules", options: ["send authorized reminder", "prepare recovery dossier", "escalate to owner"], expectedBenefit: "recover overdue cash", estimatedCost: "low (automated reminder)", risks: ["client relationship", "contested invoice"], reversibility: "high", confidence: "evidence-backed", uncertainty: "collection not guaranteed", recommendedAction: guardsPass ? "send the authorized dunning reminder (level B)" : "prepare recovery dossier for human approval", authorityLevel: "B", guardsPass }));
  }

  // 2. MARGIN erosion (realized < forecast) ⇒ review. Level C (financial significance). Only when BOTH cells are ACTUAL.
  const realized = actualValue(findCell(dash, "FIN_REALIZED_MARGIN")); const forecast = knownValue(findCell(dash, "FIN_FORECAST_MARGIN"));  // realized must be measured (ACTUAL); forecast is a FORECAST datum
  if (realized !== null && forecast !== null && realized < forecast) {
    decisions.push(decision({ id: "DEC_MARGIN", condition: "realized margin " + realized + " < forecast " + forecast + " (erosion " + (forecast - realized) + ")", evidence: "FIN_REALIZED_MARGIN", source: "dashboard A_FINANCIAL (V267→V266)", currentState: "erosion=" + (forecast - realized), policy: "margin-protection review", options: ["review quotation assumptions", "renegotiate change orders", "investigate cost overrun"], expectedBenefit: "protect margin on remaining work", estimatedCost: "analysis time", risks: ["further erosion if ignored"], reversibility: "medium", confidence: "evidence-backed", uncertainty: "cause not yet attributed", recommendedAction: "human review of the margin erosion before further commitment", authorityLevel: "C" }));
  }

  // 3. BLOCKED operational tasks ⇒ resolve. Level C (operational coordination needing human validation).
  const blocked = actualValue(findCell(dash, "OPS_BLOCKED"));
  if (blocked !== null && blocked > 0) {
    decisions.push(decision({ id: "DEC_BLOCKED", condition: blocked + " blocked task(s) with incomplete prerequisites", evidence: "OPS_BLOCKED", source: "dashboard C_OPERATIONAL (V266)", currentState: "blocked=" + blocked, policy: "schedule-dependency resolution", options: ["re-sequence tasks", "resolve prerequisite", "reallocate resources"], expectedBenefit: "unblock the schedule", estimatedCost: "coordination time", risks: ["cascading delay"], reversibility: "medium", confidence: "evidence-backed", uncertainty: "cause may be external", recommendedAction: "human review to resolve the blocking prerequisite", authorityLevel: "C" }));
  }

  // 4. OWNER_GATED missions ⇒ reserved act. Level D — ODG prepares a dossier, owner authorizes; NEVER forced READY.
  const ownerGated = actualValue(findCell(dash, "ODG_OWNER_GATED"));
  if (ownerGated !== null && ownerGated > 0) {
    decisions.push(decision({ id: "DEC_OWNER_GATED", condition: ownerGated + " OWNER_GATED mission(s) awaiting owner authorization", evidence: "ODG_OWNER_GATED", source: "dashboard F_ODG (ROADMAP)", currentState: "ownerGated=" + ownerGated, policy: "governance — owner authority only", options: ["prepare authorization dossier", "continue other eligible work"], expectedBenefit: "unblock gated work when owner authorizes", estimatedCost: "dossier prep", risks: ["forcing READY would breach governance"], reversibility: "n/a", confidence: "certain", uncertainty: "owner decision timing", recommendedAction: "prepare the exact decision dossier; do NOT force READY", authorityLevel: "D" }));
  }

  // 5. STALE or UNKNOWN financial evidence ⇒ GATHER_EVIDENCE. Level A (autonomous, reversible). NEVER decide on unknowns.
  const allCells = ([] as any[]).concat(...(isObj(dash.sections) ? Object.values(dash.sections) as any[] : []));
  const staleOrUnknown = allCells.filter((c: any) => c && (c.freshness === "STALE" || c.status === "UNKNOWN" || c.status === "NO_DATA"));
  if (staleOrUnknown.length > 0) {
    decisions.push(decision({ id: "DEC_EVIDENCE", condition: staleOrUnknown.length + " stale/unknown KPI cell(s) — cannot decide on them", evidence: staleOrUnknown[0].id, source: "dashboard freshness/status", currentState: "staleOrUnknown=" + staleOrUnknown.length, policy: "evidence-first (no decision on UNKNOWN)", options: ["re-collect the source evidence", "mark the KPI NO_DATA until refreshed"], expectedBenefit: "restore decidability", estimatedCost: "low (re-read sources)", risks: ["deciding on stale data would be unsound"], reversibility: "high", confidence: "certain", uncertainty: "none", recommendedAction: "re-collect evidence before any decision touching these KPIs", authorityLevel: "A" }));
  }

  // deterministic priority: highest authority first (D>C>B>A), then by id for stability.
  decisions.sort((x: any, y: any) => (y.severityRank - x.severityRank) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  const byLevel = (lv: string) => decisions.filter((d: any) => d.authorityLevel === lv).length;
  return Object.freeze({
    ok: true, decisionCount: decisions.length, queue: Object.freeze(decisions),
    byAuthority: Object.freeze({ A: byLevel("A"), B: byLevel("B"), C: byLevel("C"), D: byLevel("D") }),
    autonomousCount: decisions.filter((d: any) => d.requiresApproval === false).length,
    approvalRequiredCount: decisions.filter((d: any) => d.requiresApproval === true).length,
    note: "prioritized decision queue derived deterministically from the §6 dashboard. No decision on UNKNOWN/NO_DATA (⇒ level-A gather-evidence). A=autonomous, B=conditional (guards), C=human approval, D=reserved (dossier only). executionResult is always null — this engine proposes, never self-executes; no LLM overrides deterministic policy/finance/Truth Lock.",
  });
}

const EXECUTIVE_DECISION_ENGINE_CONTRACT = Object.freeze({
  id: "V271-ODG-EXECUTIVE-DECISION-ENGINE",
  source: "V271 §7 (Agent 07) — deterministic executive decision engine",
  authorityLevels: AUTHORITY,
  reuses: Object.freeze(["odg-btp-company-management-coverage (V269 DECISION_LEVELS A/B/C/D)", "odg-executive-dashboard (V271 §6 — the evidence source)"]),
  invariants: Object.freeze([
    "authority A/B/C/D REUSED from V269 (no 2nd taxonomy); requiresApproval true for C/D always, for B unless guards pass, false only for A",
    "NO decision on UNKNOWN/NO_DATA — absent evidence yields a level-A GATHER_EVIDENCE action, never a financial/operational decision on fabricated data",
    "level D (reserved professional/legal) ⇒ ODG prepares a dossier and NEVER executes; OWNER_GATED missions are never forced READY",
    "executionResult is ALWAYS null — this engine PROPOSES, never self-executes; no LLM/Ollama overrides deterministic policy, financial calculation or Truth Lock",
    "deterministic/read-only (no Date.now/Math.random/I/O); composes V269 + the §6 dashboard — no new engine/primitive; nothing OPERATIONAL claimed",
  ]),
});

module.exports = { AUTHORITY, requiresApproval, decision, evaluate, EXECUTIVE_DECISION_ENGINE_CONTRACT };

export {};
