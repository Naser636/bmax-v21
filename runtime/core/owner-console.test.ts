#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the owner-only operating model: the 12-step inventory classifies every
// touchpoint with a real code path; ONLY material decisions (signature/money/exceptional) reach the owner; routine
// steps (qualification/tests/QA/drafting/follow-up/reconciliation) are NEVER owner-facing; decision requests are
// fail-closed and default-safe; the owner is never silently made responsible for an "automated" step.
"use strict";
const assert = require("assert");
const O = require("./owner-console.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// (1) full 12-step lifecycle inventory, each classified + anchored.
const inv = O.inventory();
ok("12-step lifecycle, each classified + code path", inv.lifecycle.length === 12 && inv.lifecycle.every(s => s.classification && s.codePath));
ok("AUTOMATABLE_NOW steps name a real tested module (not a template claim)", inv.lifecycle.filter(s => s.classification === "AUTOMATABLE_NOW").every(s => /runner|qualify|validateLeadIntake|template|reuse-ledger|intake|enterprise-mission|invoiceReadiness|validation-engine|dashboard|mission-reuse/i.test(s.codePath)));

// (2) owner touchpoints are ONLY signature/money/exceptional — the routine steps are NOT owner-facing.
ok("contract signature is owner-facing (nondelegable)", O.isOwnerFacing(6) === true);
ok("invoice ISSUANCE + refund are owner-facing (material money)", O.isOwnerFacing(10) === true && O.isOwnerFacing(11) === true);
ok("qualification / tests / delivery / learning are NOT owner-facing (routine)", O.isOwnerFacing(3) === false && O.isOwnerFacing(8) === false && O.isOwnerFacing(9) === false && O.isOwnerFacing(12) === false);
ok("owner touchpoint count is small + listed", inv.ownerTouchpointCount === 3 && inv.ownerFacing.every(x => x.step && x.name));

// (3) outreach SEND is external-provider-gated (not owner, not 'done'); discovery needs an authorized source.
ok("outreach SEND = EXTERNAL provider/credential (owner not involved)", inv.lifecycle.find(s => s.step === 4).classification === "EXTERNAL_PROVIDER_OR_CREDENTIAL_REQUIRED" && inv.lifecycle.find(s => s.step === 4).ownerFacing === false);

// (4) decision request fail-closed: routine item refused; incomplete refused.
ok("non-material item ⇒ NOT_MATERIAL (kept off the owner)", O.buildDecisionRequest({ material: false, recommendation: "x" }).code === "NOT_MATERIAL");
ok("material but incomplete ⇒ INCOMPLETE_REQUEST (names missing)", (() => { const r = O.buildDecisionRequest({ material: true, recommendation: "sign" }); return r.code === "INCOMPLETE_REQUEST" && r.missing.includes("maxFinancialExposureEUR") && r.missing.includes("risks"); })());

// (5) a complete material decision ⇒ plain-language request, default-safe, signature flag honored.
const dr = O.buildDecisionRequest({ material: true, title: "Sign MSA with Acme", recommendation: "sign — scope-justified €14k engagement", whyDecisionNeeded: "contract is a legal commitment", maxFinancialExposureEUR: 14000, risks: ["liability", "delivery capacity"], ifRejected: "do not engage; no cost", ifNoAnswer: "no signature, no commitment (safe default)", signatureRequired: true });
ok("complete material request built + default-safe + signature flagged", dr.ok && dr.request.options.join(",") === "APPROVE,REJECT" && dr.defaults.noSignature === true && dr.request.signatureRequired === true && /SAFE path/i.test(dr.note));

// (6) ownerQueue: routine items routed away; only material ones reach the owner.
const q = O.ownerQueue([
  { title: "run tests", material: false },
  { title: "follow up lead", material: false },
  { title: "approve €900 invoice issuance", material: true, maxFinancialExposureEUR: 900, recommendation: "issue — delivery accepted", whyDecisionNeeded: "financial document", risks: ["none material"], ifRejected: "hold invoice", ifNoAnswer: "invoice not issued (safe)" },
]);
ok("ownerQueue surfaces only the material decision; routine routed away", q.ownerDecisionCount === 1 && q.routedAway.length === 2 && q.routedAway.some(r => /routine/i.test(r.reason)));

// (7) fail-closed input.
ok("fail-closed: non-object ⇒ INVALID_INPUT", O.buildDecisionRequest(null).code === "INVALID_INPUT");

// (8) deterministic.
ok("reproducible", JSON.stringify(O.inventory().byClass) === JSON.stringify(O.inventory().byClass));

console.log(`\nOWNER-CONSOLE suite — ${pass} assertions passed. (12-step inventory; owner sees only material decisions; routine routed away; fail-closed; default-safe)`);
