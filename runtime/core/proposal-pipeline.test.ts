#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the governed proposal→pipeline→dashboard chain: a valid proposal enters the
// ledger ONLY via LEAD→QUALIFIED→PROPOSAL (audit-chained, no skipped stage, no fake signature); a refused proposal
// produces NO entry; a PROPOSAL is NOT counted as signed/invoiced/cashed; the human-asserted sign→invoice→cash path
// updates the nested buckets with no double-count; illegal transitions are refused.
"use strict";
const assert = require("assert");
const PG = require("./proposal-generator.js");
const PL = require("./pipeline-ledger.js");
const PP = require("./proposal-pipeline.js");
const AUDIT = require("./audit-log.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const good = PG.buildProposal({
  client: "ACME-SYNTHETIC", tier: "ENTRY", problem: "Prepare LLM-agent product for AI-Act transparency review.",
  scope: ["OWASP ASI review (principle-level)"], deliverables: ["Readiness dossier"],
  limitations: ["Principle-level, not a legal opinion", "ODG does not issue certification"],
  lines: [{ description: "Readiness assessment", quantity: 1, unitPrice: 4000 }], currency: "EUR",
}, { now: "2026-10-27" });
assert.ok(good.ok, "fixture proposal must build");

// (1) valid proposal ⇒ ledger entry at PROPOSAL, reached via LEAD→QUALIFIED→PROPOSAL (history proves no skip).
const reg = PP.registerProposal(good, { id: "PROP-001", at: "2026-10-27" });
ok("valid proposal ⇒ entry at PROPOSAL, amount 4000", reg.ok && reg.entry.stage === "PROPOSAL" && reg.entry.amount === 4000);
ok("entry climbed LEAD→QUALIFIED→PROPOSAL (no skipped stage)", reg.entry.history.map(h => h.stage).join(",") === "LEAD,QUALIFIED,PROPOSAL");
ok("each transition bound to a verifiable audit chain", AUDIT.verifyChain(reg.chain).ok && reg.chain.length >= 2);

// (2) a PROPOSAL is NOT revenue: signed/invoiced/cashed all 0; only weighted > 0.
const t1 = PL.pipelineTotals([reg.entry]);
ok("PROPOSAL stage ⇒ signed/invoiced/cashed all 0 (proposal ≠ revenue)", t1.signed === 0 && t1.invoiced === 0 && t1.cashed === 0 && t1.weightedPipeline > 0);

// (3) FAIL-CLOSED: a refused proposal (overclaim) produces NO ledger entry.
const bad = PG.buildProposal({ client: "X", tier: "ENTRY", scope: ["we guarantee compliance"], deliverables: ["d"], limitations: ["l"], fixedPrice: 1000 });
ok("overclaim proposal refused upstream", bad.ok === false && bad.code === "OVERCLAIM");
ok("refused proposal ⇒ registerProposal PROPOSAL_NOT_VALID (no fabricated entry)", PP.registerProposal(bad, { id: "PROP-BAD" }).code === "PROPOSAL_NOT_VALID");

// (4) dedup: same id refused.
ok("duplicate id ⇒ DUPLICATE_ID", PP.registerProposal(good, { id: "PROP-001", existingIds: ["PROP-001"] }).code === "DUPLICATE_ID");

// (5) human-asserted sign→invoice→cash updates nested buckets (no double-count); governed one-step each.
let e = reg.entry, chain = reg.chain;
let r = PP.signPilot(e, { at: "2026-11-01", chain }); e = r.entry; chain = r.chain;
ok("sign ⇒ PILOT_SIGNED ⇒ signed=4000, cashed still 0", r.ok && PL.pipelineTotals([e]).signed === 4000 && PL.pipelineTotals([e]).cashed === 0);
r = PP.invoice(e, { at: "2026-11-05", chain }); e = r.entry; chain = r.chain;
r = PP.cash(e, { at: "2026-11-20", chain }); e = r.entry; chain = r.chain;
const t2 = PL.pipelineTotals([e]);
ok("after cash ⇒ signed=invoiced=cashed=4000 (nested, counted once)", t2.signed === 4000 && t2.invoiced === 4000 && t2.cashed === 4000);
ok("full lifecycle audit chain verifies", AUDIT.verifyChain(chain).ok);

// (6) FAIL-CLOSED: cannot skip a stage (PROPOSAL → INVOICED directly refused).
ok("illegal skip PROPOSAL→INVOICED refused", PP.invoice(reg.entry, { at: "2026-11-01" }).ok === false);

// (7) dashboard links the chain to the €500k target without counting a proposal as cash.
const d = PP.dashboardFor([reg.entry], { target: 500000, avgContractValue: 4000 });
ok("dashboard: a lone proposal ⇒ cashed 0, status BEHIND (gap = full target)", d.cashed === 0 && d.signed === 0 && d.status === "BEHIND" && d.gapCashed === 500000);
const d2 = PP.dashboardFor([e], { target: 500000 });
ok("dashboard after cash ⇒ cashed 4000 reflected", d2.cashed === 4000 && d2.gapCashed === 496000);

console.log(`\nPROPOSAL-PIPELINE suite — ${pass} assertions passed. (governed bridge; fail-closed; no fake signature; no double-count)`);
