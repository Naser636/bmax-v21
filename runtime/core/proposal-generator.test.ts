#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the proposal generator is fail-closed + anti-overclaim: no client/price
// invented, limitations mandatory, forbidden promises (certification/guarantee/100%/superlatives) REFUSED, price
// maths via invoicing.computeTotals, reproducible render, and pipeline linkage emits PROPOSAL (never SIGNED).
"use strict";
const assert = require("assert");
const P = require("./proposal-generator.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const base = {
  client: "ACME-SYNTHETIC", tier: "ENTRY", problem: "Prepare LLM-agent product for AI-Act transparency review.",
  scope: ["Review agent against OWASP ASI top-10 (principle-level)", "Map AI-Act Art.50 transparency obligations"],
  deliverables: ["Readiness dossier with evidence pointers", "Prioritised remediation plan"],
  limitations: ["Principle-level, not a legal opinion", "ODG does not issue certification"],
  exclusions: ["Production hosting", "Legal representation"],
  evidenceRefs: ["ISO_READINESS_ODG_V1.md", "regulatory-assurance suite"],
  lines: [{ description: "Readiness assessment", quantity: 1, unitPrice: 3000 }, { description: "Agent-security review", quantity: 1, unitPrice: 1000 }],
  currency: "EUR", validityDays: 30,
};

// (1) valid proposal builds; total = 4000; render reproducible.
const r1 = P.buildProposal(base, { now: "2026-10-27" });
const r1b = P.buildProposal(base, { now: "2026-10-27" });
ok("valid proposal ⇒ ok, total 4000.00, reproducible render", r1.ok && r1.proposal.totals.total === 4000 && r1.markdown === r1b.markdown);
// (2) honesty terms + limitations + exclusions present in render (no silent omission).
ok("render carries limitations, exclusions, honesty (no cert claim)", /Limitations/.test(r1.markdown) && /excluded/i.test(r1.markdown) && /does NOT issue certification/.test(r1.markdown));

// (3) FAIL-CLOSED: missing limitations ⇒ refused.
ok("no limitations ⇒ MISSING_LIMITATIONS", P.buildProposal({ ...base, limitations: [] }).code === "MISSING_LIMITATIONS");
// (4) FAIL-CLOSED: no price (no lines, no fixedPrice) ⇒ refused (price never invented).
const { lines, ...noPrice } = base; ok("no price ⇒ MISSING_PRICE", P.buildProposal(noPrice).code === "MISSING_PRICE");
// (5) FAIL-CLOSED: missing client ⇒ refused (client never invented).
ok("no client ⇒ INVALID_INPUT", P.buildProposal({ ...base, client: "" }).code === "INVALID_INPUT");

// (6) ANTI-OVERCLAIM: certification promise ⇒ refused.
ok("deliverable 'we certify you' ⇒ OVERCLAIM", P.buildProposal({ ...base, deliverables: [...base.deliverables, "We certify you ISO 27001"] }).code === "OVERCLAIM");
// (7) ANTI-OVERCLAIM: outcome/compliance guarantee ⇒ refused.
ok("'guaranteed compliance' ⇒ OVERCLAIM", P.buildProposal({ ...base, problem: "We guarantee compliance with the AI Act." }).code === "OVERCLAIM");
// (8) ANTI-OVERCLAIM: unbenchmarked superlative ⇒ refused.
ok("'world-leading / best' ⇒ OVERCLAIM", P.buildProposal({ ...base, valueStatements: ["the best world-leading agent security"] }).code === "OVERCLAIM");
// (9) ANTI-OVERCLAIM: '100% secure' / 'zero risk' ⇒ refused.
ok("'100% secure' ⇒ OVERCLAIM", P.buildProposal({ ...base, scope: [...base.scope, "makes you 100% secure"] }).code === "OVERCLAIM");
// (10) scanClaims passes legitimate honest wording (readiness/prepare/not certification).
ok("honest wording passes scanClaims", P.scanClaims("We prepare your certification readiness; ODG does not certify.").ok);

// (11) tiers accepted; unknown tier refused.
ok("B2B + PARTNERSHIP tiers accepted; bogus tier refused", P.buildProposal({ ...base, tier: "B2B" }).ok && P.buildProposal({ ...base, tier: "PARTNERSHIP" }).ok && P.buildProposal({ ...base, tier: "ZZZ" }).code === "UNKNOWN_TIER");
// (12) fixedPrice path works.
ok("fixedPrice path ⇒ total == fixedPrice", P.buildProposal({ ...noPrice, fixedPrice: 12000 }).proposal.totals.total === 12000);
// (13) invalid price line ⇒ INVALID_LINE (reuses invoicing.computeTotals validation).
ok("invalid line (qty 0) ⇒ INVALID_LINE", P.buildProposal({ ...base, lines: [{ description: "x", quantity: 0, unitPrice: 10 }] }).code === "INVALID_LINE");

// (14) pipeline linkage: expectedValue + pipelineEntry emit PROPOSAL stage, never SIGNED.
const ev = P.expectedValue(r1.proposal); const pe = P.pipelineEntry(r1.proposal, "PROP-001");
ok("expectedValue/pipelineEntry ⇒ stage PROPOSAL, value 4000, not SIGNED", ev.stage === "PROPOSAL" && ev.value === 4000 && pe.stage === "PROPOSAL" && pe.id === "PROP-001");

console.log(`\nPROPOSAL-GENERATOR suite — ${pass} assertions passed. (fail-closed; anti-overclaim; price/client never invented)`);
