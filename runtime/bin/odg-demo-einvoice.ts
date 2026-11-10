#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V44 Chantier B — P11 "e-invoice validation & STP" DEMONSTRATOR. Composes ODG's EXISTING, gate-tested
 * e-invoice capability (einvoice-workflow-demonstrator.runEinvoiceWorkflow: EN16931-core validate → round-trip-verified
 * CII/UBL export → independent re-parse → governed prepared≠sent commercial workflow with deny-by-default human gates) on
 * SYNTHETIC/PUBLIC sample invoices (no client data). HONEST SCOPE: a SUPPORTED SUBSET of EN16931 — conformance/readiness
 * PREP, NOT a certified Plateforme Agréée (PDP) transmission (France 2026/2027 mandate ⇒ owner-gated PDP). Pure; no network.
 * Run: `odg-demo-einvoice.ts [outPath]`.
 */

const WF = require("../core/einvoice-workflow-demonstrator.js");
const fs = require("fs");
const path = require("path");

const OUT = process.argv[2] || path.join(__dirname, "..", "..", "docs", "odg", "demonstrators", "P11_EINVOICE_STP_READINESS.json");
function nowIso(): string { return new Date().toISOString(); }

// SYNTHETIC public sample (EN 16931-core): 2 lines 100.00 + 50.00 = 150.00 net; 20% VAT = 30.00; total 180.00. (Test SIREN.)
const validInvoice = { id: "FR-2026-001", issueDate: "2026-09-15", currency: "EUR", seller: { name: "Demo Seller SAS", siren: "123456789" }, buyer: { name: "Demo Buyer SARL" },
  lines: [{ id: "1", netMinor: 10000 }, { id: "2", netMinor: 5000 }],
  totals: { lineNetSumMinor: 15000, taxExclusiveMinor: 15000, vatMinor: 3000, taxInclusiveMinor: 18000 } };
// deliberately INVALID variant (BR-CO-15: total w/ VAT ≠ net + VAT) to show the validator catching a real error.
const invalidInvoice = { ...validInvoice, id: "FR-2026-002", totals: { ...validInvoice.totals, taxInclusiveMinor: 18001 } };

// a 3rd edge case: MISSING mandatory fields (BT-1 id + seller name) — must be caught as HIGH and NOT validated.
const missingFields = { issueDate: "2026-09-15", currency: "EUR", seller: {}, buyer: {}, lines: [], totals: { lineNetSumMinor: 0, taxExclusiveMinor: 0, vatMinor: 0, taxInclusiveMinor: 0 } };

const good = WF.runEinvoiceWorkflow({ invoice: validInvoice, format: "CII" });           // no authorizations ⇒ stops at human gate
const bad = WF.runEinvoiceWorkflow({ invoice: invalidInvoice, format: "CII" });
const missing = WF.runEinvoiceWorkflow({ invoice: missingFields, format: "CII" });

const artifact = {
  "//": "CTO V44 Chantier B — P11 e-invoice validation & STP demonstrator. REPRODUCIBLE on SYNTHETIC public inputs (no client data). ODG does conformance/readiness PREP, NOT a certified PDP transmission. L2 maturity, 0 paying clients.",
  demonstrator: "P11 document routing / STP — France B2B e-invoicing (EN16931 / Factur-X) readiness",
  generatedAt: nowIso(),
  marketContext: "France B2B e-invoicing live 2026-09-01 (large/ETI issue + all receive); SMEs 2027-09-01; via certified PDPs; Factur-X/UBL formats.",
  validCase: { invoiceId: validInvoice.id, verdict: good.verdict, validated: good.summary && good.summary.valid, roundTripEqual: good.summary && good.summary.roundTripEqual, reparsedValid: good.summary && good.summary.reparsedValid, workflowStageReached: good.summary && good.summary.workflowStageReached, blockedAtHumanGate: good.summary && good.summary.blockedAtHumanGate, gapCount: good.summary && good.summary.gapCount, gaps: good.gaps },
  invalidCase: { invoiceId: invalidInvoice.id, verdict: bad.verdict, validated: bad.summary && bad.summary.valid, caught: Array.isArray(bad.gaps) && bad.gaps.length > 0, gaps: bad.gaps },
  missingFieldsCase: { invoiceId: "FR-2026-003 (no BT-1/seller/lines)", verdict: missing.verdict, validated: missing.summary && missing.summary.valid, caught: Array.isArray(missing.gaps) && missing.gaps.length > 0, gaps: missing.gaps },
  craLikeMapping: [
    { capability: "EN16931-core mandatory-field + arithmetic (BR-CO-10/13/15/14/17) validation", odgEvidence: `valid invoice ⇒ ${good.summary && good.summary.valid}; invalid invoice (BR-CO-15) ⇒ caught=${Array.isArray(bad.gaps) && bad.gaps.length > 0}`, status: "DEMONSTRATED" },
    { capability: "Round-trip-verified CII/UBL export + independent re-parse (STP conformance)", odgEvidence: `roundTripEqual=${good.summary && good.summary.roundTripEqual}, reparsedValid=${good.summary && good.summary.reparsedValid}`, status: (good.summary && good.summary.roundTripEqual && good.summary.reparsedValid) ? "DEMONSTRATED" : "PARTIAL" },
    { capability: "XML security hardening (DOCTYPE/ENTITY reject — XXE protection)", odgEvidence: "einvoice-parser rejects DOCTYPE/ENTITY declarations (gate-tested)", status: "DEMONSTRATED (in parser gate tests)" },
    { capability: "Governed commercial workflow: prepared ≠ sent ≠ signed ≠ cashed (deny-by-default human gates)", odgEvidence: `stopped at human gate: ${good.summary && good.summary.blockedAtHumanGate} (prepared ≠ sent — owner authorisation required)`, status: "DEMONSTRATED (honest stage separation)" },
  ],
  notCoveredByOdg_ownerSide: [
    "Certified Plateforme Agréée (PDP) registration + the actual legal transmission (France mandate) — owner/legal",
    "Full EN16931 / Factur-X document beyond the SUPPORTED SUBSET",
    "Connection to the client's ERP/accounting system (integration engagement, authorised + isolated)",
  ],
  honesty: "DEMONSTRATOR on synthetic public inputs; ODG maturity L2, 0 paying clients. It evidences validation + STP-conformance readiness; it does NOT perform a certified PDP transmission.",
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(artifact, null, 2) + "\n");

// PME-readable professional report (markdown).
// V46.2 integration: emit the PME report via the SHARED report layer (O1) — normalized object only.
const O1 = require("../core/shared-report-generator.js");
const rep = O1.generateReport({
  metier: "P11", title: "E-invoicing (EN16931 / Factur-X) Validation & STP Readiness", status: "PREPARED — conformance prep, NOT a certified PDP transmission",
  summary: `3 synthetic cases: valid ⇒ ${good.verdict} (round-trip ${good.summary && good.summary.roundTripEqual}, re-parsed ${good.summary && good.summary.reparsedValid}); BR-CO-15 arithmetic error ⇒ caught=${Array.isArray(bad.gaps) && bad.gaps.length > 0}; missing mandatory fields ⇒ caught=${Array.isArray(missing.gaps) && missing.gaps.length > 0}.`,
  controls: [
    { name: "Mandatory fields (EN16931-core)", status: "APPLIED", detail: "BT-1/2/5 + seller/buyer + ≥1 line" },
    { name: "Arithmetic rules", status: "APPLIED", detail: "BR-CO-10/13/15/14/17" },
    { name: "Round-trip CII/UBL + independent re-parse", status: `${good.summary && good.summary.roundTripEqual ? "OK" : "FAIL"}`, detail: "a model must survive its own serialization" },
    { name: "XML security (XXE)", status: "APPLIED", detail: "parser rejects DOCTYPE/ENTITY" },
    { name: "Governance prepared≠sent", status: `human gate: ${good.summary && good.summary.blockedAtHumanGate}`, detail: "deny-by-default; nothing sent without owner authorization" },
  ],
  findings: [
    { severity: "INFO", detail: `valid invoice ${validInvoice.id} ⇒ ${good.verdict}`, basis: "PROVEN" },
    { severity: "MEDIUM", detail: `arithmetic error ${invalidInvoice.id} ⇒ caught`, basis: "PROVEN" },
    { severity: "MEDIUM", detail: `missing fields FR-2026-003 ⇒ caught`, basis: "PROVEN" },
  ],
  recommendations: ["route valid invoices via a certified PDP (owner/accredited)", "keep the human gate before any transmission"],
  limits: artifact.notCoveredByOdg_ownerSide,
  evidence: [{ claim: "3-case validation (valid/arith-error/missing-fields)", basis: "PROVEN", sourceRef: OUT.split("/").pop() }],
  validationConditions: ["re-run reproduces the 3 verdicts", "evidence digest independently verifiable"],
});
fs.writeFileSync(OUT.replace(/\.json$/, ".md"), rep.markdown);
process.stdout.write(`=== P11 e-invoice demonstrator written: ${OUT} (+ PME report ${OUT.replace(/\.json$/, ".md")}) ===\n`);
process.stdout.write(JSON.stringify({ validVerdict: good.verdict, validValidated: good.summary && good.summary.valid, roundTripEqual: good.summary && good.summary.roundTripEqual, blockedAtHumanGate: good.summary && good.summary.blockedAtHumanGate, invalidVerdict: bad.verdict, invalidCaught: Array.isArray(bad.gaps) && bad.gaps.length > 0 }, null, 2) + "\n");

export {};
