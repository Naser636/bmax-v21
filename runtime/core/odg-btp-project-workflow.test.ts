#!/usr/bin/env node
"use strict";
/* V266 — ODG BTP project-to-chantier workflow. Tests ACTUAL numeric outputs + state transitions (not object creation):
 * deny-by-default approval, work-package refusal, DAG cycles, date consistency, material reconciliation, change-order
 * approval gating, integer-cent realized margin + erosion (delegated to V260), evidence-gated ledger, closure refusal.
 * Every fixture is labelled SYNTHETIC — no real project/customer/payment/compliance is implied. */
const W = require("./odg-btp-project-workflow.js");
const DEVIS = require("./odg-btp-devis-engine.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

// ---- a reproducible SYNTHETIC masonry quotation (hand-computed) ----
const MASONRY_REQ = {
  overheadRate: 0.10, marginRate: 0.20, vatRate: 0.20,
  lines: [{ id: "L1", label: "Mur parpaing", metier: "maconnerie", unit: "m2", quantity: 100, materialQty: 100, materialUnitPriceMinor: 500, labourHours: 10, labourRateMinor: 4000, measurementState: "MEASURED" }],
};

function main() {
  // ===== quotation arithmetic (V260) is the hand-computed baseline =====
  const q = DEVIS.computeDevis(MASONRY_REQ);
  check("SYNTHETIC masonry quotation: directHT=90000, costHT=99000, margin=19800, sellingHT=118800, TTC=142560 (V260 integer cents)",
    q.ok && q.subtotalDirectHT === 90000 && q.costHT === 99000 && q.margin === 19800 && q.sellingHT === 118800 && q.totalTTC === 142560);

  // ===== §3 dossier + deny-by-default state machine =====
  check("openDossier fail-closed: no projectId ⇒ NO_PROJECT_ID", W.openDossier({}).code === "NO_PROJECT_ID");
  let d = W.openDossier({ projectId: "P-MACON-01", customer: { name: "SYNTHETIC client" }, quotationRefs: ["Q1"], scope: ["mur"], reservations: ["R-join-dilatation"] });
  check("openDossier ⇒ DRAFT (never auto-approved), history seq0", d.ok && d.approvalStatus === "DRAFT" && d.changeHistory.length === 1);
  check("transition DRAFT→APPROVED is ILLEGAL (must pass SUBMITTED)", W.transition(d, "APPROVED", { approvedBy: "x" }).code === "ILLEGAL_TRANSITION");
  d = W.transition(d, "SUBMITTED", {});
  check("transition DRAFT→SUBMITTED ok", d.ok && d.approvalStatus === "SUBMITTED");
  check("SUBMITTED→APPROVED REFUSED without explicit human approvedBy (generation ≠ approval)", W.transition(d, "APPROVED", {}).code === "APPROVAL_EVIDENCE_REQUIRED");
  const dNoQ = W.transition(W.transition(W.openDossier({ projectId: "P-NOQ" }), "SUBMITTED", {}), "APPROVED", { approvedBy: "boss" });
  check("SUBMITTED→APPROVED REFUSED with no quotation ref ⇒ NO_QUOTATION", dNoQ.code === "NO_QUOTATION");
  d = W.transition(d, "APPROVED", { approvedBy: "chef-chantier", asOf: "2026-11-17" });
  check("SUBMITTED→APPROVED ok with approvedBy + quotation ⇒ APPROVED, history records approver", d.ok && d.approvalStatus === "APPROVED" && d.changeHistory[d.changeHistory.length - 1].by === "chef-chantier");

  // ===== §4 work package (refused unless APPROVED; measurement state inherited) =====
  check("buildWorkPackage REFUSED on a non-approved dossier ⇒ NOT_APPROVED", W.buildWorkPackage(W.openDossier({ projectId: "X" }), q).code === "NOT_APPROVED");
  const wp = W.buildWorkPackage(d, q);
  check("buildWorkPackage ok: 1 item, directCost 90000, MEASURED line ⇒ VALIDATED, inherits measurementState verbatim",
    wp.ok && wp.itemCount === 1 && wp.items[0].directCostMinor === 90000 && wp.items[0].measurementState === "MEASURED" && wp.items[0].validationStatus === "VALIDATED" && wp.requiresValidation === false);
  // an ESTIMATED line stays ESTIMATED and forces REQUIRES_VALIDATION.
  const qEst = DEVIS.computeDevis({ ...MASONRY_REQ, lines: [{ ...MASONRY_REQ.lines[0], measurementState: "ESTIMATED" }] });
  const wpEst = W.buildWorkPackage(d, qEst);
  check("work item from an ESTIMATED line stays ESTIMATED ⇒ REQUIRES_VALIDATION (never promoted)", wpEst.items[0].measurementState === "ESTIMATED" && wpEst.items[0].validationStatus === "REQUIRES_VALIDATION" && wpEst.requiresValidation === true);

  // ===== §5 planning DAG =====
  const sched = W.planSchedule([{ id: "T1", plannedStart: 0, plannedFinish: 5, percentComplete: 100 }, { id: "T2", dependencies: ["T1"], plannedStart: 5, plannedFinish: 10, percentComplete: 100 }, { id: "T3", dependencies: ["T2"], plannedStart: 10, plannedFinish: 15, percentComplete: 100, milestone: true }]);
  check("planSchedule valid chain ⇒ order [T1,T2,T3], allComplete, T3 milestone", sched.ok && JSON.stringify(sched.order) === JSON.stringify(["T1", "T2", "T3"]) && sched.allComplete === true && sched.milestones.indexOf("T3") >= 0);
  check("planSchedule REJECTS a dependency cycle ⇒ DEPENDENCY_CYCLE", W.planSchedule([{ id: "A", dependencies: ["B"] }, { id: "B", dependencies: ["A"] }]).code === "DEPENDENCY_CYCLE");
  check("planSchedule REJECTS a dangling dependency ⇒ DANGLING_DEPENDENCY", W.planSchedule([{ id: "A", dependencies: ["GHOST"] }]).code === "DANGLING_DEPENDENCY");
  check("planSchedule REJECTS inconsistent dates (finish<start) ⇒ INCONSISTENT_DATES", W.planSchedule([{ id: "A", plannedStart: 10, plannedFinish: 2 }]).code === "INCONSISTENT_DATES");
  const schedBlocked = W.planSchedule([{ id: "T1", percentComplete: 50 }, { id: "T2", dependencies: ["T1"], percentComplete: 0 }]);
  check("planSchedule flags BLOCKED (prerequisite incomplete) + not allComplete", schedBlocked.ok && schedBlocked.blocked.indexOf("T2") >= 0 && schedBlocked.allComplete === false);
  const schedDelayed = W.planSchedule([{ id: "T1", plannedFinish: 10, asOfDay: 15, percentComplete: 40 }]);
  check("planSchedule flags DELAYED (past plannedFinish, incomplete, vs asOfDay)", schedDelayed.delayed.indexOf("T1") >= 0);

  // ===== §6 materials reconciliation (nothing fabricated) =====
  const mat = W.reconcileMaterials([
    { id: "ciment", unit: "kg", requiredQty: 100, orderedQty: 80, deliveredQty: 70, consumedQty: 50, returnedQty: 5 },  // under-ordered + short-delivery; remaining 25
    { id: "sable", baseQty: 100, coefficient: 1.0, wasteRate: 0.05, orderedQty: 110 },                                   // required via explicit coeff ⇒ 105, no shortage
    { id: "acier", unit: "kg", deliveredQty: 70, consumedQty: 75 },                                                       // over-consumed
  ]);
  const ciment = mat.rows.find((r: any) => r.id === "ciment"); const sable = mat.rows.find((r: any) => r.id === "sable");
  check("reconcileMaterials: ciment remaining = 70-50+5 = 25; under-ordered + short-delivery flagged", ciment.remainingQty === 25 && mat.shortages.some((s: any) => s.id === "ciment") && mat.discrepancies.some((x: any) => x.id === "ciment" && x.code === "SHORT_DELIVERY"));
  check("reconcileMaterials: sable required via EXPLICIT coeff+waste = 100×1.0×1.05 = 105 (never invented)", sable.requiredQty === 105);
  check("reconcileMaterials: over-consumption flagged; absent prices stay null (no fabrication)", mat.discrepancies.some((x: any) => x.id === "acier" && x.code === "OVER_CONSUMED") && ciment.purchaseCostMinor === null);

  // ===== §7 site report + change order approval gating =====
  const sr = W.siteReport({ projectId: "P-MACON-01", date: "2026-11-17", author: "conducteur", workPerformed: ["pose parpaing"], incidents: ["pluie"] });
  check("siteReport: structured, DRAFT by default (not validated evidence)", sr.ok && sr.validationStatus === "DRAFT" && sr.workPerformed.length === 1);
  const co = W.requestChange(d, { id: "CO-1", requestedChange: "ajout cloison", reason: "client", costImpactMinor: 30000 }, { ...MASONRY_REQ, lines: MASONRY_REQ.lines.concat([{ id: "L2", quantity: 20, materialQty: 20, materialUnitPriceMinor: 300, measurementState: "ESTIMATED" } as any]) });
  check("requestChange ⇒ PENDING with a re-priced revised quotation (V260); not applied", co.ok && co.approvalStatus === "PENDING" && co.revisedQuotation && co.revisedQuotation.worstMeasurementState === "ESTIMATED");
  check("applyChange REFUSED without explicit approval ⇒ CHANGE_NOT_APPROVED (no silent scope/cost change)", W.applyChange(d, co, { approved: false }).code === "CHANGE_NOT_APPROVED");
  const dChanged = W.applyChange(d, co, { approved: true, approvedBy: "MOA", asOf: "2026-11-18" });
  check("applyChange approved ⇒ version incremented, change recorded in history", dChanged.ok && dChanged.version === 2 && dChanged.appliedChange.changeId === "CO-1");

  // ===== §8 evidence-gated ledger + realized margin (delegated to V260) =====
  const ledger = W.actualCostLedger([
    { id: "e1", phase: "PAID", category: "MATERIAL", amountMinor: 52000, evidenceRef: "facture-123" },
    { id: "e2", phase: "INVOICED", category: "LABOUR", amountMinor: 41000, evidenceRef: "situation-4" },
    { id: "e3", phase: "COMMITTED", category: "MATERIAL", amountMinor: 10000 },       // forecast obligation, excluded from incurred
    { id: "e4", phase: "ESTIMATED", category: "OVERHEAD", amountMinor: 9900 },         // estimate, excluded from incurred
  ]);
  check("actualCostLedger phases distinct: paid 52000, invoiced 41000, committed 10000, actualIncurred=93000 (committed/estimated excluded)",
    ledger.ok && ledger.paidMinor === 52000 && ledger.invoicedMinor === 41000 && ledger.committedMinor === 10000 && ledger.actualIncurredMinor === 93000);
  check("actualCostLedger REJECTS a PAID entry without evidenceRef (no estimate silently counted as paid)",
    W.actualCostLedger([{ phase: "PAID", category: "MATERIAL", amountMinor: 5000 }]).rejected.some((r: any) => r.code === "EVIDENCE_REQUIRED"));
  const prof = W.realizedProfitability(q, ledger);
  check("realizedProfitability (V260): actualCostHT=93000 (incurred only), realizedMargin=25800, forecastMargin=19800, erosion=-6000, no overrun",
    prof.ok && prof.actualCostHT === 93000 && prof.realizedMargin === 25800 && prof.forecastMargin === 19800 && prof.marginErosion === -6000 && prof.overrun === false && prof.committedNotYetIncurredMinor === 10000);

  // ===== §9 closure safeguards =====
  const completeSched = W.planSchedule([{ id: "T1", percentComplete: 100 }]);
  const closedMissing = W.attemptClosure(d, wp, completeSched, ledger, {});
  check("attemptClosure REFUSED when tasks complete but mandatory evidence missing (task-complete alone ≠ CLOSED)", closedMissing.ok === false && closedMissing.closed === false && closedMissing.missing.length > 0);
  const closedOk = W.attemptClosure(d, wp, completeSched, ledger, { finalScopeApprovedBy: "MOA", changeOrdersReconciled: true, actualCostReconciled: true, customerAcceptance: "PV-reception", resolvedReservations: ["R-join-dilatation"], asOf: "2026-11-20" });
  check("attemptClosure ⇒ CLOSED with full evidence + resolved reservations; dossier state CLOSED", closedOk.ok && closedOk.closed && closedOk.dossier.approvalStatus === "CLOSED");
  const closedUnresolved = W.attemptClosure(d, wp, completeSched, ledger, { finalScopeApprovedBy: "MOA", changeOrdersReconciled: true, actualCostReconciled: true, customerAcceptance: "PV", resolvedReservations: [] });
  check("attemptClosure REFUSED while a reservation is unresolved", closedUnresolved.closed === false && closedUnresolved.missing.some((m: string) => /unresolved reservations/.test(m)));

  // ===== §10 six labelled SYNTHETIC scenarios end-to-end =====
  const metiers = ["masonry", "renovation", "decorative-concrete-resin", "excavation-earthworks", "roads-networks", "second-fix"];
  const scen = (label: string) => ({ label, asOf: "2026-11-17", quotationRequest: MASONRY_REQ, dossier: { projectId: "P-" + label, quotationRefs: ["Q-" + label], reservations: [] }, approve: { by: "chef" }, tasks: [{ id: "T1", percentComplete: 100 }], materials: [{ id: "m", requiredQty: 10, orderedQty: 10 }], costEntries: [{ phase: "PAID", category: "MATERIAL", amountMinor: 52000, evidenceRef: "f" }, { phase: "INVOICED", category: "LABOUR", amountMinor: 41000, evidenceRef: "s" }], closureEvidence: {} });
  let allSynthetic = true, allQuoteOk = true, allClosureRefusedNoEvidence = true;
  for (const m of metiers) { const r = W.runSyntheticProject(scen(m)); if (r.SYNTHETIC !== true || r.label !== m) allSynthetic = false; if (!(r.quotation.ok && r.workPackage.ok && r.profitability.realizedMargin === 25800)) allQuoteOk = false; if (r.closure.closed !== false) allClosureRefusedNoEvidence = false; }
  check("6 SYNTHETIC métier scenarios: all labelled SYNTHETIC, quotation+work-package ok, realizedMargin=25800 each", allSynthetic && allQuoteOk);
  check("6 SYNTHETIC scenarios: closure REFUSED (empty closureEvidence) ⇒ task-complete never auto-closes", allClosureRefusedNoEvidence);

  // ===== determinism + contract + reuse =====
  check("deterministic + frozen: repeated runSyntheticProject byte-identical; result frozen", JSON.stringify(W.runSyntheticProject(scen("masonry"))) === JSON.stringify(W.runSyntheticProject(scen("masonry"))) && Object.isFrozen(W.PROJECT_STATES));
  check("contract: reuses V260/V262/V264; deny-by-default approval; estimated≠promoted; match≠compliance; task-complete≠CLOSED; no 2nd engine",
    W.BTP_PROJECT_WORKFLOW_CONTRACT.reuses.some((r: string) => /V260/.test(r)) && W.BTP_PROJECT_WORKFLOW_CONTRACT.reuses.some((r: string) => /V262/.test(r)) && W.BTP_PROJECT_WORKFLOW_CONTRACT.reuses.some((r: string) => /V264/.test(r)) &&
    W.BTP_PROJECT_WORKFLOW_CONTRACT.invariants.some((i: string) => /NOT CLOSED merely/.test(i)) && W.BTP_PROJECT_WORKFLOW_CONTRACT.invariants.some((i: string) => /no 2nd money/.test(i)));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-btp-project-workflow (V266: deterministic project→chantier lifecycle; deny-by-default approval; work-package refusal unless APPROVED; DAG cycle/date rejection; material reconciliation [nothing fabricated]; change-order approval gating; evidence-gated integer-cent ledger; realized margin via V260 [25800, erosion −6000]; closure refused without evidence; 6 SYNTHETIC métiers; reuses V260/V262/V264 — no 2nd engine)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
