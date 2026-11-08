#!/usr/bin/env node
"use strict";

/*
 * V12.4 §90–§92 (Partie XXI) — EXECUTION SCORECARD. PURE, verifiable. Aggregates the REAL proven state across the
 * existing V12.4 ledgers — gates A–G (gates-ledger §97-103), campaigns C1–C4 (campaign-closure-ledger §83-87),
 * dossiers A–F (dossier-ledger §71-76), failures F01–F40 (failures-register §105) — plus caller-supplied verified
 * facts (primitives present, professions proven, register ACCEPTED) into ONE honest scorecard (§90), applies
 * FAIL-CLOSED readiness thresholds (§91), and emits a transparent forecast of what remains (§92). It composes; it
 * builds no new ledger and INFLATES NOTHING: overall readiness is READY only when every hard gate is met; a fact not
 * supplied is UNKNOWN (never assumed met). Dual export.
 */

const GATES = require("./gates-ledger");
const CAMPAIGNS = require("./campaign-closure-ledger");
const DOSSIERS = require("./dossier-ledger");
const FAILURES = require("./failures-register");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function numOrNull(v: any): number | null { return typeof v === "number" && isFinite(v) ? v : null; }

// §91 thresholds (hard gates for overall READY). Expressed honestly: these are NOT all met today.
const THRESHOLDS = Object.freeze({
  primitivesRequired: 9, professionsRequired: 15,
  gatesAllPass: true,        // every A–G gate must be PASS
  campaignsAllClosed: true,  // every C1–C4 must be CLOSED (demonstrated, not sub-lot counts)
  failuresNoToAudit: true,   // no F01–F40 left TO_AUDIT
});

/** buildScorecard(facts) -> honest aggregate. facts: {primitivesPresent, professionsProven, registerAccepted}. */
function buildScorecard(facts: any): any {
  const f = isObj(facts) ? facts : {};
  const g = GATES.verifyLedger();
  const c = CAMPAIGNS.verifyLedger();
  const d = DOSSIERS.verifyLedger();
  const fr = FAILURES.verifyRegister();

  const primitivesPresent = numOrNull(f.primitivesPresent);
  const professionsProven = numOrNull(f.professionsProven);
  const registerAccepted = numOrNull(f.registerAccepted);

  const dimensions = Object.freeze({
    primitives: { present: primitivesPresent, required: THRESHOLDS.primitivesRequired, met: primitivesPresent === null ? null : primitivesPresent >= THRESHOLDS.primitivesRequired },
    professions: { proven: professionsProven, required: THRESHOLDS.professionsRequired, met: professionsProven === null ? null : professionsProven >= THRESHOLDS.professionsRequired },
    gates: { byStatus: g.byStatus, allPass: g.byStatus.PASS === g.count, met: g.ok && g.byStatus.PASS === g.count },
    campaigns: { byStatus: c.byStatus, closed: c.closedCount, allClosed: c.closedCount === c.count, met: c.ok && c.closedCount === c.count },
    dossiers: { byStatus: d.byStatus, met: d.ok && d.byStatus.PRESENT === d.count },
    failures: { byStatus: fr.byStatus, noToAudit: (fr.byStatus.TO_AUDIT || 0) === 0, met: fr.ok && (fr.byStatus.TO_AUDIT || 0) === 0 },
    register: { accepted: registerAccepted },
  });

  // §91 fail-closed readiness: READY iff EVERY hard gate is explicitly met (a null/unknown fact is NOT met).
  const hardGates = [dimensions.primitives.met, dimensions.professions.met, dimensions.gates.met, dimensions.campaigns.met, dimensions.failures.met];
  const ready = hardGates.every((m) => m === true);
  const anyUnknown = hardGates.some((m) => m === null);
  const overall = ready ? "READY" : "IN_PROGRESS";

  // §92 forecast — transparent list of what blocks READY (no inflation; owner-gated items named).
  const remaining: string[] = [];
  if (dimensions.professions.met !== true) remaining.push(`professions: ${professionsProven ?? "UNKNOWN"}/${THRESHOLDS.professionsRequired} proven`);
  if (dimensions.gates.met !== true) remaining.push(`gates: ${g.byStatus.PASS}/${g.count} PASS (rest PARTIAL/TO_AUDIT — require global demonstration §103)`);
  if (dimensions.campaigns.met !== true) remaining.push(`campaigns: ${c.closedCount}/${c.count} CLOSED (network now owner-authorized; residual blocker = the C1-C4 OBJECTIVE definitions are NOT_RECOVERABLE/index-only — owner must supply them to demonstrate closure end-to-end)`);
  if (dimensions.failures.met !== true) remaining.push(`failures: ${fr.byStatus.TO_AUDIT || 0} of F01–F40 still TO_AUDIT`);
  if (dimensions.primitives.met !== true) remaining.push(`primitives: ${primitivesPresent ?? "UNKNOWN"}/${THRESHOLDS.primitivesRequired} present`);

  return Object.freeze({
    source: "V12.4 §90–§92 scorecard (aggregates existing ledgers; inflates nothing)",
    overall, ready, anyUnknown, dimensions, thresholds: THRESHOLDS,
    forecast: Object.freeze({ remaining: Object.freeze(remaining), note: "READY requires EVERY hard gate met; an UNKNOWN fact is treated as NOT met (fail-closed). Network (FR-07) is now owner-authorized; residual blockers are owner-INFORMATION (C1-C4 objective definitions NOT_RECOVERABLE), root-deploy (sudo), and external-reality E4/E5 — none clearable computer-side without owner input." }),
  });
}

const V124_SCORECARD_CONTRACT = Object.freeze({
  id: "V124-EXECUTION-SCORECARD",
  source: "V12.4 §90–§92 (Partie XXI) — scorecard + thresholds + forecast",
  composes: Object.freeze(["gates-ledger", "campaign-closure-ledger", "dossier-ledger", "failures-register"]),
  notAuthority: "an honest aggregate of the existing ledgers; it builds no new ledger and inflates no status",
  invariants: Object.freeze([
    "overall READY iff EVERY hard gate is met (primitives≥9, professions≥15 proven, all gates PASS, all campaigns CLOSED, no failure TO_AUDIT)",
    "a caller fact not supplied is UNKNOWN and treated as NOT met (fail-closed) — never assumed",
    "a campaign counts toward closure only when CLOSED (demonstrated), not by sub-lot ACCEPTED count",
    "composes the real ledgers; duplicates none; owner-gated blockers (FR-07/VPS/E5) are named, not silently cleared",
  ]),
});

module.exports = { THRESHOLDS, buildScorecard, V124_SCORECARD_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...V124_SCORECARD_CONTRACT, demo: buildScorecard({ primitivesPresent: 9, professionsProven: 15, registerAccepted: 239 }) }, null, 2) + "\n"); }

export {};
