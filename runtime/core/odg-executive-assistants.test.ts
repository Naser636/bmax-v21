#!/usr/bin/env node
"use strict";
/* V276 §4 (P2 Lot 1) — functional executive assistants. Runs the 3 Lot-1 assistants over a REAL unified surface and asserts
 * role-scoped decision ownership (Finances↔PROTECT_CASH, Commercial↔EXPAND/GATHER_EVIDENCE, DG↔oversight), prepare/recommend-
 * only (executes nothing, market entry stays level C), UNKNOWN-surfacing, forbidden-action rails, honest PARTIAL maturity. SYNTHETIC. */
const A = require("./odg-executive-assistants.js");
const SURFACE = require("./odg-executive-surface.js");
const DEVIS = require("./odg-btp-devis-engine.js");
const WORKFLOW = require("./odg-btp-project-workflow.js");
const BILLING = require("./odg-btp-billing-engine.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }
const crit = (s: number, st: string) => ({ score: s, status: st, source: "x" });
const FULL = (ms: number, pp: number, lf: number, ci: number, rc: number, pi: number, ec: number) => ({ marketSize: crit(ms, "ESTIMATED"), purchasingPower: crit(pp, "ESTIMATED"), languageFit: crit(lf, "ESTIMATED"), competitionIntensity: crit(ci, "ESTIMATED"), regulatoryComplexity: crit(rc, "ESTIMATED"), paymentInfra: crit(pi, "ESTIMATED"), entryCost: crit(ec, "ESTIMATED") });

function main() {
  const quotation = DEVIS.computeDevis({ overheadRate: 0.10, marginRate: 0.20, vatRate: 0.20, lines: [{ id: "L1", quantity: 100, materialQty: 100, materialUnitPriceMinor: 500, labourHours: 10, labourRateMinor: 4000, measurementState: "MEASURED" }] });
  const costLedger = WORKFLOW.actualCostLedger([{ phase: "PAID", category: "MATERIAL", amountMinor: 52000, evidenceRef: "f" }, { phase: "INVOICED", category: "LABOUR", amountMinor: 41000, evidenceRef: "s" }]);
  const invoiceLedger = BILLING.paymentLedger({ asOfDay: 70, invoices: [{ id: "INV-DEP", amountTTCMinor: 42768, dueDay: 30 }, { id: "INV-PRG", amountTTCMinor: 42768, dueDay: 60 }], payments: [{ invoiceId: "INV-DEP", amountMinor: 42768, evidenceRef: "e", txnRef: "t" }] });
  const terms = BILLING.paymentTerms({ projectId: "P", quotationRef: "Q", projectApproved: true, contractHTMinor: 118800, vatRate: 0.20, milestones: [{ id: "MS1", percent: 0.30 }] });
  const cashReconciliation = BILLING.cashReconciliation({ terms, invoiceLedger, costLedger, quotation });
  const schedule = WORKFLOW.planSchedule([{ id: "T1", percentComplete: 50 }, { id: "T2", dependencies: ["T1"], percentComplete: 0 }]);
  const ctx = {
    dashboard: { asOf: 10, nowDay: 12, finance: { cashReconciliation }, operations: { schedule }, odg: { missions: [{ id: "M1", status: "READY" }, { id: "M2", status: "OWNER_GATED" }] } },
    decisionPolicies: { overdueCeilingMinor: 10000 },
    ranking: { countries: [{ code: "FR", provenanceRef: "eurostat", criteria: FULL(80, 85, 100, 70, 60, 90, 40) }] },
    entryPolicy: { minConfidence: 0 },
  };
  const surface = SURFACE.buildSurface(ctx);

  const lot = A.runLot1(ctx);
  check("runLot1: 3 assistants, all ok, all PREPARE-only (execute nothing), NONE operational", lot.ok && lot.assistantCount === 3 && lot.allPrepareOnly === true && lot.anyOperational === false);

  const dg = A.runAssistant("DIRECTION_GENERALE", ctx);
  check("Direction générale: oversight ⇒ sees the WHOLE governed queue; executesNothing; maturity PARTIAL not operational",
    dg.ok && dg.ownedCount === surface.decisionCount && dg.ownedDecisions.some((d: any) => d.id === "DEC_OWNER_GATED") && dg.ownedDecisions.some((d: any) => d.id === "DEC_MARKET_ENTRY") && dg.executesNothing === true && dg.maturity.status === "PARTIAL" && dg.maturity.operational === false);
  check("Direction générale: conflicts surfaced in scope (EXPAND vs PROTECT_CASH)", dg.conflictsInScope.some((c: any) => c.between.indexOf("DEC_MARKET_ENTRY") >= 0 && c.between.indexOf("DEC_OVERDUE") >= 0));

  const fin = A.runAssistant("FINANCES", ctx);
  check("Finances: owns PROTECT_CASH (DEC_OVERDUE), does NOT own the market-entry EXPAND decision", fin.ok && fin.ownedDecisions.some((d: any) => d.id === "DEC_OVERDUE") && !fin.ownedDecisions.some((d: any) => d.id === "DEC_MARKET_ENTRY"));
  check("Finances: executes nothing; forbidden actions include 'mark invoiced as collected' + 'report forecast as realized'", fin.executesNothing === true && fin.forbiddenActions.some((x: string) => /invoiced as collected/.test(x)) && fin.forbiddenActions.some((x: string) => /forecast as realized/.test(x)));

  const com = A.runAssistant("PILOTAGE_COMMERCIAL", ctx);
  check("Pilotage commercial: owns EXPAND (DEC_MARKET_ENTRY) + GATHER_EVIDENCE (DEC_EVIDENCE)", com.ok && com.ownedDecisions.some((d: any) => d.id === "DEC_MARKET_ENTRY") && com.ownedDecisions.some((d: any) => d.id === "DEC_EVIDENCE"));
  check("Pilotage commercial: market-entry stays level C + requiresApproval (never autonomous); forbidden 'enter a market autonomously'",
    com.ownedDecisions.find((d: any) => d.id === "DEC_MARKET_ENTRY").authorityLevel === "C" && com.ownedDecisions.find((d: any) => d.id === "DEC_MARKET_ENTRY").requiresApproval === true && com.forbiddenActions.some((x: string) => /enter a market autonomously/.test(x)));

  // UNKNOWN surfacing (commercial section absent ⇒ unknown>0 ⇒ not decidable).
  check("missing/unknown data surfaced (UNKNOWN ≠ 0): missingDataCount>0, decidable false across assistants", dg.missingDataCount > 0 && dg.decidable === false && com.missingDataCount > 0);

  // every owned decision across every assistant executes nothing (prepare/recommend only).
  check("across all assistants: every owned decision executionResult null (prepare/recommend, never execute)",
    [dg, fin, com].every((a: any) => a.ownedDecisions.every((d: any) => d.executionResult === null)));

  // unknown assistant fail-closed + determinism + contract.
  check("unknown assistant id ⇒ UNKNOWN_ASSISTANT (fail-closed)", A.runAssistant("MARKETING_XYZ", ctx).code === "UNKNOWN_ASSISTANT");
  check("deterministic + frozen", JSON.stringify(A.runAssistant("FINANCES", ctx)) === JSON.stringify(fin) && Object.isFrozen(A.ASSISTANTS));
  check("contract: functional projections reuse the surface (no dup); prepare-only, never execute; UNKNOWN≠0; PARTIAL not operational; 3 of 20",
    A.EXECUTIVE_ASSISTANTS_CONTRACT.reuses.some((x: string) => /odg-executive-surface/.test(x)) && A.EXECUTIVE_ASSISTANTS_CONTRACT.invariants.some((i: string) => /NEVER executes a significant act/.test(i)) && A.EXECUTIVE_ASSISTANTS_CONTRACT.invariants.some((i: string) => /NO assistant is claimed OPERATIONAL/.test(i)) && A.EXECUTIVE_ASSISTANTS_CONTRACT.invariants.some((i: string) => /Lot 1 is 3 of the 20/.test(i)));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-executive-assistants (V276 P2 Lot 1: Direction générale [oversight, whole queue] / Finances [PROTECT_CASH, forbidden invoiced≠collected] / Pilotage commercial [EXPAND+GATHER_EVIDENCE, market entry level C never autonomous] as functional role-scoped projections over the unified surface; all PREPARE/RECOMMEND only [execute nothing]; UNKNOWN≠0 surfaced; PARTIAL not OPERATIONAL; reuses surface — no dup)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
