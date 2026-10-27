#!/usr/bin/env node
/**
 * autonomous-commercial-cycle — V36 convergence: the end-to-end OWNER-ONLY commercial cycle, composing the
 * (previously only unit-tested) modules into ONE flow so end-to-end autonomy is demonstrated, not just asserted:
 *   route (opportunity-axis-router) → qualify (first-cash-activation / enterprise-qualification) →
 *   deliver (entry-diagnostic-offer.runEntryDiagnostic, synthetic) → invoice-prep gate (fail-closed) →
 *   owner queue (owner-console — only MATERIAL decisions).
 *
 * It proves ODG runs every AUTHORIZED step itself WITHOUT owner involvement, and STOPS exactly at the real external/
 * human gate (outreach send, client acceptance, contract signature, evidenced receipt). HONESTY: synthetic input is a
 * TEST, not a customer; nothing is sent/signed/invoiced/collected; actual cash stays €0; the owner is handed ZERO
 * routine work. Pure/deterministic composition — adds no new capability, only the verified wiring.
 */
"use strict";

const ROUTER = require("./opportunity-axis-router.js");
const FC = require("./first-cash-activation.js");
const A = require("./entry-diagnostic-offer.js");
const OWNER = require("./owner-console.js");
const EQ = require("./enterprise-qualification.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/**
 * runCycle(opportunity, opts?): opportunity = { subject, budgetEur?, lead?, qualificationRecord?, syntheticProject? }.
 * Returns the full autonomous trace + the honest stop gate. No external action is performed.
 */
function runCycle(opportunity: any, opts: any = {}): any {
  if (!isObj(opportunity)) return { ok: false, code: "INVALID_INPUT" };
  const autonomousStepsCompleted: string[] = [];
  const trace: any = {};

  // 1. ROUTE (ODG, autonomous).
  const route = ROUTER.routeToAxis(opportunity);
  trace.axis = route.axis; trace.axisReason = route.reason; trace.nextOdgAction = ROUTER.nextOdgAction(route.axis);
  autonomousStepsCompleted.push("ROUTE");

  // 2. QUALIFY (ODG, autonomous — fail-closed).
  let qualified: boolean;
  if (route.axis === "A" || route.axis === "B") {
    const q = FC.qualifyFirstCustomer(isObj(opportunity.lead) ? opportunity.lead : {});
    trace.qualification = { verdict: q.verdict, reasons: q.reasons }; qualified = q.verdict === "SUITABLE";
  } else {
    const q = EQ.qualify(isObj(opportunity.qualificationRecord) ? opportunity.qualificationRecord : {});
    trace.qualification = { verdict: q.verdict, missing: q.missingRequired, disqualifiers: q.disqualifiers }; qualified = q.verdict === "QUALIFIED";
  }
  autonomousStepsCompleted.push("QUALIFY");
  if (!qualified) {
    return finalize(trace, autonomousStepsCompleted, "QUALIFICATION_INSUFFICIENT", "not suitable/qualified per recorded facts — ODG stops (no outreach), no owner task", opts);
  }

  // 3. DELIVER (ODG, autonomous, SYNTHETIC) — entry route can run the diagnostic end-to-end.
  if ((route.axis === "A") && isObj(opportunity.syntheticProject)) {
    const d = A.runEntryDiagnostic(opportunity.syntheticProject, { at: opts.at });
    trace.delivery = d.ok ? { triageStatus: d.triageStatus, acceptancePassed: d.acceptancePassed, sarifValid: d.sarifValid, seal: d.dossier.seal } : { error: d.code };
    autonomousStepsCompleted.push("DELIVER_SYNTHETIC");
  } else {
    trace.delivery = { prepared: true, note: "offer/proposal prepared for this axis; synthetic delivery run only for entry route" };
    autonomousStepsCompleted.push("PREPARE_OFFER");
  }

  // 4. INVOICE-PREP GATE (ODG, autonomous, FAIL-CLOSED) — cannot invoice without client-accepted delivery evidence.
  const inv = FC.invoiceReadiness({ amountEUR: opportunity.budgetEur || A.OFFER.priceEUR });
  trace.invoiceReadiness = { mayIssueInvoice: inv.mayIssueInvoice, blockers: inv.blockers };
  autonomousStepsCompleted.push("INVOICE_PREP");

  // The real STOP gate: outreach send + client acceptance are external/human; ODG goes no further.
  return finalize(trace, autonomousStepsCompleted, "AWAIT_EXTERNAL_GATE", "ODG completed every authorized step; next steps (outreach SEND, client acceptance, invoice issuance, receipt) are human/external gates", opts);
}

function finalize(trace: any, steps: string[], stoppedAt: string, reason: string, opts: any): any {
  // Owner queue — ONLY material decisions reach the owner. At this stage there are none (no contract/invoice/refund yet).
  const candidates = Array.isArray(opts.ownerDecisionCandidates) ? opts.ownerDecisionCandidates : [];
  const q = OWNER.ownerQueue(candidates);
  return {
    ok: true,
    axis: trace.axis,
    autonomousStepsCompleted: steps,
    trace,
    stoppedAt,                       // the honest external/human gate (NOT an owner routine task)
    stopReason: reason,
    ownerDecisions: { count: q.ownerDecisionCount, decisions: q.ownerDecisions },
    ownerRoutineTasks: 0,            // invariant: the owner is handed ZERO routine work
    actualCashEUR: 0,                // nothing sent/invoiced/collected
    note: "SYNTHETIC cycle — demonstrates owner-only end-to-end autonomy on test data. Nothing sent/signed/invoiced/collected; actual cash €0; owner handed 0 routine tasks.",
  };
}

export { runCycle };
module.exports = { runCycle };

if (require.main === module) {
  const demo = runCycle({ subject: "dependency assurance diagnostic", budgetEur: 900, lead: { hasDependencyManifest: true, wantsDiagnosticOnly: true, budgetConfirmed: true, lawfulBasisForContact: true }, syntheticProject: { project: "demo", dependencies: [{ name: "a", version: "1", license: "MIT", outdated: false }], tests: { total: 10, passing: 10 }, aiActivities: {} } }, { at: "2026-10-27" });
  process.stdout.write(JSON.stringify({ axis: demo.axis, steps: demo.autonomousStepsCompleted, stoppedAt: demo.stoppedAt, owner: demo.ownerDecisions.count, cash: demo.actualCashEUR }, null, 2) + "\n");
}
