#!/usr/bin/env node
/**
 * proposal-pipeline — the bounded, governed bridge that closes the chain proposal → pipeline → dashboard (§2).
 * It converts a VALID proposal (the success output of proposal-generator.buildProposal) into a REAL pipeline-ledger
 * entry WITHOUT bypassing the ledger's fail-closed discipline: the entry is created at LEAD and advanced one legal
 * step at a time (LEAD→QUALIFIED→PROPOSAL) through pipeline-ledger.advance, binding each transition to the
 * tamper-evident audit chain. It STOPS at PROPOSAL — it never simulates a signature (PILOT_SIGNED and beyond remain
 * human/ODG-asserted acts recorded through the same fail-closed ledger). A proposal that FAILED its guardrails
 * (overclaim, missing limits, invented/absent price) produces NO ledger entry — an unprovable proposal cannot enter
 * the pipeline. Strict separation proposed/signed/invoiced/cashed and no double-count are inherited from the ledger
 * (a PROPOSAL-stage amount contributes 0 to signed/invoiced/cashed — a proposal is NOT revenue). Pure/deterministic.
 */
"use strict";

const PG = require("./proposal-generator.js");
const PL = require("./pipeline-ledger.js");
const DASH = require("./revenue-dashboard.js");

const CODE = Object.freeze({
  PROPOSAL_NOT_VALID: "PROPOSAL_NOT_VALID", INVALID_AMOUNT: "INVALID_AMOUNT",
  DUPLICATE_ID: "DUPLICATE_ID", ADVANCE_FAILED: "ADVANCE_FAILED", INVALID_INPUT: "INVALID_INPUT",
});

function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

/**
 * registerProposal(proposalResult, opts): opts = { id?, at?, chain?, existingIds? }.
 * proposalResult MUST be the full return of proposal-generator.buildProposal ({ ok:true, proposal, markdown }).
 * Returns { ok:true, entry, chain, client, amount, currency } or { ok:false, code, ... } — fail-closed, no fabrication.
 */
function registerProposal(proposalResult: any, opts: any = {}): any {
  if (proposalResult === null || typeof proposalResult !== "object") return { ok: false, code: CODE.INVALID_INPUT };
  if (proposalResult.ok !== true || !proposalResult.proposal) return { ok: false, code: CODE.PROPOSAL_NOT_VALID, detail: "only a successful buildProposal result can enter the pipeline — an unprovable/refused proposal does not" };
  const p = proposalResult.proposal;
  const amount = p.totals && typeof p.totals.total === "number" ? p.totals.total : -1;
  if (!(amount >= 0)) return { ok: false, code: CODE.INVALID_AMOUNT };
  const id = isStr(opts.id) ? String(opts.id) : String(p.client);
  const existing = Array.isArray(opts.existingIds) ? opts.existingIds.map(String) : [];
  if (existing.includes(id)) return { ok: false, code: CODE.DUPLICATE_ID, id };
  const at = isStr(opts.at) ? String(opts.at) : String(p.now || "");
  let chain = Array.isArray(opts.chain) ? opts.chain : [];
  let entry = PL.createEntry(id, amount, at);
  // Governed, one-step-forward, audit-chained climb to PROPOSAL. NEVER auto-advance to PILOT_SIGNED (no fake signature).
  for (const stage of ["QUALIFIED", "PROPOSAL"]) {
    const r = PL.advance(entry, stage, { at, chain });
    if (!r.ok) return { ok: false, code: CODE.ADVANCE_FAILED, stage, reason: r.reason, chain: r.chain };
    entry = r.entry; chain = r.chain;
  }
  return { ok: true, entry, chain, client: String(p.client), amount, currency: p.currency, stage: "PROPOSAL" };
}

/**
 * sign/invoice/cash(entry, opts): thin governed forwarders for the HUMAN-asserted post-proposal steps. They do NOT
 * invent the act — they record it through the same fail-closed, audit-chained ledger (one legal step only).
 */
function signPilot(entry: any, opts: any = {}): any { return PL.advance(entry, "PILOT_SIGNED", opts); }
function invoice(entry: any, opts: any = {}): any { return PL.advance(entry, "INVOICED", opts); }
function cash(entry: any, opts: any = {}): any { return PL.advance(entry, "CASHED", opts); }

/** dashboardFor(entries, opts): the proposal→pipeline→€target view (reuses revenue-dashboard; no double-count). */
function dashboardFor(entries: any[], opts: any = {}): any { return DASH.dashboard(Array.isArray(entries) ? entries : [], opts); }

export { CODE, registerProposal, signPilot, invoice, cash, dashboardFor };
module.exports = { CODE, registerProposal, signPilot, invoice, cash, dashboardFor };

if (require.main === module) { process.stdout.write("proposal-pipeline (governed bridge, fail-closed)\n"); }
