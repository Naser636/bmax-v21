#!/usr/bin/env node
"use strict";
/* V279 §2-§4 (P2 Lot 4) — Clients/SAV / Concurrence / International functional assistants. Asserts real domain computation
 * (funnel invoiced≠cashed + overdue via billing; competitor gaps/evidence via V277; country ranking + level-C entry via V272/
 * V274), complaint-without-evidence ≠ established responsibility, competitor data SECONDARY_REVIEW, ranking≠decision, prepare-only,
 * PARTIAL maturity. SYNTHETIC. */
const A = require("./odg-commercial-assistants.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }
const crit = (s: number, st: string) => ({ score: s, status: st, source: "x" });
const FULL = (ms: number, pp: number, lf: number, ci: number, rc: number, pi: number, ec: number) => ({ marketSize: crit(ms, "ESTIMATED"), purchasingPower: crit(pp, "ESTIMATED"), languageFit: crit(lf, "ESTIMATED"), competitionIntensity: crit(ci, "ESTIMATED"), regulatoryComplexity: crit(rc, "ESTIMATED"), paymentInfra: crit(pi, "ESTIMATED"), entryCost: crit(ec, "ESTIMATED") });

function main() {
  const input = {
    surfaceCtx: { dashboard: { asOf: 10, nowDay: 12, odg: { missions: [{ id: "M1", status: "READY" }] } } },  // commercial absent ⇒ UNKNOWN
    opportunities: [{ stage: "INVOICED", amount: 1000 }, { stage: "CASHED", amount: 500 }],   // invoiced 1500, cashed 500 ⇒ invoicedNotCashed 1000
    billing: { asOfDay: 70, invoices: [{ id: "INV-PRG", amountTTCMinor: 42768, dueDay: 60 }], payments: [] },   // overdue 42768
    requests: [{ id: "r1", kind: "COMPLAINT", hasEvidence: false }, { id: "r2", kind: "COMPLAINT", hasEvidence: true }, { id: "r3", kind: "REQUEST" }],
    ranking: { countries: [{ code: "FR", provenanceRef: "eurostat", criteria: FULL(80, 85, 100, 70, 60, 90, 40) }] },
    entryPolicy: { minConfidence: 0 },
  };

  const lot = A.runLot4(input);
  check("runLot4: 3 assistants (Clients-SAV/Concurrence/International), all ok, all PREPARE-only, NONE operational; cross-view present",
    lot.ok && lot.assistantCount === 3 && lot.allPrepareOnly === true && lot.anyOperational === false && /without inventing dependencies/i.test(lot.crossView.note) && /12 of 20/.test(lot.note));

  const cs = A.runCommercialAssistant("CLIENTS_SAV", input);
  check("Clients/SAV: funnel invoiced 1500 ≠ cashed 500 (invoicedNotCashed 1000); overdue 42768 via billing (invoice ≠ collected)",
    cs.ok && cs.domainFindings.kind === "CLIENTS_SAV" && cs.domainFindings.funnelInvoiced === 1500 && cs.domainFindings.funnelCashed === 500 && cs.domainFindings.invoicedNotCashed === 1000 && cs.domainFindings.overdueMinor === 42768);
  check("Clients/SAV: complaint WITHOUT evidence is unverified (not established responsibility): complaints 2, verified 1, unverified 1",
    cs.domainFindings.complaintCount === 2 && cs.domainFindings.verifiedAnomalies === 1 && cs.domainFindings.unverifiedComplaints === 1);
  check("Clients/SAV: forbidden to mark invoice collected w/o evidence / send externally / treat unverified complaint as legal responsibility",
    cs.forbiddenActions.some((x: string) => /collected without evidence/.test(x)) && cs.forbiddenActions.some((x: string) => /send a client message externally/.test(x)) && cs.forbiddenActions.some((x: string) => /established legal responsibility/.test(x)) && cs.executesNothing === true);

  const co = A.runCommercialAssistant("CONCURRENCE", input);
  check("Concurrence: reuses V277 competitor-intel — gaps include AI-quote (ABSENT); demonstrated gaps become mission PROPOSALS",
    co.ok && co.domainFindings.kind === "CONCURRENCE" && co.domainFindings.odgGaps.some((g: string) => /AI quote/.test(g)) && co.domainFindings.missionProposals.length === co.domainFindings.odgGaps.length && co.domainFindings.missionProposals.length >= 1);
  check("Concurrence: evidence SECONDARY_REVIEW/LOW, NEEDS_PRIMARY_VERIFICATION, no official doc, no superiority claim; forbidden to create a 2nd radar",
    co.domainFindings.evidenceQuality.LOW >= 3 && co.domainFindings.needsPrimaryVerification >= 2 && co.domainFindings.noOfficialDoc === true && co.domainFindings.noSuperiorityClaim === true && co.forbiddenActions.some((x: string) => /second competitor radar/.test(x)));

  const intl = A.runCommercialAssistant("INTERNATIONAL", input);
  check("International: country ranking (FR top) + governed market-entry — level C, requiresApproval true (never autonomous)",
    intl.ok && intl.domainFindings.kind === "INTERNATIONAL" && intl.domainFindings.rankedCount >= 1 && intl.domainFindings.top === "FR" && intl.domainFindings.entryHasCandidate === true && intl.domainFindings.entryAuthority === "C" && intl.domainFindings.entryRequiresApproval === true);
  check("International: ranking ≠ decision, potential ≠ sales; forbidden to enter a market autonomously / confuse ranking with investment",
    intl.domainFindings.rankingIsNotDecision === true && intl.domainFindings.potentialIsNotSales === true && intl.forbiddenActions.some((x: string) => /enter a market autonomously/.test(x)) && intl.forbiddenActions.some((x: string) => /ranking with an investment decision/.test(x)));

  // UNKNOWN surfacing + maturity + fail-closed + determinism + contract.
  check("UNKNOWN ≠ 0 surfaced across assistants (commercial absent ⇒ missingDataCount>0, decidable false)", cs.missingDataCount > 0 && cs.decidable === false && co.missingDataCount > 0 && intl.missingDataCount > 0);
  check("every assistant: executesNothing true, maturity PARTIAL not operational", [cs, co, intl].every((a: any) => a.executesNothing === true && a.maturity.status === "PARTIAL" && a.maturity.operational === false));
  check("unknown assistant id ⇒ UNKNOWN_ASSISTANT (fail-closed)", A.runCommercialAssistant("LOGISTICS_XYZ", input).code === "UNKNOWN_ASSISTANT");
  check("deterministic + frozen", JSON.stringify(A.runCommercialAssistant("CONCURRENCE", input)) === JSON.stringify(co) && Object.isFrozen(A.COMMERCIAL_ASSISTANTS));
  check("contract: reuses V275/V277/V272/V274 + pipeline/billing (no 2nd radar/engine); invoiced≠cashed; competitor review≠fact; ranking≠decision; entry level C; PARTIAL",
    A.COMMERCIAL_ASSISTANTS_CONTRACT.reuses.some((x: string) => /V277/.test(x)) && A.COMMERCIAL_ASSISTANTS_CONTRACT.reuses.some((x: string) => /V272/.test(x)) && A.COMMERCIAL_ASSISTANTS_CONTRACT.invariants.some((i: string) => /INVOICED ≠ CASHED/.test(i)) && A.COMMERCIAL_ASSISTANTS_CONTRACT.invariants.some((i: string) => /never superior\/inferior without comparable criteria/.test(i)) && A.COMMERCIAL_ASSISTANTS_CONTRACT.invariants.some((i: string) => /market entry stays level C/.test(i)));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-commercial-assistants (V279 P2 Lot 4: Clients/SAV [funnel invoiced 1500≠cashed 500, overdue 42768, complaint-w/o-evidence≠responsibility, no external send] / Concurrence [reuses V277, AI-quote gap→mission proposal, SECONDARY_REVIEW/LOW/NEEDS_PRIMARY, no 2nd radar, no superiority claim] / International [FR top→level-C entry never autonomous, ranking≠decision/potential≠sales]; all PREPARE/RECOMMEND only; UNKNOWN≠0; PARTIAL not OPERATIONAL; 12/20 domains; reuse — no new engine)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
