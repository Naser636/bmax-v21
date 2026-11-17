#!/usr/bin/env node
"use strict";
/* V275 §2 (P0) — unified governed executive surface. Composes REAL dashboard/decision/ranking/market-entry outputs and asserts
 * the UNIFIED flow: one merged governed decision queue (D>C>B>A), CONFLICT (EXPAND vs PROTECT_CASH), DEPENDENCY (act vs
 * GATHER_EVIDENCE), governance roll-up (market entry always level C), data-integrity (UNKNOWN⇒not decidable), traceable history.
 * Reuses V271/V272/V274 — no new engine. SYNTHETIC. */
const S = require("./odg-executive-surface.js");
const DEVIS = require("./odg-btp-devis-engine.js");
const WORKFLOW = require("./odg-btp-project-workflow.js");
const BILLING = require("./odg-btp-billing-engine.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }
const crit = (score: number, status: string) => ({ score, status, source: "x" });
const FULL = (ms: number, pp: number, lf: number, ci: number, rc: number, pi: number, ec: number) => ({ marketSize: crit(ms, "ESTIMATED"), purchasingPower: crit(pp, "ESTIMATED"), languageFit: crit(lf, "ESTIMATED"), competitionIntensity: crit(ci, "ESTIMATED"), regulatoryComplexity: crit(rc, "ESTIMATED"), paymentInfra: crit(pi, "ESTIMATED"), entryCost: crit(ec, "ESTIMATED") });

function main() {
  const quotation = DEVIS.computeDevis({ overheadRate: 0.10, marginRate: 0.20, vatRate: 0.20, lines: [{ id: "L1", quantity: 100, materialQty: 100, materialUnitPriceMinor: 500, labourHours: 10, labourRateMinor: 4000, measurementState: "MEASURED" }] });
  const costLedger = WORKFLOW.actualCostLedger([{ phase: "PAID", category: "MATERIAL", amountMinor: 52000, evidenceRef: "f" }, { phase: "INVOICED", category: "LABOUR", amountMinor: 41000, evidenceRef: "s" }]);
  const invoiceLedger = BILLING.paymentLedger({ asOfDay: 70, invoices: [{ id: "INV-DEP", amountTTCMinor: 42768, dueDay: 30 }, { id: "INV-PRG", amountTTCMinor: 42768, dueDay: 60 }], payments: [{ invoiceId: "INV-DEP", amountMinor: 42768, evidenceRef: "e", txnRef: "t" }] });
  const terms = BILLING.paymentTerms({ projectId: "P", quotationRef: "Q", projectApproved: true, contractHTMinor: 118800, vatRate: 0.20, milestones: [{ id: "MS1", percent: 0.30 }] });
  const cashReconciliation = BILLING.cashReconciliation({ terms, invoiceLedger, costLedger, quotation });
  const schedule = WORKFLOW.planSchedule([{ id: "T1", percentComplete: 50 }, { id: "T2", dependencies: ["T1"], percentComplete: 0 }]);

  const surface = S.buildSurface({
    dashboard: { asOf: 10, nowDay: 12, finance: { cashReconciliation }, operations: { schedule }, odg: { missions: [{ id: "M1", status: "READY" }, { id: "M2", status: "OWNER_GATED" }] } },  // commercial ABSENT ⇒ UNKNOWN
    decisionPolicies: { overdueCeilingMinor: 10000 },
    ranking: { countries: [{ code: "FR", provenanceRef: "eurostat", criteria: FULL(80, 85, 100, 70, 60, 90, 40) }, { code: "ES", provenanceRef: "eurostat", criteria: FULL(70, 70, 90, 50, 50, 70, 50) }] },
    entryPolicy: { minConfidence: 0 },
  });
  const q = (id: string) => surface.decisionQueue.find((d: any) => d.id === id);

  check("surface ok; composes 4 capabilities into ONE merged governed queue", surface.ok && surface.decisionCount >= 5 && q("DEC_OVERDUE") && q("DEC_BLOCKED") && q("DEC_OWNER_GATED") && q("DEC_EVIDENCE") && q("DEC_MARKET_ENTRY"));
  check("merged queue sorted by authority D>C>B>A (severity non-increasing)", surface.decisionQueue.every((d: any, i: number) => i === 0 || ({ A: 1, B: 2, C: 3, D: 4 } as any)[surface.decisionQueue[i - 1].authorityLevel] >= ({ A: 1, B: 2, C: 3, D: 4 } as any)[d.authorityLevel]));
  check("thrust classification: market entry=EXPAND, overdue=PROTECT_CASH, blocked=RESOLVE_OPS, owner-gated=GOVERNANCE, evidence=GATHER_EVIDENCE",
    q("DEC_MARKET_ENTRY").thrust === "EXPAND" && q("DEC_OVERDUE").thrust === "PROTECT_CASH" && q("DEC_BLOCKED").thrust === "RESOLVE_OPS" && q("DEC_OWNER_GATED").thrust === "GOVERNANCE" && q("DEC_EVIDENCE").thrust === "GATHER_EVIDENCE");

  // CONFLICT: EXPAND (market entry) while cash PROTECTION (overdue) is pending.
  check("CONFLICT detected: EXPAND (DEC_MARKET_ENTRY) vs PROTECT_CASH (DEC_OVERDUE) — surfaced, not auto-resolved",
    surface.conflicts.some((c: any) => c.type === "CONFLICT" && c.between.indexOf("DEC_MARKET_ENTRY") >= 0 && c.between.indexOf("DEC_OVERDUE") >= 0 && /resolve financial protection before/.test(c.reason)));
  // DEPENDENCY: EXPAND and PROTECT depend on resolving GATHER_EVIDENCE first.
  check("DEPENDENCY detected: EXPAND + PROTECT depend on DEC_EVIDENCE (no act on unknown indicators)",
    surface.dependencies.some((d: any) => d.decision === "DEC_MARKET_ENTRY" && d.dependsOn === "DEC_EVIDENCE") && surface.dependencies.some((d: any) => d.decision === "DEC_OVERDUE" && d.dependsOn === "DEC_EVIDENCE"));

  // governance: market entry always level C; owner-gated count = C+D.
  check("governance: market entry level C + requiresApproval (allMarketEntryGated); ownerGatedCount = C+D",
    surface.governance.allMarketEntryGated === true && surface.marketEntry.authorityLevel === "C" && surface.marketEntry.requiresApproval === true && surface.governance.ownerGatedCount === surface.governance.byAuthority.C + surface.governance.byAuthority.D);
  check("governance: autonomousCount counts only requiresApproval===false (deny-by-default); every decision executionResult null",
    surface.governance.autonomousCount === surface.decisionQueue.filter((d: any) => d.requiresApproval === false).length && surface.decisionQueue.every((d: any) => d.executionResult === null));

  // data integrity: commercial UNKNOWN ⇒ unknown>0 ⇒ NOT decidable (UNKNOWN ≠ 0).
  check("data integrity: UNKNOWN cells present ⇒ decidable false (UNKNOWN ≠ 0, surfaced not hidden)", surface.dataIntegrity.unknown > 0 && surface.dataIntegrity.decidable === false && surface.dataIntegrity.kpiCount > 20);

  // traceable history: each decision → evidence + source.
  check("traceable history: every entry carries decisionId + authority + thrust + evidence + source", surface.history.length === surface.decisionCount && surface.history.every((h: any) => h.decisionId && h.authorityLevel && h.thrust && h.source));

  // no conflict/dependency when the queue is clean (only evidence gathering) — proves detection is real, not hardcoded.
  const clean = S.buildSurface({ dashboard: { asOf: 1, nowDay: 2 }, ranking: { countries: [] } });  // no finance ⇒ no overdue; empty ranking ⇒ entry=gather-evidence
  check("no EXPAND/PROTECT ⇒ zero conflicts (detection is real, not hardcoded)", clean.conflicts.length === 0 && !clean.decisionQueue.some((d: any) => d.thrust === "EXPAND"));

  // determinism + contract.
  check("deterministic + frozen", JSON.stringify(S.buildSurface({ dashboard: { asOf: 10, nowDay: 12, finance: { cashReconciliation } }, ranking: { countries: [] } })) === JSON.stringify(S.buildSurface({ dashboard: { asOf: 10, nowDay: 12, finance: { cashReconciliation } }, ranking: { countries: [] } })) && Object.isFrozen(surface.decisionQueue));
  check("contract: composes V271/V272/V274; no new engine; market entry always C; conflicts/deps surfaced not auto-resolved",
    S.EXECUTIVE_SURFACE_CONTRACT.reuses.length === 4 && S.EXECUTIVE_SURFACE_CONTRACT.invariants.some((i: string) => /no new engine/.test(i)) && S.EXECUTIVE_SURFACE_CONTRACT.invariants.some((i: string) => /ALWAYS level C/.test(i)) && S.EXECUTIVE_SURFACE_CONTRACT.invariants.some((i: string) => /never auto-resolved/.test(i)));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-executive-surface (V275 P0: unifies dashboard+decision+country-ranking+market-entry into ONE governed queue; CONFLICT EXPAND↔PROTECT_CASH + DEPENDENCY act↔GATHER_EVIDENCE detected/surfaced; market entry always level C human-approval; UNKNOWN⇒not decidable; traceable history; reuses V271/V272/V274 — no new engine)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
