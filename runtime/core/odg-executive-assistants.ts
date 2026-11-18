#!/usr/bin/env node
"use strict";

/*
 * V276 §4 (P2 Lot 1) — ODG FUNCTIONAL EXECUTIVE ASSISTANTS: Direction générale, Finances, Pilotage commercial. These are
 * REAL functional assistants (role-scoped governed projections that answer their domain from live engine data), NOT descriptive
 * cards. Each runs over the unified executive surface (V275) and projects a role-appropriate view: the KPIs in its scope, the
 * governed decisions it OWNS (by thrust), the missing/unknown data it must flag, its authorised vs forbidden actions, and an
 * honest maturity card.
 *
 * REUSE (no duplication): odg-executive-surface (V275 — which already composes dashboard/decision/ranking/market-entry).
 *
 * HONESTY: an assistant PREPARES and RECOMMENDS; it NEVER executes a significant act. Any decision it owns keeps its authority
 * level (market entry / significant financial = level C human approval, never autonomous; executionResult null). UNKNOWN ≠ 0 —
 * missing data is surfaced, never fabricated. No assistant is claimed OPERATIONAL (no real company data). Deterministic/read-only.
 */

const SURFACE = require("./odg-executive-surface.js");   // V275 unified governed surface (reused; composes the 4 engines)

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

// Lot-1 assistant registry — mandate / scope / permissions. `ownsThrusts` = which governed-decision thrusts this role handles;
// `kpiSections` = which dashboard sections it projects.
const ASSISTANTS = Object.freeze({
  DIRECTION_GENERALE: Object.freeze({
    id: "DIRECTION_GENERALE", domain: "Direction générale",
    mandate: "oversee the whole company: priorities, risks, pending approvals, cross-domain conflicts; act autonomously ONLY on pre-authorized items (level A, or an owner-pre-approved level-B transactional action e.g. an authorized dunning reminder); escalate every level-C/D (significant) act",
    kpiSections: Object.freeze(["A_FINANCIAL", "C_OPERATIONAL", "E_COMPANY", "F_ODG"]),
    ownsThrusts: Object.freeze(["GOVERNANCE", "RESOLVE_OPS"]),           // owner-gated items + operational blockers surface here
    oversight: true,                                                      // sees the full governed queue + conflicts
    authorizedActions: Object.freeze(["review the governed queue", "sequence priorities", "flag conflicts for arbitration", "approve level-A autonomous items"]),
    forbiddenActions: Object.freeze(["execute a level-C/D decision autonomously", "authorize spend", "sign/commit externally"]),
  }),
  FINANCES: Object.freeze({
    id: "FINANCES", domain: "Direction financière",
    mandate: "monitor cash, receivables, margin and supplier cost; detect overdue/erosion; prepare collection/margin-protection dossiers for approval",
    kpiSections: Object.freeze(["A_FINANCIAL"]),
    ownsThrusts: Object.freeze(["PROTECT_CASH", "PROTECT_MARGIN"]),
    oversight: false,
    authorizedActions: Object.freeze(["compute cash/receivable/margin indicators from evidence", "prepare an authorized dunning reminder (level B, if the guard passes)", "prepare a margin-review dossier"]),
    forbiddenActions: Object.freeze(["mark invoiced as collected", "report forecast as realized", "execute a payment", "waive a receivable without approval"]),
  }),
  PILOTAGE_COMMERCIAL: Object.freeze({
    id: "PILOTAGE_COMMERCIAL", domain: "Pilotage commercial",
    mandate: "prioritise markets and prepare governed market-entry; qualify prospects; surface evidence gaps — never commit entry autonomously",
    kpiSections: Object.freeze(["B_COMMERCIAL"]),
    ownsThrusts: Object.freeze(["EXPAND", "GATHER_EVIDENCE"]),
    oversight: false,
    authorizedActions: Object.freeze(["rank candidate markets (transparent criteria)", "prepare a level-C market-entry dossier for approval", "flag insufficient-evidence markets"]),
    forbiddenActions: Object.freeze(["enter a market autonomously", "commit entry spend", "fabricate demand/traction", "message customers externally"]),
  }),
});

/** runAssistant(id, ctx) -> a governed role-scoped projection over the unified executive surface. */
function runAssistant(id: string, ctx: any): any {
  const spec = (ASSISTANTS as any)[id];
  if (!spec) return Object.freeze({ ok: false, code: "UNKNOWN_ASSISTANT", detail: "id ∈ " + Object.keys(ASSISTANTS).join("/") });
  const surface = SURFACE.buildSurface(isObj(ctx) ? ctx : {});
  if (surface.ok !== true) return Object.freeze({ ok: false, code: "SURFACE_FAILED" });

  // decisions this assistant OWNS (by thrust) — DG also sees the whole governed queue for oversight.
  const owned = arr(surface.decisionQueue).filter((d: any) => spec.oversight || spec.ownsThrusts.indexOf(d.thrust) >= 0);
  // missing/unknown data in scope: pulled from the dashboard status tally (UNKNOWN ≠ 0, surfaced).
  const integrity = surface.dataIntegrity;
  const missingData = (integrity.unknown || 0) + (integrity.noData || 0);

  // every owned decision keeps its authority; the assistant can act autonomously ONLY on items that require no approval.
  const autonomousOwned = owned.filter((d: any) => d.requiresApproval === false);
  const approvalOwned = owned.filter((d: any) => d.requiresApproval === true);
  const executesNothing = owned.every((d: any) => d.executionResult === null);

  // maturity card — honest: composes real engines, no real company data ⇒ PARTIAL, recommendations only.
  const maturity = Object.freeze({
    status: "PARTIAL",                                                   // built + wired to real engines, but not fed real company data ⇒ not OPERATIONAL
    built: Object.freeze(["role-scoped projection over the unified surface", "owned-decision routing by thrust", "missing-data surfacing", "permission profile (prepare/recommend only)"]),
    partial: Object.freeze(["recommendations are governed proposals, not executed", "fed synthetic/estimate data, not real company data"]),
    absent: Object.freeze(["real operational data feed", "external action (owner-gated / out of mandate)"]),
    operational: false,
  });

  return Object.freeze({
    ok: true, assistant: spec.id, domain: spec.domain, mandate: spec.mandate,
    inputs: Object.freeze({ surfaceKpiCount: surface.dashboard.kpiCount, kpiSections: spec.kpiSections }),
    ownedDecisions: Object.freeze(owned), ownedCount: owned.length,
    autonomousCount: autonomousOwned.length, approvalRequiredCount: approvalOwned.length, executesNothing,
    conflictsInScope: Object.freeze(arr(surface.conflicts).filter((c: any) => spec.oversight || owned.some((d: any) => c.between.indexOf(d.id) >= 0))),
    missingDataCount: missingData, decidable: integrity.decidable,
    authorizedActions: spec.authorizedActions, forbiddenActions: spec.forbiddenActions, maturity,
    note: "functional assistant = governed role-scoped projection over the unified surface (V275). PREPARES/RECOMMENDS only — owned level-C/D decisions require human approval (executionResult null); UNKNOWN ≠ 0 surfaced; not OPERATIONAL (no real company data). Reuses the surface — no duplication.",
  });
}

/** runLot1(ctx) -> all three Lot-1 assistants over one surface (the governed lot deliverable). */
function runLot1(ctx: any): any {
  const ids = ["DIRECTION_GENERALE", "FINANCES", "PILOTAGE_COMMERCIAL"];
  const assistants = ids.map((id) => runAssistant(id, ctx));
  return Object.freeze({ ok: assistants.every((a: any) => a.ok), lot: "P2_LOT_1", assistantCount: assistants.length, assistants: Object.freeze(assistants),
    allPrepareOnly: assistants.every((a: any) => a.ok && a.executesNothing), anyOperational: assistants.some((a: any) => a.ok && a.maturity.operational),
    note: "P2 Lot 1 — Direction générale / Finances / Pilotage commercial as functional assistants over the unified surface; all PREPARE/RECOMMEND only (execute nothing), none OPERATIONAL. Next lots continue the 20-domain coverage." });
}

const EXECUTIVE_ASSISTANTS_CONTRACT = Object.freeze({
  id: "V276-ODG-EXECUTIVE-ASSISTANTS-LOT1",
  source: "V276 §4 (P2 Lot 1) — functional executive assistants: Direction générale / Finances / Pilotage commercial",
  assistants: Object.freeze(Object.keys(ASSISTANTS)),
  reuses: Object.freeze(["odg-executive-surface (V275 — composes dashboard/decision/country-ranking/market-entry)"]),
  invariants: Object.freeze([
    "functional assistants = governed role-scoped projections over the unified surface — NOT descriptive cards; reuse the surface (no duplication, no new engine)",
    "an assistant PREPARES/RECOMMENDS only and NEVER executes a SIGNIFICANT act: owned decisions keep their authority; level-C/D (market entry, significant financial, reserved) ALWAYS require human approval; executionResult is always null. Autonomy (requiresApproval false) is confined to level-A items and owner-pre-approved level-B transactional actions (e.g. an authorized dunning reminder) — inherited from the V271 decision engine, never a significant act",
    "UNKNOWN ≠ 0 — missing/unknown data is surfaced (missingDataCount, decidable), never fabricated; each assistant carries authorised vs forbidden actions",
    "maturity is honest: PARTIAL (wired to real engines but fed synthetic/estimate data) — NO assistant is claimed OPERATIONAL (no real company data)",
    "deterministic/read-only; market entry / significant financial acts never autonomous; Lot 1 is 3 of the 20 domains — the lot sequence continues",
  ]),
});

module.exports = { ASSISTANTS, runAssistant, runLot1, EXECUTIVE_ASSISTANTS_CONTRACT };

export {};
