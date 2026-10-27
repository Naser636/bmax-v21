#!/usr/bin/env node
/**
 * pipeline-ledger — a fail-closed sales pipeline + cash ledger (Track 3 autonomy for §E "suivi du pipeline et des
 * encaissements"). It enforces, in CODE, the directive's strict separation: an amount is SIGNED only after a signed
 * pilot, INVOICED only after signed, CASHED only after invoiced — a stage can NEVER be skipped (no false success), and
 * each euro is counted in exactly one realized bucket (no double-count). Stage transitions are bound to a tamper-evident
 * audit-log chain. Pure, deterministic, no clock (timestamps are DATA). Nothing here invents a client or a payment —
 * it only records what the human/ODG asserts, fail-closed.
 */
"use strict";

const AUDIT = require("./audit-log.js");

// Ordered lifecycle. LOST is terminal and excluded from all revenue buckets.
const STAGES = ["LEAD", "QUALIFIED", "PROPOSAL", "PILOT_SIGNED", "INVOICED", "CASHED"];
const STAGE_INDEX: Record<string, number> = STAGES.reduce((a: any, s, i) => { a[s] = i; return a; }, {});

export interface PipelineEntry {
  id: string; stage: string; amount: number; at: string; lost: boolean; history: any[];
}

/** Create an entry at LEAD (or an explicit starting stage=LEAD). Amount is the contract value hypothesis (€). */
function createEntry(id: string, amount: number, at: string): PipelineEntry {
  return { id: String(id), stage: "LEAD", amount: typeof amount === "number" && amount >= 0 ? amount : 0, at: String(at || ""), lost: false, history: [{ stage: "LEAD", at: String(at || "") }] };
}

/**
 * advance(entry, toStage, {at, chain}): move FORWARD exactly one legal step (or mark LOST). FAIL-CLOSED: skipping a
 * stage, moving backward, or acting on a LOST entry is REFUSED (entry unchanged, ok:false). Returns {ok, entry, reason,
 * chain} where chain is the tamper-evident audit chain extended with this (attempted) transition.
 */
function advance(entry: any, toStage: string, opts?: any): { ok: boolean; entry: PipelineEntry; reason: string; chain: any[] } {
  const o = opts || {};
  const chainIn = Array.isArray(o.chain) ? o.chain : [];
  const e: PipelineEntry = { ...entry, history: Array.isArray(entry.history) ? entry.history.slice() : [] };
  const record = (ok: boolean, reason: string) => ({ ok, entry: e, reason, chain: AUDIT.appendEntry(chainIn, { id: e.id, from: entry.stage, to: toStage, ok, at: String(o.at || ""), amount: e.amount }) });
  if (entry.lost) return record(false, "entry is LOST (terminal) — no transition allowed");
  if (toStage === "LOST") { e.lost = true; e.history.push({ stage: "LOST", at: String(o.at || "") }); return record(true, "marked LOST"); }
  const from = STAGE_INDEX[entry.stage]; const to = STAGE_INDEX[toStage];
  if (to === undefined) return record(false, `unknown stage ${JSON.stringify(toStage)}`);
  if (to !== from + 1) return record(false, `illegal transition ${entry.stage}→${toStage} — exactly one forward step required (no skipping, no false success)`);
  e.stage = toStage; e.history.push({ stage: toStage, at: String(o.at || "") });
  return record(true, `advanced to ${toStage}`);
}

/**
 * pipelineTotals(entries): honest realized buckets. signed = Σ amounts of non-LOST entries that reached ≥ PILOT_SIGNED;
 * invoiced = reached ≥ INVOICED; cashed = reached CASHED. By construction signed ≥ invoiced ≥ cashed and each euro is
 * counted once per bucket it has genuinely realized (no double-count across buckets — they are nested, not additive).
 */
function pipelineTotals(entries: any[]): { signed: number; invoiced: number; cashed: number; weightedPipeline: number; counts: Record<string, number> } {
  let signed = 0, invoiced = 0, cashed = 0, weighted = 0;
  const counts: Record<string, number> = { LEAD: 0, QUALIFIED: 0, PROPOSAL: 0, PILOT_SIGNED: 0, INVOICED: 0, CASHED: 0, LOST: 0 };
  // Illustrative stage-probabilities for a WEIGHTED (expected) pipeline — HYPOTHESIS, not a forecast of cash.
  const PW: Record<string, number> = { LEAD: 0.05, QUALIFIED: 0.15, PROPOSAL: 0.3, PILOT_SIGNED: 0.9, INVOICED: 0.98, CASHED: 1 };
  for (const raw of Array.isArray(entries) ? entries : []) {
    const e = raw || {}; const amt = typeof e.amount === "number" && e.amount >= 0 ? e.amount : 0;
    if (e.lost) { counts.LOST++; continue; }
    counts[e.stage] = (counts[e.stage] || 0) + 1;
    const idx = STAGE_INDEX[e.stage];
    if (idx >= STAGE_INDEX.PILOT_SIGNED) signed += amt;
    if (idx >= STAGE_INDEX.INVOICED) invoiced += amt;
    if (idx >= STAGE_INDEX.CASHED) cashed += amt;
    weighted += amt * (PW[e.stage] || 0);
  }
  return { signed, invoiced, cashed, weightedPipeline: Math.round(weighted), counts };
}

export { STAGES, createEntry, advance, pipelineTotals };
module.exports = { STAGES, createEntry, advance, pipelineTotals };
