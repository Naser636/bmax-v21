#!/usr/bin/env node
"use strict";

/*
 * V279 §2-§4 (P2 Lot 4) — ODG FUNCTIONAL ASSISTANTS: Clients/SAV (D11), Concurrence (D13), International (D14). Canonical
 * domain names verified against odg-btp-company-management-coverage (V269). REAL functional assistants: each composes the V275
 * unified surface AND its domain engine(s) for deterministic findings — NOT descriptive cards.
 *
 * REUSE (no new engine / no 2nd radar / no duplication):
 *   - D11 Clients/SAV: commercial-pipeline (funnelTotals) + odg-btp-billing-engine (paymentLedger) + a deterministic SAV/
 *     complaint classifier over supplied requests.
 *   - D13 Concurrence: odg-btp-competitor-intelligence (V277 compareToODG/auditFindings) — MANDATORY reuse, no second radar/store.
 *   - D14 International: odg-country-ranking (V272 rankCountries) + odg-market-entry-decision (V274 proposeMarketEntry).
 *   - All: odg-executive-surface (V275) for governed context.
 *
 * HONESTY: PREPARE/RECOMMEND only (executionResult null; external acts human-gated, nothing autonomous). INVOICED ≠ CASHED,
 * INVOICE ≠ COLLECTED; a complaint without evidence is NOT an established responsibility; a competitor claim is SECONDARY_REVIEW/
 * unverified, absence ≠ proof of absence, never superior/inferior without comparable criteria; a country RANKING ≠ an investment
 * decision, potential ≠ realized sales, market entry stays level C. UNKNOWN ≠ 0; no assistant OPERATIONAL. Deterministic/read-only.
 */

const SURFACE = require("./odg-executive-surface.js");            // V275
const CP = require("./commercial-pipeline.js");                  // funnelTotals
const BILLING = require("./odg-btp-billing-engine.js");          // paymentLedger (V267)
const COMPET = require("./odg-btp-competitor-intelligence.js");  // V277 — mandatory reuse (no 2nd radar)
const RANK = require("./odg-country-ranking.js");                // V272
const ENTRY = require("./odg-market-entry-decision.js");         // V274

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

const COMMERCIAL_ASSISTANTS = Object.freeze({
  CLIENTS_SAV: Object.freeze({
    id: "CLIENTS_SAV", domain: "Clients, contrats et SAV (D11)", engine: "commercial-pipeline.funnelTotals + odg-btp-billing-engine.paymentLedger",
    mandate: "centralise client requests, track quote→invoice→payment, classify complaints (verified anomaly vs unverified claim), flag missing pieces, prepare DRAFT responses — never send externally, never mark invoiced as collected",
    authorizedActions: Object.freeze(["summarise the commercial funnel", "surface outstanding/overdue invoices (invoice ≠ collected)", "classify a complaint as verified anomaly vs unverified claim", "prepare a DRAFT resolution for human approval"]),
    forbiddenActions: Object.freeze(["mark an invoice collected without evidence", "send a client message externally", "treat an unverified complaint as established legal responsibility", "invent a client engagement"]),
    decisionLevelMax: "C",
  }),
  CONCURRENCE: Object.freeze({
    id: "CONCURRENCE", domain: "Intelligence concurrentielle mondiale (D13)", engine: "odg-btp-competitor-intelligence (V277)",
    mandate: "consult existing competitor findings, compare documented offers to ODG, distinguish primary vs secondary sources, surface unverified claims and demonstrated gaps, propose differentiation — never assert superiority/inferiority without comparable criteria",
    authorizedActions: Object.freeze(["read existing competitor findings (with provenance/confidence)", "compute ODG-vs-competitor gaps", "flag SECONDARY_REVIEW / NEEDS_PRIMARY_VERIFICATION claims", "propose canonical missions from demonstrated gaps"]),
    forbiddenActions: Object.freeze(["present a secondary-source price as a verified fact", "declare a competitor superior/inferior without comparable criteria", "treat absence of info as proof of absence", "create a second competitor radar/store"]),
    decisionLevelMax: "B",
  }),
  INTERNATIONAL: Object.freeze({
    id: "INTERNATIONAL", domain: "Internationalisation (D14)", engine: "odg-country-ranking (V272) + odg-market-entry-decision (V274)",
    mandate: "rank candidate markets on transparent criteria, qualify opportunities, surface missing economic info, prepare a governed market-entry dossier — a ranking is not an investment decision; market entry stays level C (human approval)",
    authorizedActions: Object.freeze(["rank countries on transparent weighted criteria", "flag insufficient-evidence markets", "prepare a level-C market-entry dossier for the OWNER"]),
    forbiddenActions: Object.freeze(["enter a market autonomously", "confuse ranking with an investment decision", "confuse market potential with realized sales", "fabricate demand/traction"]),
    decisionLevelMax: "C",
  }),
});

function domainFindings(id: string, input: any): any {
  const i = isObj(input) ? input : {};
  if (id === "CLIENTS_SAV") {
    const funnel = CP.funnelTotals(arr(i.opportunities));
    const ledger = BILLING.paymentLedger(isObj(i.billing) ? i.billing : { invoices: [], payments: [] });
    const requests = arr(i.requests).filter(isObj);
    const complaints = requests.filter((r: any) => r.kind === "COMPLAINT");
    const verifiedAnomalies = complaints.filter((r: any) => r.hasEvidence === true);
    const unverifiedComplaints = complaints.filter((r: any) => r.hasEvidence !== true);
    return Object.freeze({ kind: "CLIENTS_SAV", funnelInvoiced: funnel.invoiced, funnelCashed: funnel.cashed, invoicedNotCashed: funnel.invoiced - funnel.cashed, outstandingMinor: ledger.ok ? ledger.totalOutstandingMinor : null, overdueMinor: ledger.ok ? ledger.totalOverdueMinor : null, requestCount: requests.length, complaintCount: complaints.length, verifiedAnomalies: verifiedAnomalies.length, unverifiedComplaints: unverifiedComplaints.length, invoiceNeverCollectedWithoutEvidence: true, externalSendNever: true });
  }
  if (id === "CONCURRENCE") {
    const cmp = COMPET.compareToODG();
    const audit = COMPET.auditFindings();
    const missionProposals = cmp.gaps.map((g: any) => Object.freeze({ fromGap: g.theme, odgStatus: g.odgStatus, proposal: "evaluate closing the '" + g.theme + "' gap (ODG " + g.odgStatus + ")", evidenceBasis: "ODG-real-status vs competitor SECONDARY_REVIEW (unverified)" }));
    return Object.freeze({ kind: "CONCURRENCE", findingCount: audit.count, evidenceQuality: audit.byConfidence, needsPrimaryVerification: audit.needsPrimaryVerification.length, odgGaps: cmp.gaps.map((g: any) => g.theme), missionProposals, noOfficialDoc: audit.anyOfficialDoc === false, noSuperiorityClaim: true });
  }
  if (id === "INTERNATIONAL") {
    const ranking = RANK.rankCountries(isObj(i.ranking) ? i.ranking : { countries: [] });
    const entry = ENTRY.proposeMarketEntry(ranking, isObj(i.entryPolicy) ? i.entryPolicy : {});
    return Object.freeze({ kind: "INTERNATIONAL", rankedCount: ranking.ok ? ranking.rankedCount : 0, excludedCount: ranking.ok ? ranking.excludedCount : 0, top: ranking.ok && ranking.ranking[0] ? ranking.ranking[0].code : null, entryHasCandidate: entry.hasCandidate, entryAuthority: entry.decision.authorityLevel, entryRequiresApproval: entry.decision.requiresApproval, rankingIsNotDecision: true, potentialIsNotSales: true });
  }
  return Object.freeze({ kind: "NONE" });
}

/** runCommercialAssistant(id, input) -> governed role-scoped projection + real domain findings. */
function runCommercialAssistant(id: string, input: any): any {
  const spec = (COMMERCIAL_ASSISTANTS as any)[id];
  if (!spec) return Object.freeze({ ok: false, code: "UNKNOWN_ASSISTANT", detail: "id ∈ " + Object.keys(COMMERCIAL_ASSISTANTS).join("/") });
  const i = isObj(input) ? input : {};
  const surface = SURFACE.buildSurface(isObj(i.surfaceCtx) ? i.surfaceCtx : {});
  if (surface.ok !== true) return Object.freeze({ ok: false, code: "SURFACE_FAILED" });
  const findings = domainFindings(id, i);
  const missingData = (surface.dataIntegrity.unknown || 0) + (surface.dataIntegrity.noData || 0);
  const maturity = Object.freeze({
    status: "PARTIAL", operational: false,
    built: Object.freeze(["real domain computation via " + spec.engine, "missing-data surfacing", "prepare/recommend-only (max authority " + spec.decisionLevelMax + ")"]),
    partial: Object.freeze(["recommendations are governed proposals, not executed", "fed synthetic/estimate data (+ competitor data is SECONDARY_REVIEW), not real company data"]),
    absent: Object.freeze(["real operational/customer data feed", "external/autonomous action (owner-gated)"]),
  });
  return Object.freeze({
    ok: true, assistant: spec.id, domain: spec.domain, mandate: spec.mandate, engine: spec.engine, decisionLevelMax: spec.decisionLevelMax,
    domainFindings: findings, executesNothing: true, missingDataCount: missingData, decidable: surface.dataIntegrity.decidable,
    authorizedActions: spec.authorizedActions, forbiddenActions: spec.forbiddenActions, maturity,
    note: "commercial assistant = real domain computation (" + spec.engine + ") + governed surface context. PREPARE/RECOMMEND only; invoiced≠cashed, invoice≠collected; competitor data SECONDARY_REVIEW (never superior/inferior without comparable criteria); ranking≠decision, potential≠sales, market entry level C; UNKNOWN≠0; PARTIAL not OPERATIONAL. Reuse — no new engine, no 2nd radar.",
  });
}

/** runLot4(input) -> the three Lot-4 assistants + a cross-domain view (no invented dependencies). */
function runLot4(input: any): any {
  const ids = ["CLIENTS_SAV", "CONCURRENCE", "INTERNATIONAL"];
  const assistants = ids.map((id) => runCommercialAssistant(id, input));
  return Object.freeze({
    ok: assistants.every((a: any) => a.ok), lot: "P2_LOT_4", assistantCount: assistants.length, assistants: Object.freeze(assistants),
    allPrepareOnly: assistants.every((a: any) => a.ok && a.executesNothing), anyOperational: assistants.some((a: any) => a.ok && a.maturity.operational),
    crossView: Object.freeze({ clientsSav: "market needs & returns", concurrence: "positioning & gaps", international: "geographic opportunities & risks", note: "three related views; relationships shown WITHOUT inventing dependencies; conflicts/insufficient-evidence surfaced, not auto-resolved" }),
    note: "P2 Lot 4 — Clients/SAV / Concurrence / International as functional assistants; all PREPARE/RECOMMEND only, none OPERATIONAL. 12 of 20 domains covered across Lots 1-4.",
  });
}

const COMMERCIAL_ASSISTANTS_CONTRACT = Object.freeze({
  id: "V279-ODG-COMMERCIAL-ASSISTANTS-LOT4",
  source: "V279 §2-§4 (P2 Lot 4) — Clients/SAV (D11) / Concurrence (D13) / International (D14) functional assistants",
  assistants: Object.freeze(Object.keys(COMMERCIAL_ASSISTANTS)),
  reuses: Object.freeze(["odg-executive-surface (V275)", "commercial-pipeline (funnelTotals)", "odg-btp-billing-engine (paymentLedger)", "odg-btp-competitor-intelligence (V277 — no 2nd radar)", "odg-country-ranking (V272)", "odg-market-entry-decision (V274)"]),
  invariants: Object.freeze([
    "real domain computation via existing engines (reuse, no new engine, no 2nd competitor radar/store); PREPARE/RECOMMEND only, executionResult null, no significant act autonomous",
    "Clients/SAV: INVOICED ≠ CASHED, INVOICE ≠ COLLECTED (never marked collected without evidence); a complaint without evidence is NOT an established legal responsibility; no external send",
    "Concurrence: competitor data is SECONDARY_REVIEW / unverified / NEEDS_PRIMARY_VERIFICATION; absence ≠ proof of absence; never superior/inferior without comparable criteria; demonstrated gaps become mission PROPOSALS",
    "International: a country RANKING ≠ an investment decision; market potential ≠ realized sales; market entry stays level C (human approval, never autonomous); no fabricated demand",
    "UNKNOWN ≠ 0; maturity PARTIAL — NO assistant OPERATIONAL; deterministic/read-only; 12 of 20 domains across Lots 1-4; cross-view shows relations without inventing dependencies",
  ]),
});

module.exports = { COMMERCIAL_ASSISTANTS, runCommercialAssistant, runLot4, COMMERCIAL_ASSISTANTS_CONTRACT };

export {};
