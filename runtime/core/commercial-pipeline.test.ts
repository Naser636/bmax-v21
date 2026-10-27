#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the 12-stage commercial funnel is fail-closed + anti-conflation: no auto-advance
// (criterion required), no skip, send + sign are human-gated, prepared≠sent≠signed≠invoiced≠cashed, nothing before
// SIGNED is revenue, LOST terminal, audit-chained. Nothing invented.
"use strict";
const assert = require("assert");
const P = require("./commercial-pipeline.js");
const AUDIT = require("./audit-log.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const step = (e, to, extra, chain) => P.advance(e, to, Object.assign({ at: "2026-10-27", chain, criterionMet: true }, extra || {}));

// (1) full happy path with all criteria + human auth on send/sign.
let e = P.createOpportunity("OPP-1", 10000, "2026-10-27"); let chain = [];
for (const [to, extra] of [["VERIFIED"], ["QUALIFIED"], ["INTERESTED"], ["PROPOSAL_PREPARED"], ["PROPOSAL_AUTHORIZED"], ["PROPOSAL_SENT", { humanAuthorized: true }], ["NEGOTIATION"], ["SIGNED", { humanAuthorized: true }], ["DELIVERY_ACCEPTED"], ["INVOICED"], ["CASHED"]]) {
  const r = step(e, to, extra, chain); assert.ok(r.ok, "step " + to + ": " + r.reason); e = r.entry; chain = r.chain;
}
ok("full funnel DETECTED→CASHED with criteria + human auth", e.stage === "CASHED" && AUDIT.verifyChain(chain).ok);

// (2) no auto-advance: missing criterion ⇒ refused.
const base = P.createOpportunity("OPP-2", 5000, "2026-10-27");
ok("no criterion ⇒ CRITERION_NOT_MET", P.advance(base, "VERIFIED", { at: "x" }).code === "CRITERION_NOT_MET");

// (3) no skip.
ok("skip DETECTED→QUALIFIED ⇒ INVALID_TRANSITION", P.advance(base, "QUALIFIED", { criterionMet: true }).code === "INVALID_TRANSITION");

// (4) send is human-gated: criterion alone is not enough.
let f = P.createOpportunity("OPP-3", 5000, "2026-10-27"); let c3 = [];
for (const to of ["VERIFIED", "QUALIFIED", "INTERESTED", "PROPOSAL_PREPARED", "PROPOSAL_AUTHORIZED"]) { const r = step(f, to, null, c3); f = r.entry; c3 = r.chain; }
ok("PROPOSAL_SENT without humanAuthorized ⇒ HUMAN_AUTH_REQUIRED (letter prepared ≠ sent)", P.advance(f, "PROPOSAL_SENT", { criterionMet: true }).code === "HUMAN_AUTH_REQUIRED");
ok("PROPOSAL_SENT with humanAuthorized ⇒ ok", P.advance(f, "PROPOSAL_SENT", { criterionMet: true, humanAuthorized: true }).ok);

// (5) sign is human-gated too.
let g = f; let c4 = c3; { const r = P.advance(g, "PROPOSAL_SENT", { at: "y", criterionMet: true, humanAuthorized: true, chain: c4 }); g = r.entry; c4 = r.chain; }
{ const r = step(g, "NEGOTIATION", null, c4); g = r.entry; c4 = r.chain; }
ok("SIGNED without humanAuthorized ⇒ HUMAN_AUTH_REQUIRED", P.advance(g, "SIGNED", { criterionMet: true }).code === "HUMAN_AUTH_REQUIRED");

// (6) anti-conflation totals: a PREPARED (not sent) opp is not revenue; counts preparedNotSent.
const t = P.funnelTotals([f]);  // f is at PROPOSAL_AUTHORIZED (prepared, not sent)
ok("prepared/authorized opp ⇒ signed/invoiced/cashed all 0; preparedNotSent counted", t.signed === 0 && t.invoiced === 0 && t.cashed === 0 && t.preparedNotSent === 1);
// full-cycle opp ⇒ counted once in each nested bucket.
const t2 = P.funnelTotals([e]);
ok("CASHED opp ⇒ signed=invoiced=cashed=10000 (nested)", t2.signed === 10000 && t2.invoiced === 10000 && t2.cashed === 10000);

// (7) LOST terminal.
const lost = P.advance(base, "LOST", { at: "z" }); ok("mark LOST ok; further transition refused", lost.ok && P.advance(lost.entry, "VERIFIED", { criterionMet: true }).code === "LOST_TERMINAL");

// (8) 12 stages + human-gated set.
ok("12 named stages; send+sign human-gated", P.STAGES.length === 12 && P.HUMAN_GATED.has("PROPOSAL_SENT") && P.HUMAN_GATED.has("SIGNED"));

console.log(`\nCOMMERCIAL-PIPELINE suite — ${pass} assertions passed. (12-stage; evidence-gated; send/sign human-gated; no conflation)`);
