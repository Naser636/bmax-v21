#!/usr/bin/env node
"use strict";
/*
 * V176 (§2/§7 — harden V173's PARTIAL functions: prospect qualification/scoring for needs_budget + prospecting, + a
 * hardening ledger over all six). PURE, deterministic, fail-closed. Local-only — NO real prospect contact/send/spend.
 *
 * Qualifies a prospect from OBSERVABLE signals ONLY (ICP fit + budget evidence + buy-signal + regulatory urgency), reusing
 * the V174-A signal discipline. A prospect is QUALIFIED only with a real buy-signal AND budget evidence — market size alone
 * is NEVER qualification (§4). HONESTY: prospects are SYNTHETIC; a QUALIFIED prospect is NOT a client (outreach is OWNER_GATED);
 * NO PARTIAL function is flipped to AUTONOMOUS (that needs end-to-end real-traffic proof). No fabricated demand; €0 clients.
 */
const OPP = require("./odg-global-opportunity-radar.js"); // reuse the buy-signal vocabulary discipline (V174-A)

const TIER = Object.freeze({ QUALIFIED: "QUALIFIED", NURTURE: "NURTURE", DISQUALIFIED: "DISQUALIFIED" });
const BUDGET = Object.freeze(["OBSERVED", "HYPOTHESIS", "NONE"]);
const HARD_SIGNALS = Object.freeze(new Set(["REGULATORY_DEADLINE", "TENDER", "BUDGET_OBSERVED"]));

/* qualifyProspect(p) — deterministic. p: { id, segmentFit (0..5), budgetEvidence ∈ BUDGET, buySignal, regulatoryUrgency (0..5) }.
 * QUALIFIED requires: segmentFit≥3 AND budgetEvidence≠NONE AND a HARD buy-signal. NURTURE: good fit but no hard signal/budget.
 * DISQUALIFIED: weak fit. Market size alone never qualifies. */
function qualifyProspect(p: any): any {
  const fit = Math.max(0, Math.min(5, Number(p && p.segmentFit) || 0));
  const budget = BUDGET.includes(p && p.budgetEvidence) ? p.budgetEvidence : "NONE";
  const hardSignal = HARD_SIGNALS.has(p && p.buySignal);
  const urgency = Math.max(0, Math.min(5, Number(p && p.regulatoryUrgency) || 0));
  const score = Math.round(((fit * 0.4 + urgency * 0.3 + (budget === "OBSERVED" ? 5 : budget === "HYPOTHESIS" ? 2 : 0) * 0.3 / 5 * 5) / 5) * 1000) / 10;

  let tier: string, reason: string;
  if (fit < 3) { tier = TIER.DISQUALIFIED; reason = "insufficient ICP/segment fit"; }
  else if (budget !== "NONE" && hardSignal) { tier = TIER.QUALIFIED; reason = `good fit + ${budget} budget evidence + hard buy-signal (${p.buySignal})`; }
  else { tier = TIER.NURTURE; reason = budget === "NONE" ? "good fit but NO budget evidence — not solvent yet" : "good fit + budget but NO hard buy-signal"; }

  return Object.freeze({
    id: p && p.id, tier, reason, score,
    budgetEvidence: budget, hardBuySignal: hardSignal,
    caveat: tier === TIER.QUALIFIED ? "QUALIFIED prospect is NOT a client — outreach/contract/payment are OWNER_GATED; a prospect is not a sale" : "not qualified as solvent demand",
  });
}

function scoreBatch(prospects: any): any {
  const list = Array.isArray(prospects) ? prospects.map(qualifyProspect) : [];
  const n = list.length || 1;
  const by: any = { QUALIFIED: 0, NURTURE: 0, DISQUALIFIED: 0 }; for (const r of list) by[r.tier] += 1;
  return Object.freeze({ total: list.length, byTier: Object.freeze(by), qualifiedRate: Math.round((by.QUALIFIED / n) * 1000) / 10, results: Object.freeze(list), note: "SYNTHETIC prospects; QUALIFIED ≠ client; no real contact; market size never counted as demand." });
}

/* hardeningLedger — the 6 PARTIAL functions (recovered from V173) with this-campaign improvement + honest status.
 * NO function flipped to AUTONOMOUS (needs end-to-end real-traffic proof). */
function hardeningLedger(): any {
  const rows = [
    { fn: "needs_budget", v173Module: "demand-experiment + customer-outcome-intelligence", improvementThisLot: "prospect qualification scores budget-evidence tier (OBSERVED/HYPOTHESIS/NONE) — reduces human triage", status: "HARDENED_LOCAL", stillPartial: true, ownerGated: false },
    { fn: "prospecting", v173Module: "prospection-compliance + prospection-send-gate + email-gateway", improvementThisLot: "qualification engine ranks prospects before any outreach; SEND remains OWNER_GATED", status: "HARDENED_LOCAL_SEND_OWNER_GATED", stillPartial: true, ownerGated: true },
    { fn: "retention", v173Module: "customer-outcome-intelligence", improvementThisLot: "V174 support-renewal-engine adds churn-risk detection + renewal drafts", status: "PARTIALLY_HARDENED_V174", stillPartial: true, ownerGated: false },
    { fn: "onboarding_delivery", v173Module: "first-cash-activation + client-intake", improvementThisLot: "V174 support-renewal-engine covers post-onboarding support", status: "PARTIALLY_HARDENED_V174", stillPartial: true, ownerGated: false },
    { fn: "product_design", v173Module: "odg-native-engineering + odg-ast-operations", improvementThisLot: "none this lot (already ODG-native, bounded)", status: "STILL_PARTIAL", stillPartial: true, ownerGated: false },
    { fn: "finance", v173Module: "invoicing + payments + revenue-dashboard", improvementThisLot: "none — payment execution OWNER_GATED (computation already automated)", status: "OWNER_GATED", stillPartial: true, ownerGated: true },
  ].map((r) => Object.freeze(r));
  return Object.freeze({
    total: rows.length,
    hardenedLocal: rows.filter((r: any) => /HARDENED/.test(r.status)).length,
    stillPartial: rows.filter((r: any) => r.stillPartial).length,
    flippedToAutonomous: 0,
    rows: Object.freeze(rows),
    note: "NO function flipped to AUTONOMOUS — status change to AUTONOMOUS requires end-to-end real-traffic proof (not available). All remain PARTIAL; local hardening measured, owner-gates preserved (prospecting SEND, finance payment).",
  });
}

const PROSPECT_QUALIFICATION_CONTRACT = Object.freeze({
  id: "V176-PROSPECT-QUALIFICATION",
  purpose: "§2/§7 — harden V173's needs_budget + prospecting PARTIAL functions via deterministic prospect qualification; honest hardening ledger over all 6",
  reuses: ["odg-global-opportunity-radar buy-signal discipline (V174-A)", "V174 support-renewal-engine (retention/onboarding hardening)"],
  invariants: Object.freeze([
    "QUALIFIED requires ICP fit + budget evidence + a HARD buy-signal — market size alone NEVER qualifies",
    "a QUALIFIED prospect is NOT a client; outreach/contract/payment are OWNER_GATED; a prospect is not a sale",
    "NO PARTIAL function flipped to AUTONOMOUS (needs end-to-end real-traffic proof); all remain PARTIAL, local hardening measured",
    "owner-gates preserved (prospecting SEND, finance payment); SYNTHETIC prospects; no real contact/send/spend; €0 clients",
    "deterministic + fail-closed; reuses existing modules; no fabricated demand",
  ]),
});
module.exports = { qualifyProspect, scoreBatch, hardeningLedger, TIER, BUDGET, PROSPECT_QUALIFICATION_CONTRACT };
export {};
