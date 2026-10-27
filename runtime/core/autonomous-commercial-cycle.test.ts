#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the owner-only end-to-end cycle: ODG autonomously routes→qualifies→delivers→
// invoice-preps WITHOUT the owner, stops at the real external/human gate, surfaces ZERO routine owner tasks, and keeps
// actual cash €0. Unsuitable leads stop at qualification (no outreach). Synthetic input is a TEST.
"use strict";
const assert = require("assert");
const C = require("./autonomous-commercial-cycle.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const goodLead = { hasDependencyManifest: true, wantsDiagnosticOnly: true, budgetConfirmed: true, lawfulBasisForContact: true };
const cleanProject = { project: "demo", dependencies: [{ name: "a", version: "1", license: "MIT", outdated: false }], tests: { total: 10, passing: 10 }, aiActivities: {} };

// (1) full entry cycle: route A → qualify SUITABLE → deliver synthetic → invoice-prep → stop at external gate.
const r = C.runCycle({ subject: "dependency assurance diagnostic", budgetEur: 900, lead: goodLead, syntheticProject: cleanProject }, { at: "2026-10-27" });
ok("routes to A + runs ROUTE/QUALIFY/DELIVER/INVOICE autonomously", r.ok && r.axis === "A" && ["ROUTE", "QUALIFY", "DELIVER_SYNTHETIC", "INVOICE_PREP"].every(s => r.autonomousStepsCompleted.includes(s)));
ok("synthetic delivery produced a dossier (acceptance + seal)", r.trace.delivery.acceptancePassed === true && r.trace.delivery.seal);
ok("invoice-prep gate fail-closed (no accepted delivery ⇒ may NOT invoice)", r.trace.invoiceReadiness.mayIssueInvoice === false && r.trace.invoiceReadiness.blockers.length > 0);
ok("stops at the real external/human gate (not an owner routine task)", r.stoppedAt === "AWAIT_EXTERNAL_GATE" && /human\/external gates/i.test(r.stopReason));

// (2) owner handed ZERO routine tasks; 0 material decisions at this stage; cash €0.
ok("owner routine tasks = 0; owner decisions = 0; cash €0", r.ownerRoutineTasks === 0 && r.ownerDecisions.count === 0 && r.actualCashEUR === 0);

// (3) unsuitable lead ⇒ stops at QUALIFICATION, never reaches delivery/invoice/outreach.
const bad = C.runCycle({ subject: "dependency diagnostic", budgetEur: 900, lead: { hasDependencyManifest: false } }, { at: "2026-10-27" });
ok("unsuitable lead ⇒ stop at QUALIFICATION (no delivery, no outreach)", bad.stoppedAt === "QUALIFICATION_INSUFFICIENT" && !bad.autonomousStepsCompleted.includes("DELIVER_SYNTHETIC"));

// (4) higher-value subject routes to enterprise and qualifies via enterprise-qualification.
const ent = C.runCycle({ subject: "enterprise assurance programme", budgetEur: 40000, qualificationRecord: { problem: "p", impact: "i", budget: { status: "FUNDED" }, authority: { identified: true }, timeline: "Q", deliveryCapacity: "team", acceptanceCriteria: ["a"] } }, { at: "2026-10-27" });
ok("€40k ⇒ axis C, qualified, prepared (no synthetic delivery), stops at external gate", ent.axis === "C" && ent.trace.qualification.verdict === "QUALIFIED" && ent.stoppedAt === "AWAIT_EXTERNAL_GATE" && ent.ownerRoutineTasks === 0);

// (5) a MATERIAL decision supplied (e.g. contract signature) surfaces in the owner queue — routine never does.
const withMaterial = C.runCycle({ subject: "enterprise assurance", budgetEur: 40000, qualificationRecord: { problem: "p", impact: "i", budget: { status: "FUNDED" }, authority: { identified: true }, timeline: "Q", deliveryCapacity: "team", acceptanceCriteria: ["a"] } }, {
  at: "2026-10-27",
  ownerDecisionCandidates: [
    { title: "run tests", material: false },
    { title: "Sign MSA", material: true, signatureRequired: true, maxFinancialExposureEUR: 40000, recommendation: "sign", whyDecisionNeeded: "legal", risks: ["liability"], ifRejected: "no deal", ifNoAnswer: "no signature (safe)" },
  ],
});
ok("only the material (signature) decision reaches the owner; routine excluded", withMaterial.ownerDecisions.count === 1 && withMaterial.ownerDecisions.decisions[0].signatureRequired === true);

// (6) fail-closed + honesty note + deterministic.
ok("fail-closed: non-object ⇒ INVALID_INPUT", C.runCycle(null).code === "INVALID_INPUT");
ok("note: synthetic ≠ customer; nothing sent/collected; cash €0", /SYNTHETIC cycle/i.test(r.note) && /actual cash €0/i.test(r.note));
ok("reproducible", JSON.stringify(C.runCycle({ subject: "dependency assurance diagnostic", budgetEur: 900, lead: goodLead, syntheticProject: cleanProject }, { at: "2026-10-27" })) === JSON.stringify(r));

console.log(`\nAUTONOMOUS-COMMERCIAL-CYCLE suite — ${pass} assertions passed. (owner-only end-to-end: route→qualify→deliver→invoice-prep; stops at external gate; 0 routine owner tasks; cash €0)`);
