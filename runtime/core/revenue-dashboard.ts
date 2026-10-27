#!/usr/bin/env node
/**
 * revenue-dashboard — the renderer linking pipeline-ledger (REAL recorded signed/invoiced/cashed) ↔ revenue-model
 * (contractsForTarget maths) ↔ the €500k TARGET (§4). It computes the honest GAP between the target and what has
 * ACTUALLY been realized, plus the weighted (expected) pipeline — never claiming the target is met without cashed €.
 * Pure, deterministic, read-only: it consumes ledger entries + projection inputs and renders a CTO-glance report.
 * Reuses pipeline-ledger.pipelineTotals + revenue-model.contractsForTarget (no duplication, no new primitive).
 */
"use strict";

const PL = require("./pipeline-ledger.js");
const RM = require("./revenue-model.js");

export interface RevenueDashboard {
  target: number; signed: number; invoiced: number; cashed: number; weightedPipeline: number;
  gapSigned: number; gapCashed: number; coverageCashedPct: number; coverageWeightedPct: number;
  status: "NO_DATA" | "BEHIND" | "SIGNED_TARGET_MET_CASH_PENDING" | "CASH_TARGET_MET";
  contractsStillNeeded: number; notes: string[]; markdown: string;
}

/**
 * dashboard(entries, opts): opts = { target=500000, avgContractValue? (for contractsStillNeeded) }.
 * Status is fail-honest: no entries ⇒ NO_DATA; cashed<target ⇒ BEHIND (even if signed is high); signed≥target but
 * cashed<target ⇒ SIGNED_TARGET_MET_CASH_PENDING; cashed≥target ⇒ CASH_TARGET_MET.
 */
function dashboard(entries: any[], opts?: any): RevenueDashboard {
  const o = opts || {};
  const target = typeof o.target === "number" && o.target > 0 ? o.target : 500000;
  const t = PL.pipelineTotals(Array.isArray(entries) ? entries : []);
  const signed = t.signed, invoiced = t.invoiced, cashed = t.cashed, weighted = t.weightedPipeline;
  const gapSigned = Math.max(0, target - signed);
  const gapCashed = Math.max(0, target - cashed);
  const coverageCashedPct = Math.round((cashed / target) * 1000) / 10;
  const coverageWeightedPct = Math.round((weighted / target) * 1000) / 10;
  const hasData = (Array.isArray(entries) ? entries : []).some((e: any) => e && !e.lost);
  let status: RevenueDashboard["status"];
  if (!hasData) status = "NO_DATA";
  else if (cashed >= target) status = "CASH_TARGET_MET";
  else if (signed >= target) status = "SIGNED_TARGET_MET_CASH_PENDING";
  else status = "BEHIND";
  const avg = typeof o.avgContractValue === "number" && o.avgContractValue > 0 ? o.avgContractValue : 0;
  const contractsStillNeeded = avg > 0 ? RM.contractsForTarget(gapSigned, avg) : Infinity;

  const notes: string[] = [];
  if (status === "NO_DATA") notes.push("no real pipeline entries yet — €500k is a TARGET, not a result (gap = full target)");
  if (status === "BEHIND") notes.push(`behind target: ${gapCashed} still to CASH (signed-but-not-cashed is NOT revenue)`);
  if (status === "SIGNED_TARGET_MET_CASH_PENDING") notes.push("signed ≥ target but NOT yet cashed — cash is the only revenue that counts");

  const L: string[] = [];
  L.push(`# Revenue vs €${target.toLocaleString("en-US")} target — ODG dashboard`);
  L.push("");
  L.push(`**Status: ${status}**`);
  L.push("");
  L.push(`| metric | € | % of target |`);
  L.push(`|---|---|---|`);
  L.push(`| signed | ${signed} | ${Math.round((signed / target) * 1000) / 10}% |`);
  L.push(`| invoiced | ${invoiced} | ${Math.round((invoiced / target) * 1000) / 10}% |`);
  L.push(`| **cashed (counts)** | **${cashed}** | **${coverageCashedPct}%** |`);
  L.push(`| weighted pipeline (expected, HYPOTHESIS) | ${weighted} | ${coverageWeightedPct}% |`);
  L.push("");
  L.push(`Gap to target — cashed: **€${gapCashed}** · signed: €${gapSigned}.`);
  if (avg > 0) L.push(`At €${avg}/contract, **${contractsStillNeeded}** more signed contracts would close the signed gap (maths only).`);
  L.push("");
  L.push(`> cashed is the only figure that is revenue. signed ≥ invoiced ≥ cashed by construction (pipeline-ledger).`);
  for (const n of notes) L.push(`> ${n}`);

  return { target, signed, invoiced, cashed, weightedPipeline: weighted, gapSigned, gapCashed, coverageCashedPct, coverageWeightedPct, status, contractsStillNeeded, notes, markdown: L.join("\n") };
}

export { dashboard };
module.exports = { dashboard };
