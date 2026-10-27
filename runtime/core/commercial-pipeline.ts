#!/usr/bin/env node
/**
 * commercial-pipeline — the full fail-closed B2B funnel the €500k program needs (mandate §6). It extends the realized
 * cash view of pipeline-ledger with the complete commercial lifecycle and its explicit, evidence-gated transitions:
 *   DETECTED → VERIFIED → QUALIFIED → INTERESTED → PROPOSAL_PREPARED → PROPOSAL_AUTHORIZED → PROPOSAL_SENT →
 *   NEGOTIATION → SIGNED → DELIVERY_ACCEPTED → INVOICED → CASHED   (+ LOST, terminal)
 * No stage auto-advances: every forward step requires `criterionMet === true` (proof of the transition criterion).
 * Two steps are additionally HUMAN-gated (deny-by-default): PROPOSAL_SENT (sending is an external act) and SIGNED (a
 * legal act) require `humanAuthorized === true`. This encodes the anti-conflation rule: a PREPARED proposal is not a
 * SENT one, a SENT proposal is not a contract, a SIGNED contract is not an INVOICE, an INVOICE is not CASH. Skipping,
 * moving backward, or acting on a LOST entry is REFUSED. Every (attempted) transition is bound to a tamper-evident
 * audit chain. Pure, deterministic, no clock (timestamps are DATA). Nothing is invented — it records asserted facts.
 */
"use strict";

const AUDIT = require("./audit-log.js");

const STAGES = ["DETECTED", "VERIFIED", "QUALIFIED", "INTERESTED", "PROPOSAL_PREPARED", "PROPOSAL_AUTHORIZED", "PROPOSAL_SENT", "NEGOTIATION", "SIGNED", "DELIVERY_ACCEPTED", "INVOICED", "CASHED"];
const STAGE_INDEX: Record<string, number> = STAGES.reduce((a: any, s, i) => { a[s] = i; return a; }, {});
const HUMAN_GATED = new Set(["PROPOSAL_SENT", "SIGNED"]);            // external/legal acts — deny-by-default
// Criterion each forward transition must evidence (documentation; the code only enforces criterionMet===true).
const CRITERION: Record<string, string> = {
  VERIFIED: "company existence + source verified", QUALIFIED: "meets ICP criteria", INTERESTED: "prospect expressed real interest (reply/meeting)",
  PROPOSAL_PREPARED: "proposal drafted (fail-closed generator)", PROPOSAL_AUTHORIZED: "CTO authorised the proposal", PROPOSAL_SENT: "proposal actually sent (human act)",
  NEGOTIATION: "active negotiation", SIGNED: "signed contract (human/legal act)", DELIVERY_ACCEPTED: "client accepted the delivered work",
  INVOICED: "invoice issued", CASHED: "payment received",
};

export interface Opportunity { id: string; stage: string; amount: number; at: string; lost: boolean; history: any[]; }

const CODE = Object.freeze({ INVALID_TRANSITION: "INVALID_TRANSITION", CRITERION_NOT_MET: "CRITERION_NOT_MET", HUMAN_AUTH_REQUIRED: "HUMAN_AUTH_REQUIRED", LOST_TERMINAL: "LOST_TERMINAL", UNKNOWN_STAGE: "UNKNOWN_STAGE" });

function createOpportunity(id: string, amount: number, at: string): Opportunity {
  return { id: String(id), stage: "DETECTED", amount: typeof amount === "number" && amount >= 0 ? amount : 0, at: String(at || ""), lost: false, history: [{ stage: "DETECTED", at: String(at || "") }] };
}

/**
 * advance(entry, toStage, { at, chain, criterionMet, humanAuthorized }): one legal forward step or LOST. FAIL-CLOSED.
 * Returns { ok, entry, reason, code?, chain }.
 */
function advance(entry: any, toStage: string, opts?: any): { ok: boolean; entry: Opportunity; reason: string; code?: string; chain: any[] } {
  const o = opts || {};
  const chainIn = Array.isArray(o.chain) ? o.chain : [];
  const e: Opportunity = { ...entry, history: Array.isArray(entry.history) ? entry.history.slice() : [] };
  const rec = (ok: boolean, reason: string, code?: string) => ({ ok, entry: e, reason, ...(code ? { code } : {}), chain: AUDIT.appendEntry(chainIn, { id: e.id, from: entry.stage, to: toStage, ok, at: String(o.at || ""), amount: e.amount }) });
  if (entry.lost) return rec(false, "opportunity is LOST (terminal)", CODE.LOST_TERMINAL);
  if (toStage === "LOST") { e.lost = true; e.history.push({ stage: "LOST", at: String(o.at || "") }); return rec(true, "marked LOST"); }
  const from = STAGE_INDEX[entry.stage], to = STAGE_INDEX[toStage];
  if (to === undefined) return rec(false, `unknown stage ${JSON.stringify(toStage)}`, CODE.UNKNOWN_STAGE);
  if (to !== from + 1) return rec(false, `illegal transition ${entry.stage}→${toStage} — exactly one forward step required (no skip, no backward)`, CODE.INVALID_TRANSITION);
  if (o.criterionMet !== true) return rec(false, `criterion not evidenced for ${toStage}: ${CRITERION[toStage] || "?"}`, CODE.CRITERION_NOT_MET);
  if (HUMAN_GATED.has(toStage) && o.humanAuthorized !== true) return rec(false, `${toStage} is a human-gated act (send/sign) — explicit authorisation required`, CODE.HUMAN_AUTH_REQUIRED);
  e.stage = toStage; e.history.push({ stage: toStage, at: String(o.at || ""), criterion: CRITERION[toStage] || null });
  return rec(true, `advanced to ${toStage}`);
}

/**
 * funnelTotals(entries): honest counts + realized buckets. Nothing before SIGNED is revenue; signed ≥ invoiced ≥
 * cashed by construction. Also exposes preparedNotSent (anti-conflation visibility).
 */
function funnelTotals(entries: any[]): any {
  const counts: Record<string, number> = {}; for (const s of STAGES) counts[s] = 0; counts.LOST = 0;
  let signed = 0, invoiced = 0, cashed = 0, preparedNotSent = 0, sentNotSigned = 0;
  for (const raw of Array.isArray(entries) ? entries : []) {
    const e = raw || {}; const amt = typeof e.amount === "number" && e.amount >= 0 ? e.amount : 0;
    if (e.lost) { counts.LOST++; continue; }
    counts[e.stage] = (counts[e.stage] || 0) + 1;
    const idx = STAGE_INDEX[e.stage];
    if (idx >= STAGE_INDEX.SIGNED) signed += amt;
    if (idx >= STAGE_INDEX.INVOICED) invoiced += amt;
    if (idx >= STAGE_INDEX.CASHED) cashed += amt;
    if (idx >= STAGE_INDEX.PROPOSAL_PREPARED && idx < STAGE_INDEX.PROPOSAL_SENT) preparedNotSent++;
    if (idx >= STAGE_INDEX.PROPOSAL_SENT && idx < STAGE_INDEX.SIGNED) sentNotSigned++;
  }
  return { counts, signed, invoiced, cashed, preparedNotSent, sentNotSigned };
}

export { STAGES, CRITERION, HUMAN_GATED, CODE, createOpportunity, advance, funnelTotals };
module.exports = { STAGES, CRITERION, HUMAN_GATED, CODE, createOpportunity, advance, funnelTotals };

if (require.main === module) { process.stdout.write("commercial-pipeline (12-stage, evidence-gated, fail-closed)\n"); }
