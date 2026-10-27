#!/usr/bin/env node
/**
 * portfolio-axes — the CTO portfolio INVARIANT guard. SIX distinct, simultaneously-active strategic workstreams
 * must all remain present; none may silently disappear or go dormant while runnable authorized work exists.
 *
 * Governance lineage (reconciled, not overwritten):
 *   V23 established FOUR axes A/B/C/D (preserved here verbatim in meaning).
 *   V24 EXTENDS to SIX — adds E (€50k high-value missions) and F (ISO / certification readiness).
 *
 *   A — ENTRY_OFFERS_EARLY_CASH      small standardized fast paid diagnostics / narrow assurance (early collections)
 *   B — MID_MARKET_PRODUCTIZED       larger audits, remediation, integration, recurring/packaged support (reuse A's assets)
 *   C — PREMIUM_ENTERPRISE           high-value €8k–€15k+ engagements (budget/authority/procurement/terms qualified)
 *   D — PARTNERS_DISTRIBUTION        integrators/consultancies/resellers; kits, licensing, transparent commissions
 *   E — HIGH_VALUE_MISSIONS_50K      enterprise missions up to €50k (no artificial ceiling when justified); precise SOW,
 *                                    business case, milestones, acceptance, delivery-capacity + margin — price justified
 *                                    by scope/value/evidence/capacity, NEVER set merely to hit a revenue target
 *   F — ISO_CERTIFICATION_READINESS  end-to-end readiness for relevant standards (27001/42001/9001 where justified):
 *                                    clause→control→evidence mapping + dossier. Readiness ≠ certification; a generated
 *                                    policy is not proof of implementation; never claim conformity without competent-body evidence
 *
 * This module does NOT redefine the other A/B/C/D meanings elsewhere (commercial-portfolio "voies" track labels;
 * niche-scoring switchDecision; revenue-channels SOLO/RECURRING/PARTNER/SUBCONTRACT; FIELD_DOSSIER niches). It is the
 * STRUCTURAL guard — a regression that collapses the program to one strategy FAILS a test instead of passing silently.
 *
 * Honesty/fail-closed: a missing axis, or an axis neither actionable nor explicitly blocked while OTHER axes still have
 * runnable work, is a VIOLATION. A genuinely blocked axis (recorded blocker) is NOT — the others continue. Readiness
 * states for F (NOT_STARTED…EXTERNALLY_CERTIFIED) are documented; economics stay in commercial-portfolio. Pure/deterministic.
 */
"use strict";

export interface Axis { id: string; name: string; meaning: string; }
const AXES: readonly Axis[] = Object.freeze([
  { id: "A", name: "ENTRY_OFFERS_EARLY_CASH", meaning: "small standardized fast paid diagnostics / narrowly-scoped assurance — validate demand + early collections + reusable delivery assets" },
  { id: "B", name: "MID_MARKET_PRODUCTIZED", meaning: "larger audits, remediation, integration, recurring/packaged support — reuse A's validated assets to raise ACV + delivery efficiency" },
  { id: "C", name: "PREMIUM_ENTERPRISE", meaning: "high-value engagements €8k–€15k+ where scope+evidence support the price — qualify budget/urgency/authority/procurement/terms; model staffing/subcontracting first" },
  { id: "D", name: "PARTNERS_DISTRIBUTION", meaning: "integrators/consultancies/specialists/distributors — partner propositions, repeatable delivery kits, licensing/resale, transparent commission economics" },
  { id: "E", name: "HIGH_VALUE_MISSIONS_50K", meaning: "enterprise missions up to €50k (no artificial ceiling when justified) — precise SOW, business case, milestones, acceptance, delivery-capacity + margin; price justified by scope/value/evidence, never set to hit a target" },
  { id: "F", name: "ISO_CERTIFICATION_READINESS", meaning: "end-to-end readiness for relevant standards (27001/42001/9001 where justified) — clause→control→evidence mapping + dossier; readiness≠certification; never claim conformity without competent-body evidence" },
]);
const REQUIRED_AXIS_IDS: readonly string[] = Object.freeze(AXES.map((a) => a.id));

// F readiness vocabulary (reuses project conventions; documented so a regression on F states is detectable).
const READINESS_STATES: readonly string[] = Object.freeze([
  "NOT_STARTED", "DRAFTED", "IMPLEMENTED", "EVIDENCE_COLLECTED", "INTERNALLY_VERIFIED", "GAP", "STALE", "BLOCKED", "EXTERNALLY_CERTIFIED",
]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function nonEmptyString(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function nonEmptyArray(v: any): boolean { return Array.isArray(v) && v.length > 0; }

/** A workstream has a runnable action iff it declares a concrete nextAction and is not currently blocked. */
function hasRunnableAction(ws: any): boolean {
  if (!isObj(ws)) return false;
  return nonEmptyString(ws.nextAction) && !nonEmptyArray(ws.blockers);
}
/** An axis is explicitly blocked iff it records at least one blocker. */
function isBlocked(ws: any): boolean { return isObj(ws) && nonEmptyArray(ws.blockers); }
/** An axis is DORMANT iff it has neither a runnable next action nor a recorded blocker (silently dropped). */
function isDormant(ws: any): boolean { return isObj(ws) && !hasRunnableAction(ws) && !isBlocked(ws); }

/**
 * assessWorkstreams(workstreams, opts?): check the six-axis invariant.
 * workstreams: array of { axis, status, objective, nextAction, dependencies, blockers, evidence, reviewTrigger }
 * (an object keyed by axis id is also accepted). Returns { ok, violations[], axesPresent, runnable, blocked, dormant, byAxis }.
 */
function assessWorkstreams(workstreams: any, opts: any = {}): any {
  let list: any[];
  if (Array.isArray(workstreams)) list = workstreams;
  else if (isObj(workstreams)) list = Object.keys(workstreams).map((id) => Object.assign({ axis: id }, workstreams[id]));
  else return { ok: false, code: "INVALID_INPUT", detail: "workstreams must be an array or an object keyed by axis id" };

  const byAxis: Record<string, any> = {};
  for (const ws of list) { const id = isObj(ws) && nonEmptyString(ws.axis) ? ws.axis : "(unnamed)"; byAxis[id] = ws; }

  const violations: any[] = [];
  // (1) every required axis must be PRESENT — removing an axis is a regression.
  for (const id of REQUIRED_AXIS_IDS) {
    if (!(id in byAxis)) violations.push({ code: "MISSING_AXIS", axis: id, detail: `axis ${id} (${AXES.find((a) => a.id === id)!.name}) is absent — the six-axis invariant requires A+B+C+D+E+F` });
  }

  const runnable: string[] = [], blocked: string[] = [], dormant: string[] = [];
  for (const id of REQUIRED_AXIS_IDS) {
    const ws = byAxis[id];
    if (!ws) continue;
    if (hasRunnableAction(ws)) runnable.push(id);
    else if (isBlocked(ws)) blocked.push(id);
    else dormant.push(id);
  }

  // (2) a DORMANT axis (no next action, no recorded blocker) is a violation — it was silently dropped.
  for (const id of dormant) violations.push({ code: "DORMANT_AXIS", axis: id, detail: `axis ${id} has no concrete nextAction and no recorded blocker — supply a dependency-ready action or record the exact blocker` });

  // (3) CORE invariant: never collapse to ≤1 active axis while OTHER authorized work is available.
  const couldRun = REQUIRED_AXIS_IDS.filter((id) => byAxis[id] && !isBlocked(byAxis[id]));
  if (runnable.length <= 1 && couldRun.length >= 2) {
    violations.push({ code: "SINGLE_AXIS_COLLAPSE", detail: `only ${runnable.length} axis runnable but ${couldRun.length} axes are unblocked — the axes must run in parallel (interleaved if the runtime is sequential); do not idle other axes` });
  }

  return {
    ok: violations.length === 0,
    axisCount: REQUIRED_AXIS_IDS.length,
    axesPresent: REQUIRED_AXIS_IDS.filter((id) => id in byAxis),
    runnable, blocked, dormant,
    violations,
    byAxis: REQUIRED_AXIS_IDS.map((id) => ({ axis: id, name: AXES.find((a) => a.id === id)!.name, present: id in byAxis, status: (byAxis[id] && byAxis[id].status) || null, runnable: hasRunnableAction(byAxis[id]), blocked: isBlocked(byAxis[id]) })),
    note: "Six-axis invariant (V23 A-D + V24 E,F): A+B+C+D+E+F are simultaneous permanent workstreams. A blocked axis (recorded blocker) is allowed — the others continue. A missing or silently-dormant axis, or collapse to ≤1 active while others could run, is a VIOLATION. Economics live in commercial-portfolio; F readiness ≠ certification. This is the structural guard.",
  };
}

export { AXES, REQUIRED_AXIS_IDS, READINESS_STATES, hasRunnableAction, isBlocked, isDormant, assessWorkstreams };
module.exports = { AXES, REQUIRED_AXIS_IDS, READINESS_STATES, hasRunnableAction, isBlocked, isDormant, assessWorkstreams };

// Read-only CLI: print the canonical six axes + the invariant; mutates nothing.
if (require.main === module) {
  process.stdout.write(JSON.stringify({ model: "portfolio-axes/1", axes: AXES, readinessStates: READINESS_STATES, invariant: "A+B+C+D+E+F simultaneous; missing/dormant/single-axis-collapse ⇒ violation" }, null, 2) + "\n");
}
