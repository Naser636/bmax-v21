#!/usr/bin/env node
"use strict";

/*
 * V275 §2 (P0) — ODG UNIFIED GOVERNED EXECUTIVE SURFACE (deterministic). Connects the four merged executive capabilities into
 * ONE verifiable data flow (NOT a juxtaposition of tables): the §6 dashboard, the §7 decision engine, the V272 country-ranking
 * and the V274 market-entry decision. It produces a single prioritised GOVERNED decision queue with cross-recommendation
 * conflict/dependency analysis, a data-integrity roll-up, an authority/OWNER_GATED governance roll-up, and a traceable history.
 *
 * REUSE (no new engine/primitive): odg-executive-dashboard (buildDashboard) + odg-executive-decision-engine (evaluate) +
 * odg-country-ranking (rankCountries) + odg-market-entry-decision (proposeMarketEntry). This module ADDS only the unification:
 * merge + conflict/dependency detection + governance & integrity roll-ups + history.
 *
 * HONESTY: every indicator keeps the dashboard's single-source + status (ACTUAL/ESTIMATED/FORECAST/UNKNOWN/NO_DATA) and
 * freshness; UNKNOWN ≠ 0; NO decision is taken on UNKNOWN data (inherited); market entry stays level C (human approval, never
 * autonomous); conflicts/dependencies are DETECTED and surfaced, never auto-resolved or auto-executed. Deterministic/read-only.
 */

const DASH = require("./odg-executive-dashboard.js");           // V271 §6
const DECIDE = require("./odg-executive-decision-engine.js");   // V271 §7
const RANK = require("./odg-country-ranking.js");               // V272
const ENTRY = require("./odg-market-entry-decision.js");        // V274

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

// each decision gets a strategic "thrust" so opposing recommendations can be detected deterministically.
const THRUST: Record<string, string> = Object.freeze({
  DEC_OVERDUE: "PROTECT_CASH", DEC_MARGIN: "PROTECT_MARGIN", DEC_BLOCKED: "RESOLVE_OPS", DEC_OWNER_GATED: "GOVERNANCE",
  DEC_EVIDENCE: "GATHER_EVIDENCE", DEC_MARKET_ENTRY: "EXPAND", DEC_MARKET_ENTRY_EVIDENCE: "GATHER_EVIDENCE",
});
const SEVERITY: Record<string, number> = Object.freeze({ A: 1, B: 2, C: 3, D: 4 });

function thrustOf(id: string): string { return THRUST[id] || "OTHER"; }

/** buildSurface(input) -> the unified governed executive surface (dashboard + decisions + market ranking/entry, merged). */
function buildSurface(input: any): any {
  const i = isObj(input) ? input : {};

  // 1. dashboard (single source of truth per KPI, with status + freshness).
  const dashboard = DASH.buildDashboard(isObj(i.dashboard) ? i.dashboard : {});
  // 2. operational/financial decisions derived from the dashboard (never on UNKNOWN).
  const opDecisions = DECIDE.evaluate(dashboard, isObj(i.decisionPolicies) ? i.decisionPolicies : {});
  // 3. market ranking (transparent criteria) + 4. governed market-entry decision (always level C).
  const ranking = RANK.rankCountries(isObj(i.ranking) ? i.ranking : { countries: [] });
  const entry = ENTRY.proposeMarketEntry(ranking, isObj(i.entryPolicy) ? i.entryPolicy : {});

  // ---- merge all decisions into ONE governed queue (deterministic order: authority D>C>B>A, then id) ----
  const raw = arr(opDecisions.queue).concat(entry && entry.decision ? [entry.decision] : []);
  const decisions = raw.map((d: any) => Object.freeze({
    id: d.id, authorityLevel: d.authorityLevel, requiresApproval: d.requiresApproval, executionResult: d.executionResult,
    thrust: thrustOf(d.id), evidence: d.evidence, source: d.source, recommendedAction: d.recommendedAction,
  }));
  decisions.sort((x: any, y: any) => (SEVERITY[y.authorityLevel] || 0) - (SEVERITY[x.authorityLevel] || 0) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));

  // ---- conflict detection: an EXPAND recommendation while cash/margin PROTECTION is pending is a real governance conflict ----
  const ids = (t: string) => decisions.filter((d: any) => d.thrust === t).map((d: any) => d.id);
  const conflicts: any[] = [];
  const expands = ids("EXPAND"); const protects = ids("PROTECT_CASH").concat(ids("PROTECT_MARGIN"));
  for (const e of expands) for (const p of protects) conflicts.push(Object.freeze({ type: "CONFLICT", between: Object.freeze([e, p]), reason: "a market-EXPANSION recommendation co-exists with a pending cash/margin PROTECTION action — resolve financial protection before committing entry capacity (≤3-person constraint)" }));

  // ---- dependency detection: EXPAND / PROTECT depend on resolving GATHER_EVIDENCE first (no act on unknowns) ----
  const dependencies: any[] = [];
  const evidenceIds = ids("GATHER_EVIDENCE");
  for (const dep of decisions.filter((d: any) => d.thrust === "EXPAND" || d.thrust === "PROTECT_CASH" || d.thrust === "PROTECT_MARGIN"))
    for (const ev of evidenceIds) dependencies.push(Object.freeze({ type: "DEPENDENCY", decision: dep.id, dependsOn: ev, reason: "this action relies on indicators that are stale/unknown — resolve the evidence gap first" }));

  // ---- governance roll-up: authority mix + how many need approval / are owner-gated (C or D) ----
  const byAuthority = { A: 0, B: 0, C: 0, D: 0 };
  decisions.forEach((d: any) => { if (byAuthority[d.authorityLevel as keyof typeof byAuthority] !== undefined) byAuthority[d.authorityLevel as keyof typeof byAuthority]++; });
  const ownerGatedCount = byAuthority.C + byAuthority.D;
  const autonomousCount = decisions.filter((d: any) => d.requiresApproval === false).length;

  // ---- data-integrity roll-up: stale/unknown/contradiction signals from the single-source dashboard ----
  const dt = dashboard.statusTally || {};
  const dataIntegrity = Object.freeze({
    kpiCount: dashboard.kpiCount, actual: dt.ACTUAL || 0, estimated: dt.ESTIMATED || 0, forecast: dt.FORECAST || 0,
    unknown: (dt.UNKNOWN || 0), noData: (dt.NO_DATA || 0), stale: dashboard.staleCount || 0,
    decidable: (dt.UNKNOWN || 0) + (dt.NO_DATA || 0) === 0,
  });

  // ---- traceable decision history (deterministic ordered log; every decision → its evidence/source) ----
  const history = decisions.map((d: any, idx: number) => Object.freeze({ seq: idx, decisionId: d.id, authorityLevel: d.authorityLevel, thrust: d.thrust, evidence: d.evidence, source: d.source }));

  const marketRanking = ranking.ok === true ? Object.freeze({ rankedCount: ranking.rankedCount, top: ranking.ranking[0] ? ranking.ranking[0].code : null, excludedCount: ranking.excludedCount }) : Object.freeze({ rankedCount: 0, top: null, excludedCount: 0 });

  return Object.freeze({
    ok: true,
    dashboard: Object.freeze({ kpiCount: dashboard.kpiCount, statusTally: dashboard.statusTally, staleCount: dashboard.staleCount }),
    marketRanking, marketEntry: entry && entry.decision ? Object.freeze({ hasCandidate: entry.hasCandidate, top: entry.topCountry ? entry.topCountry.code : null, authorityLevel: entry.decision.authorityLevel, requiresApproval: entry.decision.requiresApproval }) : null,
    decisionQueue: Object.freeze(decisions), decisionCount: decisions.length,
    conflicts: Object.freeze(conflicts), dependencies: Object.freeze(dependencies),
    governance: Object.freeze({ byAuthority: Object.freeze(byAuthority), ownerGatedCount, autonomousCount, allMarketEntryGated: decisions.filter((d: any) => d.thrust === "EXPAND").every((d: any) => d.authorityLevel === "C" && d.requiresApproval === true) }),
    dataIntegrity, history: Object.freeze(history),
    note: "unified governed executive surface COMPOSING dashboard/decision-engine/country-ranking/market-entry (no new engine). Single source per KPI with status+freshness; UNKNOWN ≠ 0; NO decision on UNKNOWN; market entry stays level C (human approval, never autonomous). Conflicts (EXPAND vs PROTECT) and dependencies (act vs GATHER_EVIDENCE) are DETECTED and surfaced, never auto-resolved/auto-executed. Deterministic/read-only.",
  });
}

const EXECUTIVE_SURFACE_CONTRACT = Object.freeze({
  id: "V275-ODG-EXECUTIVE-SURFACE",
  source: "V275 §2 (P0) — unified governed executive surface",
  reuses: Object.freeze(["odg-executive-dashboard (V271 §6)", "odg-executive-decision-engine (V271 §7)", "odg-country-ranking (V272)", "odg-market-entry-decision (V274)"]),
  invariants: Object.freeze([
    "COMPOSES the four executive capabilities into ONE verifiable flow — no new engine/scheduler/primitive; a real data flow, not juxtaposed tables",
    "single source of truth per KPI (from the dashboard) with status (ACTUAL/ESTIMATED/FORECAST/UNKNOWN/NO_DATA) + freshness; UNKNOWN ≠ 0",
    "NO decision on UNKNOWN (inherited from the decision engine); market entry is ALWAYS level C (human approval, never autonomous); executionResult null",
    "cross-recommendation CONFLICTS (EXPAND vs cash/margin PROTECTION) and DEPENDENCIES (act vs GATHER_EVIDENCE) are DETECTED and surfaced — never auto-resolved or auto-executed",
    "governance roll-up (authority A/B/C/D, owner-gated count) + data-integrity roll-up (unknown/stale ⇒ decidable flag) + traceable decision history; deterministic/read-only",
  ]),
});

module.exports = { THRUST, buildSurface, EXECUTIVE_SURFACE_CONTRACT };

export {};
