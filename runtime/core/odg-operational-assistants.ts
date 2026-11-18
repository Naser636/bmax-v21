#!/usr/bin/env node
"use strict";

/*
 * V277 §3 (P2 Lot 2) — ODG FUNCTIONAL OPERATIONAL ASSISTANTS: Operations (chantiers, D02), Procurement (achats/fournisseurs,
 * D04), Human Resources (RH, D08). Canonical domain names verified against odg-btp-company-management-coverage (V269). These
 * are REAL functional assistants: each composes the V275 unified surface (for the governed decisions it OWNS by thrust) AND its
 * domain engine (for real deterministic domain findings) — NOT descriptive cards.
 *
 * REUSE (no duplication / no new engine): odg-executive-surface (V275) + odg-btp-project-workflow (V266: planSchedule /
 * reconcileMaterials) + workforce-labour-engine (computeLabourCost). Same assistant pattern as V276 Lot 1.
 *
 * HONESTY: PREPARE/RECOMMEND only — owned decisions keep their authority, executionResult always null; no significant act is
 * autonomous. Procurement NEVER fabricates stock/orders/supplier prices (absent ⇒ null). HR labour cost is approved-hours ×
 * SUPPLIED rate, NEVER derived from a salary; no rate ⇒ COST_NOT_MEASURED (surfaced, not 0). UNKNOWN ≠ 0. No assistant is
 * OPERATIONAL (no real company data ⇒ PARTIAL). Deterministic/read-only.
 */

const SURFACE = require("./odg-executive-surface.js");            // V275
const WORKFLOW = require("./odg-btp-project-workflow.js");        // V266 — planSchedule / reconcileMaterials
const WF = require("./workforce-labour-engine.js");              // computeLabourCost

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

const OPS_ASSISTANTS = Object.freeze({
  OPERATIONS: Object.freeze({
    id: "OPERATIONS", domain: "Gestion complète des chantiers (D02)", engine: "odg-btp-project-workflow.planSchedule (V266)",
    mandate: "track chantier schedule state (blocked/delayed/milestones), surface operational blockers, prepare re-sequencing — never commit a schedule change without the required validation",
    ownsThrusts: Object.freeze(["RESOLVE_OPS"]),
    authorizedActions: Object.freeze(["compute schedule state from the plan", "flag blocked/delayed tasks", "prepare a re-sequencing proposal for validation"]),
    forbiddenActions: Object.freeze(["silently overwrite a schedule", "mark a task complete without evidence", "reassign a worker to an unqualified task"]),
  }),
  PROCUREMENT: Object.freeze({
    id: "PROCUREMENT", domain: "Achats, fournisseurs et livraisons (D04)", engine: "odg-btp-project-workflow.reconcileMaterials (V266)",
    mandate: "reconcile required/ordered/delivered/consumed materials, detect shortages and discrepancies, prepare purchase proposals — never fabricate stock, orders or supplier prices",
    ownsThrusts: Object.freeze([]),                                 // no procurement decision-thrust in the current decision engine ⇒ domain findings only (honest PARTIAL)
    authorizedActions: Object.freeze(["reconcile material quantities (explicit coefficients only)", "flag shortages/discrepancies", "prepare a purchase proposal for approval (within an authorized budget)"]),
    forbiddenActions: Object.freeze(["fabricate stock/orders/deliveries/supplier prices", "place an order autonomously", "commit spend"]),
  }),
  HUMAN_RESOURCES: Object.freeze({
    id: "HUMAN_RESOURCES", domain: "Ressources humaines et organisation (D08)", engine: "workforce-labour-engine.computeLabourCost",
    mandate: "compute labour cost from APPROVED hours × supplied loaded rate, surface not-measured entries, prepare payroll-preparatory variables — never derive employer cost from a salary, never make a disciplinary decision",
    ownsThrusts: Object.freeze([]),                                 // no HR decision-thrust in the current decision engine ⇒ domain findings only (honest PARTIAL)
    authorizedActions: Object.freeze(["compute labour cost (approved hours × supplied rate)", "surface COST_NOT_MEASURED entries", "prepare payroll-preparatory variables for the payroll manager"]),
    forbiddenActions: Object.freeze(["derive employer cost from a salary", "make a disciplinary/licenciement decision", "run payroll autonomously"]),
  }),
});

function domainFindings(id: string, input: any): any {
  const i = isObj(input) ? input : {};
  if (id === "OPERATIONS") {
    const s = WORKFLOW.planSchedule(arr(i.schedule));
    return s.ok === true
      ? Object.freeze({ kind: "SCHEDULE", taskCount: s.taskCount, completed: s.completedCount, blocked: s.blocked.length, delayed: s.delayed.length, milestones: s.milestones.length, allComplete: s.allComplete })
      : Object.freeze({ kind: "SCHEDULE", error: s.code });
  }
  if (id === "PROCUREMENT") {
    const m = WORKFLOW.reconcileMaterials(arr(i.materials));
    return Object.freeze({ kind: "MATERIALS", materialCount: m.materialCount, shortages: m.shortages.length, discrepancies: m.discrepancies.length, clean: m.clean, pricesFabricated: false, pricesCarriedOnlyWhenSupplied: true });
  }
  if (id === "HUMAN_RESOURCES") {
    const lab = isObj(i.labour) ? i.labour : {};
    const l = WF.computeLabourCost(arr(lab.entries), isObj(lab.workforce) ? lab.workforce : { items: [] }, lab.rateParams);
    return Object.freeze({ kind: "LABOUR", totalMinor: l.totalMinor, measured: l.measuredCount, notMeasured: l.notMeasuredCount, skippedDuplicate: l.skippedDuplicateCount, costNeverFromSalary: true });
  }
  return Object.freeze({ kind: "NONE" });
}

/** runOperationalAssistant(id, input) -> governed role-scoped projection (surface decisions) + real domain findings. */
function runOperationalAssistant(id: string, input: any): any {
  const spec = (OPS_ASSISTANTS as any)[id];
  if (!spec) return Object.freeze({ ok: false, code: "UNKNOWN_ASSISTANT", detail: "id ∈ " + Object.keys(OPS_ASSISTANTS).join("/") });
  const i = isObj(input) ? input : {};
  const surface = SURFACE.buildSurface(isObj(i.surfaceCtx) ? i.surfaceCtx : {});
  if (surface.ok !== true) return Object.freeze({ ok: false, code: "SURFACE_FAILED" });
  const owned = arr(surface.decisionQueue).filter((d: any) => spec.ownsThrusts.indexOf(d.thrust) >= 0);
  const findings = domainFindings(id, i);
  const missingData = (surface.dataIntegrity.unknown || 0) + (surface.dataIntegrity.noData || 0);
  const maturity = Object.freeze({
    status: "PARTIAL", operational: false,
    built: Object.freeze(["real domain computation via " + spec.engine, "owned-decision routing by thrust", "missing-data surfacing", "prepare/recommend-only permission profile"]),
    partial: Object.freeze(["recommendations are governed proposals, not executed", "fed synthetic/estimate data, not real company data"]),
    absent: Object.freeze(["real operational data feed", "external/autonomous action (owner-gated / out of mandate)"]),
  });
  return Object.freeze({
    ok: true, assistant: spec.id, domain: spec.domain, mandate: spec.mandate, engine: spec.engine,
    domainFindings: findings, ownedDecisions: Object.freeze(owned), ownedCount: owned.length,
    executesNothing: owned.every((d: any) => d.executionResult === null), missingDataCount: missingData, decidable: surface.dataIntegrity.decidable,
    authorizedActions: spec.authorizedActions, forbiddenActions: spec.forbiddenActions, maturity,
    note: "operational assistant = real domain computation (" + spec.engine + ") + governed role-scoped decisions over the V275 surface. PREPARE/RECOMMEND only (executionResult null); no fabricated stock/price; labour cost never from salary (no rate ⇒ COST_NOT_MEASURED); UNKNOWN ≠ 0; PARTIAL not OPERATIONAL. Reuses engines — no duplication.",
  });
}

/** runLot2(input) -> the three Lot-2 assistants over one input (the governed lot deliverable). */
function runLot2(input: any): any {
  const ids = ["OPERATIONS", "PROCUREMENT", "HUMAN_RESOURCES"];
  const assistants = ids.map((id) => runOperationalAssistant(id, input));
  return Object.freeze({ ok: assistants.every((a: any) => a.ok), lot: "P2_LOT_2", assistantCount: assistants.length, assistants: Object.freeze(assistants),
    allPrepareOnly: assistants.every((a: any) => a.ok && a.executesNothing), anyOperational: assistants.some((a: any) => a.ok && a.maturity.operational),
    note: "P2 Lot 2 — Operations / Procurement / Human Resources as functional assistants (domain engine + governed surface); all PREPARE/RECOMMEND only, none OPERATIONAL. 6 of 20 domains covered across Lots 1-2." });
}

const OPERATIONAL_ASSISTANTS_CONTRACT = Object.freeze({
  id: "V277-ODG-OPERATIONAL-ASSISTANTS-LOT2",
  source: "V277 §3 (P2 Lot 2) — Operations / Procurement / HR functional assistants",
  assistants: Object.freeze(Object.keys(OPS_ASSISTANTS)),
  reuses: Object.freeze(["odg-executive-surface (V275)", "odg-btp-project-workflow (V266: planSchedule/reconcileMaterials)", "workforce-labour-engine (computeLabourCost)"]),
  invariants: Object.freeze([
    "functional assistants = real domain computation (existing engines) + governed role-scoped surface decisions — NOT descriptive cards; reuse only, no new engine/duplication",
    "PREPARE/RECOMMEND only: owned decisions keep authority, executionResult always null; no significant act autonomous",
    "Procurement NEVER fabricates stock/orders/supplier prices (absent ⇒ null); HR labour cost = approved hours × SUPPLIED rate, NEVER from a salary, no rate ⇒ COST_NOT_MEASURED (surfaced, not 0)",
    "UNKNOWN ≠ 0; each assistant carries authorised vs forbidden actions; maturity PARTIAL — NO assistant claimed OPERATIONAL (no real company data)",
    "deterministic/read-only; 6 of 20 domains across Lots 1-2; the lot sequence continues",
  ]),
});

module.exports = { OPS_ASSISTANTS, runOperationalAssistant, runLot2, OPERATIONAL_ASSISTANTS_CONTRACT };

export {};
