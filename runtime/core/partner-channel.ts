#!/usr/bin/env node
/**
 * partner-channel — axis D (CTO V29): partner-channel readiness. Partner qualification rubric, commission
 * economics, an HONEST partner state machine (no conflation), and a reusable delivery kit + service catalogue
 * for A/B/C/E. New module (no existing partner-qualification capability); commission economics feed cost/net.
 *
 * HONESTY (mandate): NO partner / introduction / acceptance / customer access / signed agreement is invented.
 * A CANDIDATE is not CONTACTED is not ACCEPTED is not ACTIVE. Commission is a COST that reduces net, paid on
 * COLLECTED cash (not contracted). A prepared delivery kit does NOT mean a partner is accepted. All economics
 * are ASSUMPTIONS until real partners + real collections exist. External contact is authorization-gated.
 * Pure/deterministic.
 */
"use strict";

const PARTNER_TYPES = Object.freeze(["referral", "reseller", "implementation", "subcontractor"]);
// Ordered funnel — forward one step only; DISQUALIFIED is terminal. CANDIDATE≠CONTACTED≠ACCEPTED≠ACTIVE.
const PARTNER_STATES = Object.freeze(["CANDIDATE", "QUALIFIED", "CONTACTED", "RESPONDED", "NEGOTIATING", "ACCEPTED", "ACTIVE"]);
const RUBRIC = Object.freeze(["customerAccess", "expertise", "reputation", "deliveryCapacity", "geography", "targetMarket", "conflicts", "compliance", "commercialFit"]);
const REQUIRED = Object.freeze(["customerAccess", "expertise", "deliveryCapacity", "targetMarket", "commercialFit"]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function present(v: any): boolean {
  if (v === undefined || v === null || v === false) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (isObj(v)) return Object.keys(v).length > 0;
  return true;
}
function r2(x: number): number { return Math.round(x * 100) / 100; }

/** qualifyPartner(record): rubric → CANDIDATE | QUALIFIED | INCOMPLETE | DISQUALIFIED (+ reasons, next action). */
function qualifyPartner(record: any): any {
  if (!isObj(record)) return { ok: false, code: "INVALID_INPUT", detail: "partner record object required" };
  const coverage: Record<string, boolean> = {};
  for (const k of RUBRIC) coverage[k] = present(record[k]);
  const disq: string[] = [];
  if (record.conflicts === true || (isObj(record.conflicts) && record.conflicts.present === true)) disq.push("conflict of interest");
  if (record.compliance === false || (isObj(record.compliance) && record.compliance.ok === false)) disq.push("compliance failure");
  const missingRequired = REQUIRED.filter((k) => !coverage[k]);

  let verdict: string, state: string, nextAction: string;
  if (disq.length) { verdict = "DISQUALIFIED"; state = "DISQUALIFIED"; nextAction = `do not proceed: ${disq.join("; ")}`; }
  else if (missingRequired.length) { verdict = "INCOMPLETE"; state = "CANDIDATE"; nextAction = `gather: ${missingRequired.join(", ")}`; }
  else { verdict = "QUALIFIED"; state = "QUALIFIED"; nextAction = "prepare partner proposition + delivery kit; outreach is HUMAN-authorized (not sent here)"; }

  return { ok: true, verdict, state, coverage, missingRequired, disqualifiers: disq, nextAction, note: "QUALIFIED = worth approaching per recorded facts, NOT an accepted partner. No introduction/acceptance/access invented." };
}

/** advanceState(from, to): forward EXACTLY one step through PARTNER_STATES (no skip/back); DISQUALIFIED terminal. */
function advanceState(from: any, to: any): any {
  if (to === "DISQUALIFIED") return { ok: true, from, to, note: "marked DISQUALIFIED (terminal)" };
  const i = PARTNER_STATES.indexOf(from), j = PARTNER_STATES.indexOf(to);
  if (i === -1 || j === -1) return { ok: false, code: "UNKNOWN_STATE", from, to };
  if (j !== i + 1) return { ok: false, code: "ILLEGAL_TRANSITION", detail: `exactly one forward step required (${from}→${to}); no skipping/conflation`, from, to };
  return { ok: true, from, to };
}

/**
 * commission({ dealValue, pct, type, basis }): commission is a COST on COLLECTED cash (not contracted).
 * Returns { commissionAmount, netAfterCommission, marginImpactPct, basis } or fail-closed.
 */
function commission(opts: any = {}): any {
  const dealValue = typeof opts.dealValue === "number" && opts.dealValue >= 0 ? opts.dealValue : null;
  const p = typeof opts.pct === "number" && opts.pct >= 0 && opts.pct <= 1 ? opts.pct : null;
  if (dealValue === null || p === null) return { ok: false, code: "INVALID_ECONOMICS", detail: "dealValue>=0 and pct in [0,1] required" };
  const type = PARTNER_TYPES.indexOf(opts.type) !== -1 ? opts.type : "referral";
  const basis = opts.basis === "contracted" ? "contracted" : "collected";   // default: commission on COLLECTED cash
  const commissionAmount = r2(dealValue * p);
  const netAfterCommission = r2(dealValue - commissionAmount);
  return {
    ok: true, type, basis, dealValue: r2(dealValue), pct: p,
    commissionAmount, netAfterCommission,
    marginImpactPct: dealValue > 0 ? r2((commissionAmount / dealValue) * 100) : 0,
    note: `commission is a COST reducing net; paid on ${basis} (default COLLECTED, not contracted). Timing + payment terms are ASSUMPTIONS until a real partner agreement exists.`,
  };
}

/** attributeDeals(deals): dedup by dealId so one deal is NOT counted for two partners (double-attribution guard). */
function attributeDeals(deals: any): any {
  const list = Array.isArray(deals) ? deals : [];
  const seen = new Set<string>();
  const attributed: any[] = [];
  const duplicates: any[] = [];
  for (const d of list) {
    if (!isObj(d) || typeof d.dealId !== "string") continue;
    if (seen.has(d.dealId)) { duplicates.push({ dealId: d.dealId, partner: d.partner || null }); continue; }
    seen.add(d.dealId); attributed.push(d);
  }
  return { attributed, duplicates, uniqueCount: attributed.length, duplicateCount: duplicates.length, note: "one deal attributes to ONE partner; duplicate attributions are dropped (no double counting)." };
}

/** deliveryKit(): reusable partner service catalogue (A/B/C/E) + handoff/quality boundaries. */
function deliveryKit(): any {
  return {
    serviceCatalogue: [
      { axis: "A", offer: "entry diagnostic", partnerTypes: ["referral", "reseller"] },
      { axis: "B", offer: "mid-market audit+remediation (+recurring)", partnerTypes: ["reseller", "implementation"] },
      { axis: "C", offer: "enterprise engagement", partnerTypes: ["implementation", "subcontractor"] },
      { axis: "E", offer: "premium €50k missions", partnerTypes: ["implementation", "subcontractor"] },
    ],
    reusableKit: {
      serviceScope: "per-axis scope (reuses entry/mid-market/enterprise offer specs)",
      deliverables: "dossier + SARIF + roadmap (axis-dependent)",
      acceptanceCriteria: "per-axis acceptance (offer specs)",
      evidencePack: "sealed dossier + provenance + before/after SARIF",
      handoffChecklist: ["scope confirmed", "inputs received", "acceptance agreed", "evidence retention agreed", "escalation contacts set"],
      escalation: "exceptions (unknown licence / AI-Act HIGH / out-of-scope) ⇒ ODG human review; partner does not self-certify",
      qualityBoundaries: "no SLA unless a retainer; readiness ≠ certification; no cross-client data reuse",
    },
    note: "a prepared kit does NOT mean a partner is accepted; it is internal readiness only.",
  };
}

export { PARTNER_TYPES, PARTNER_STATES, RUBRIC, REQUIRED, qualifyPartner, advanceState, commission, attributeDeals, deliveryKit };
module.exports = { PARTNER_TYPES, PARTNER_STATES, RUBRIC, REQUIRED, qualifyPartner, advanceState, commission, attributeDeals, deliveryKit };

if (require.main === module) {
  process.stdout.write(JSON.stringify({ model: "partner-channel/1", types: PARTNER_TYPES, states: PARTNER_STATES, rule: "no partner/acceptance invented; commission is a cost on collected cash; states not conflated" }, null, 2) + "\n");
}
