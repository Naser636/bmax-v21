#!/usr/bin/env node
"use strict";
/* V271 §7 — ODG executive decision engine. Feeds a REAL §6 dashboard, asserts the prioritized decision queue, authority
 * A/B/C/D enforcement (reused from V269), approval gating, the NEVER-decide-on-UNKNOWN rule, reserved-act dossier (level D,
 * no self-execution), and that executionResult is always null. Deterministic. SYNTHETIC inputs. */
const E = require("./odg-executive-decision-engine.js");
const D = require("./odg-executive-dashboard.js");
const DEVIS = require("./odg-btp-devis-engine.js");
const WORKFLOW = require("./odg-btp-project-workflow.js");
const BILLING = require("./odg-btp-billing-engine.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

function buildDash(costEntries: any[], blockedTasks: any[]) {
  const quotation = DEVIS.computeDevis({ overheadRate: 0.10, marginRate: 0.20, vatRate: 0.20, lines: [{ id: "L1", quantity: 100, materialQty: 100, materialUnitPriceMinor: 500, labourHours: 10, labourRateMinor: 4000, measurementState: "MEASURED" }] });
  const costLedger = WORKFLOW.actualCostLedger(costEntries);
  const invoiceLedger = BILLING.paymentLedger({ asOfDay: 70, invoices: [{ id: "INV-DEP", amountTTCMinor: 42768, dueDay: 30 }, { id: "INV-PRG", amountTTCMinor: 42768, dueDay: 60 }], payments: [{ invoiceId: "INV-DEP", amountMinor: 42768, evidenceRef: "e", txnRef: "t" }] });
  const terms = BILLING.paymentTerms({ projectId: "P1", quotationRef: "Q1", projectApproved: true, contractHTMinor: 118800, vatRate: 0.20, milestones: [{ id: "MS1", percent: 0.30 }] });
  const cashReconciliation = BILLING.cashReconciliation({ terms, invoiceLedger, costLedger, quotation });
  const schedule = WORKFLOW.planSchedule(blockedTasks);
  return D.buildDashboard({ asOf: 10, nowDay: 12, finance: { cashReconciliation }, financeEvidenceId: "F", operations: { schedule }, btp: { invoiceLedger }, odg: { missions: [{ id: "M1", status: "READY" }, { id: "M3", status: "OWNER_GATED" }] } });
  // commercial ABSENT ⇒ UNKNOWN cells present
}

function main() {
  // standard: realized(25800) > forecast(19800) ⇒ NO margin decision; overdue 37768; 1 blocked; 1 owner-gated; commercial UNKNOWN.
  const dash = buildDash([{ phase: "PAID", category: "MATERIAL", amountMinor: 52000, evidenceRef: "f" }, { phase: "INVOICED", category: "LABOUR", amountMinor: 41000, evidenceRef: "s" }], [{ id: "T1", percentComplete: 50 }, { id: "T2", dependencies: ["T1"], percentComplete: 0 }]);

  const noGuard = E.evaluate(dash, { overdueCeilingMinor: 10000 });
  check("decision queue built; sorted by authority D>C>B>A (severityRank non-increasing)", noGuard.ok && noGuard.decisionCount >= 4 && noGuard.queue.every((d: any, i: number) => i === 0 || noGuard.queue[i - 1].severityRank >= d.severityRank));
  const byId = (q: any, id: string) => q.queue.find((d: any) => d.id === id);

  // OWNER_GATED ⇒ level D, approval required, dossier-only, never force READY, executionResult null.
  const og = byId(noGuard, "DEC_OWNER_GATED");
  check("OWNER_GATED ⇒ level D, requiresApproval, executionResult null, recommends NOT forcing READY", og && og.authorityLevel === "D" && og.requiresApproval === true && og.executionResult === null && /do NOT force READY/.test(og.recommendedAction));

  // BLOCKED ⇒ level C, approval required.
  const bl = byId(noGuard, "DEC_BLOCKED");
  check("BLOCKED ⇒ level C, requiresApproval true, executionResult null", bl && bl.authorityLevel === "C" && bl.requiresApproval === true && bl.executionResult === null);

  // OVERDUE ⇒ level B; without an approved dunning policy, guards fail ⇒ requiresApproval true (escalates).
  const ov = byId(noGuard, "DEC_OVERDUE");
  check("OVERDUE ⇒ level B; no approved dunning policy ⇒ guards fail ⇒ requiresApproval true (escalate to human)", ov && ov.authorityLevel === "B" && ov.requiresApproval === true);
  // with the dunning guard satisfied, the same level-B decision becomes autonomous.
  const withGuard = E.evaluate(dash, { overdueCeilingMinor: 10000, dunningPolicyApproved: true });
  check("OVERDUE level B with approved dunning policy ⇒ guards pass ⇒ requiresApproval false (autonomous within rules)", byId(withGuard, "DEC_OVERDUE").requiresApproval === false);

  // NEVER decide on UNKNOWN: commercial cells are UNKNOWN ⇒ a level-A GATHER_EVIDENCE action, and NO decision references COM_*.
  const ev = byId(noGuard, "DEC_EVIDENCE");
  // the ONLY decision allowed to reference an UNKNOWN commercial cell is the gather-evidence one; no financial/operational
  // decision may act on unknown data.
  check("UNKNOWN/NO_DATA ⇒ level-A GATHER_EVIDENCE (autonomous, no approval); no NON-evidence decision acts on unknown data",
    ev && ev.authorityLevel === "A" && ev.requiresApproval === false && noGuard.queue.filter((d: any) => d.id !== "DEC_EVIDENCE").every((d: any) => !/^COM_/.test(String(d.evidence))));

  // NO margin decision when realized ≥ forecast.
  check("no margin-erosion decision when realized (25800) ≥ forecast (19800)", byId(noGuard, "DEC_MARGIN") === undefined);

  // margin erosion scenario: incurred 105000 ⇒ realized 13800 < forecast 19800 ⇒ level C decision appears.
  const dashErosion = buildDash([{ phase: "PAID", category: "MATERIAL", amountMinor: 60000, evidenceRef: "f" }, { phase: "INVOICED", category: "LABOUR", amountMinor: 45000, evidenceRef: "s" }], [{ id: "T1", percentComplete: 100 }]);
  const erosion = E.evaluate(dashErosion, {});
  const mg = byId(erosion, "DEC_MARGIN");
  check("margin erosion (realized 13800 < forecast 19800) ⇒ level C review decision, executionResult null", mg && mg.authorityLevel === "C" && /erosion 6000/.test(mg.condition) && mg.executionResult === null);

  // every decision is a proposal only (executionResult null) and carries full §7 fields.
  check("every decision: executionResult null (propose, never self-execute) + full §7 fields present",
    noGuard.queue.every((d: any) => d.executionResult === null && d.condition && d.evidence && d.recommendedAction && E.AUTHORITY.indexOf(d.authorityLevel) >= 0 && Array.isArray(d.options) && Array.isArray(d.risks)));
  check("byAuthority tally + autonomous/approval split consistent with queue",
    noGuard.byAuthority.A + noGuard.byAuthority.B + noGuard.byAuthority.C + noGuard.byAuthority.D === noGuard.decisionCount && noGuard.autonomousCount + noGuard.approvalRequiredCount === noGuard.decisionCount);

  // requiresApproval helper + determinism + contract.
  check("requiresApproval: A false; C/D always true; B true unless guards pass", E.requiresApproval("A", true) === false && E.requiresApproval("C", true) === true && E.requiresApproval("D", true) === true && E.requiresApproval("B", true) === false && E.requiresApproval("B", false) === true);
  check("deterministic + frozen", JSON.stringify(E.evaluate(dash, { overdueCeilingMinor: 10000 })) === JSON.stringify(E.evaluate(dash, { overdueCeilingMinor: 10000 })) && Object.isFrozen(E.AUTHORITY));
  check("contract: reuses V269 A/B/C/D + §6 dashboard; no decision on UNKNOWN; level D dossier-only; no LLM override; executionResult null",
    E.EXECUTIVE_DECISION_ENGINE_CONTRACT.reuses.some((r: string) => /V269/.test(r)) && E.EXECUTIVE_DECISION_ENGINE_CONTRACT.invariants.some((i: string) => /NO decision on UNKNOWN/.test(i)) && E.EXECUTIVE_DECISION_ENGINE_CONTRACT.invariants.some((i: string) => /never self-executes/.test(i)) && E.EXECUTIVE_DECISION_ENGINE_CONTRACT.invariants.some((i: string) => /no 2nd taxonomy/.test(i)));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-executive-decision-engine (V271 §7: deterministic decision queue from the §6 dashboard; authority A/B/C/D reused from V269; OWNER_GATED⇒level D dossier-only [never force READY]; BLOCKED⇒C; OVERDUE⇒B [autonomous only when dunning guard passes]; margin erosion⇒C; UNKNOWN⇒level-A gather-evidence [NO decision on unknown data]; executionResult always null [propose, never self-execute]; no LLM override)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
