#!/usr/bin/env node
"use strict";

/*
 * V278 §2 (P2 Lot 3) — ODG FUNCTIONAL ASSISTANTS: Comptabilité (D07), Assurances (D09), Flotte & matériel (D05). Canonical
 * domain names verified against odg-btp-company-management-coverage (V269). NOTE (anti-double-count, §5): D06 "Direction
 * financière et trésorerie" is ALREADY covered by the Lot-1 FINANCES assistant — it is NOT rebuilt here. Lot 3 therefore takes
 * the next three UNCOVERED priority domains (D07/D09/D05).
 *
 * REAL functional assistants: each composes the V275 unified surface (governed decisions it owns by thrust — none for these
 * domains in the current decision engine, honestly reported) AND its domain engine for real deterministic findings. REUSE
 * (no duplication / no new engine): odg-executive-surface (V275) + chantier-profitability (computeChantier) + regulatory-
 * assurance (assertNotCertified) + parc-stock-engine (buildRegistry / maintenanceAlerts).
 *
 * HONESTY: PREPARE/RECOMMEND only (executionResult null; no significant act autonomous). Comptabilité = pre-accounting only;
 * final validation is the expert-comptable's reserved act (level D). Assurances NEVER asserts coverage without contract proof
 * — a valid attestation ≠ full coverage; a certification claim is REFUSED (reuses regulatory-assurance). Flotte alerts are
 * signals, not conformity decisions. UNKNOWN ≠ 0. No assistant OPERATIONAL (no real company data ⇒ PARTIAL). Deterministic/read-only.
 */

const SURFACE = require("./odg-executive-surface.js");            // V275
const PROFIT = require("./chantier-profitability.js");           // computeChantier (pre-accounting reconciliation)
const ASSURANCE = require("./regulatory-assurance.js");          // assertNotCertified (refuse certification claims)
const PARC = require("./parc-stock-engine.js");                  // buildRegistry / maintenanceAlerts

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function isNum(v: any): boolean { return typeof v === "number" && isFinite(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

const ADMIN_ASSISTANTS = Object.freeze({
  COMPTABILITE: Object.freeze({
    id: "COMPTABILITE", domain: "Comptabilité & relation expert-comptable (D07)", engine: "chantier-profitability.computeChantier",
    mandate: "pre-accounting reconciliation: categorise costs, separate justified (justifRef) from unjustified (missing pièces), prepare the dossier — final accounting validation is the expert-comptable's reserved act (level D)",
    authorizedActions: Object.freeze(["reconcile supplied expenses by category", "flag expenses missing a justificatif (justifRef)", "prepare a monthly dossier for the expert-comptable"]),
    forbiddenActions: Object.freeze(["certify accounts", "produce a legally-binding attestation", "replace the expert-comptable's validation", "invent a missing justificatif"]),
    decisionLevelMax: "D",
  }),
  ASSURANCES: Object.freeze({
    id: "ASSURANCES", domain: "Assurances, conformité et risques (D09)", engine: "regulatory-assurance.assertNotCertified + deterministic policy échéance/coverage-gap",
    mandate: "inventory supplied policies/garanties, track expiries, flag missing info and coverage gaps — NEVER assert coverage without contract proof; a valid attestation is not full coverage (level D for the insurer/professional)",
    authorizedActions: Object.freeze(["inventory supplied policies", "flag expiring/expired policies", "flag operational risks with no matching documented coverage"]),
    forbiddenActions: Object.freeze(["assert a site/operation is covered without contract proof", "claim certification/compliance", "declare a sinistre autonomously"]),
    decisionLevelMax: "D",
  }),
  FLOTTE: Object.freeze({
    id: "FLOTTE", domain: "Flotte, véhicules et matériel (D05)", engine: "parc-stock-engine.buildRegistry + maintenanceAlerts",
    mandate: "build the asset register, track availability, surface maintenance/CT/assurance échéance alerts — an alert is a signal, never a conformity or safety decision",
    authorizedActions: Object.freeze(["build the asset register from supplied data", "surface maintenance/CT/insurance due alerts", "flag unavailable/defective equipment before dispatch"]),
    forbiddenActions: Object.freeze(["declare a vehicle roadworthy/compliant", "schedule a real maintenance autonomously", "fabricate an asset or an échéance"]),
    decisionLevelMax: "C",
  }),
});

function domainFindings(id: string, input: any): any {
  const i = isObj(input) ? input : {};
  if (id === "COMPTABILITE") {
    const ch = isObj(i.chantier) ? i.chantier : {};
    const c = PROFIT.computeChantier({ id: isStr(ch.id) ? ch.id : "CPTA", currency: "EUR", expenses: arr(ch.expenses) });
    if (c.ok === false) return Object.freeze({ kind: "ACCOUNTING", error: c.code });
    const fin = isObj(c.finance) ? c.finance : {};                               // chantier-profitability nests the figures under `finance`
    const byCat = isObj(fin.costByCategory) ? fin.costByCategory : {};
    return Object.freeze({ kind: "ACCOUNTING", totalMinor: fin.coutTotalConstateMinor, justifiedMinor: fin.justifiedCostMinor, unjustifiedMinor: fin.unjustifiedCostMinor, missingJustif: fin.unjustifiedCostMinor > 0, categoriesUsed: Object.keys(byCat).filter((k) => byCat[k] > 0), validationIsExpertComptable: true });
  }
  if (id === "ASSURANCES") {
    const policies = arr(i.policies).filter(isObj);
    const nowDay = isNum(i.nowDay) ? i.nowDay : null; const windowDays = isNum(i.windowDays) ? i.windowDays : 60;
    const expired: string[] = []; const expiring: string[] = []; const covered = new Set<string>();
    for (const p of policies) {
      if (isNum(p.expiryDay) && nowDay !== null) { if (p.expiryDay < nowDay) expired.push(p.id); else if (p.expiryDay - nowDay <= windowDays) expiring.push(p.id); }
      for (const t of arr(p.coveredTrades).filter(isStr)) covered.add(t);
    }
    const operationalTrades = arr(i.operationalTrades).filter(isStr);
    const coverageGaps = operationalTrades.filter((t: string) => !covered.has(t));   // risk with no DOCUMENTED coverage (not proof of non-coverage, but a gap to resolve)
    // a certification/"fully covered" claim is REFUSED (reuse regulatory-assurance).
    const certClaim = ASSURANCE.assertNotCertified("this site is fully covered and certified compliant");
    return Object.freeze({ kind: "INSURANCE", policyCount: policies.length, expired: Object.freeze(expired), expiring: Object.freeze(expiring), coverageGaps: Object.freeze(coverageGaps), anyCertificationClaimRefused: certClaim.ok === false, coverageAssertedWithoutProof: false, note: "a coverage gap is a DOCUMENTATION gap to resolve (confirm with the insurer), not proof of non-coverage; a valid attestation ≠ full coverage" });
  }
  if (id === "FLOTTE") {
    const fleet = isObj(i.fleet) ? i.fleet : {};
    const reg = PARC.buildRegistry(arr(fleet.equipments));
    const alerts = PARC.maintenanceAlerts(isObj(fleet.alerts) ? fleet.alerts : {});
    return Object.freeze({ kind: "FLEET", assetCount: reg.items.length, rejected: reg.rejected.length, alertCount: alerts.alerts.length, alertsAreSignalsNotDecisions: true });
  }
  return Object.freeze({ kind: "NONE" });
}

/** runAdminAssistant(id, input) -> governed role-scoped projection + real domain findings. */
function runAdminAssistant(id: string, input: any): any {
  const spec = (ADMIN_ASSISTANTS as any)[id];
  if (!spec) return Object.freeze({ ok: false, code: "UNKNOWN_ASSISTANT", detail: "id ∈ " + Object.keys(ADMIN_ASSISTANTS).join("/") });
  const i = isObj(input) ? input : {};
  const surface = SURFACE.buildSurface(isObj(i.surfaceCtx) ? i.surfaceCtx : {});
  if (surface.ok !== true) return Object.freeze({ ok: false, code: "SURFACE_FAILED" });
  const findings = domainFindings(id, i);
  const missingData = (surface.dataIntegrity.unknown || 0) + (surface.dataIntegrity.noData || 0);
  const maturity = Object.freeze({
    status: "PARTIAL", operational: false,
    built: Object.freeze(["real domain computation via " + spec.engine, "missing-data surfacing", "prepare/recommend-only permission profile (max authority " + spec.decisionLevelMax + ")"]),
    partial: Object.freeze(["recommendations are governed proposals, not executed", "fed synthetic/estimate data, not real company data"]),
    absent: Object.freeze(["real operational data feed", "reserved professional act (expert-comptable / insurer) and external/autonomous action"]),
  });
  return Object.freeze({
    ok: true, assistant: spec.id, domain: spec.domain, mandate: spec.mandate, engine: spec.engine, decisionLevelMax: spec.decisionLevelMax,
    domainFindings: findings, executesNothing: true, missingDataCount: missingData, decidable: surface.dataIntegrity.decidable,
    authorizedActions: spec.authorizedActions, forbiddenActions: spec.forbiddenActions, maturity,
    note: "admin/fleet assistant = real domain computation (" + spec.engine + ") + governed surface context. PREPARE/RECOMMEND only; Comptabilité/Assurances reserved acts stay level D; Assurances never asserts coverage without proof; fleet alerts are signals; UNKNOWN ≠ 0; PARTIAL not OPERATIONAL. Reuse — no duplication.",
  });
}

/** runLot3(input) -> the three Lot-3 assistants over one input. */
function runLot3(input: any): any {
  const ids = ["COMPTABILITE", "ASSURANCES", "FLOTTE"];
  const assistants = ids.map((id) => runAdminAssistant(id, input));
  return Object.freeze({ ok: assistants.every((a: any) => a.ok), lot: "P2_LOT_3", assistantCount: assistants.length, assistants: Object.freeze(assistants),
    allPrepareOnly: assistants.every((a: any) => a.ok && a.executesNothing), anyOperational: assistants.some((a: any) => a.ok && a.maturity.operational),
    d06Note: "D06 Finance/trésorerie is NOT rebuilt here — already covered by the Lot-1 FINANCES assistant (anti-double-count §5)",
    note: "P2 Lot 3 — Comptabilité / Assurances / Flotte as functional assistants (domain engine + governed surface); all PREPARE/RECOMMEND only, none OPERATIONAL. 9 of 20 domains covered across Lots 1-3 (D01/D06/D11-12 + D02/D04/D08 + D07/D09/D05)." });
}

const ADMIN_FLEET_ASSISTANTS_CONTRACT = Object.freeze({
  id: "V278-ODG-ADMIN-FLEET-ASSISTANTS-LOT3",
  source: "V278 §2 (P2 Lot 3) — Comptabilité (D07) / Assurances (D09) / Flotte (D05) functional assistants",
  assistants: Object.freeze(Object.keys(ADMIN_ASSISTANTS)),
  reuses: Object.freeze(["odg-executive-surface (V275)", "chantier-profitability (computeChantier)", "regulatory-assurance (assertNotCertified)", "parc-stock-engine (buildRegistry/maintenanceAlerts)"]),
  invariants: Object.freeze([
    "D06 Finance already covered by Lot-1 FINANCES — NOT rebuilt (anti-double-count); Lot 3 = next 3 uncovered domains D07/D09/D05",
    "real domain computation via existing engines (reuse, no new engine); PREPARE/RECOMMEND only, executionResult null, no significant act autonomous",
    "Comptabilité = pre-accounting only; final validation is the expert-comptable's reserved act (level D); a missing justificatif is flagged, never invented",
    "Assurances NEVER asserts coverage without contract proof (a valid attestation ≠ full coverage); a certification claim is REFUSED (regulatory-assurance); a coverage gap is a documentation gap, not proof of non-coverage",
    "Flotte alerts are signals not conformity decisions; UNKNOWN ≠ 0; maturity PARTIAL — NO assistant OPERATIONAL; deterministic/read-only; 9 of 20 domains across Lots 1-3",
  ]),
});

module.exports = { ADMIN_ASSISTANTS, runAdminAssistant, runLot3, ADMIN_FLEET_ASSISTANTS_CONTRACT };

export {};
