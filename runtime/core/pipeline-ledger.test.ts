#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the pipeline/cash ledger enforces signed≠invoiced≠cashed by CODE: no stage
// skipping (no false success), nested no-double-count totals, LOST excluded, tamper-evident transition chain. No
// fabricated client/payment — it only records asserted transitions, fail-closed.
"use strict";
const assert = require("assert");
const P = require("./pipeline-ledger.js");
const AUDIT = require("./audit-log.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };
const AT = "2026-10-27";

// (1) legal forward progression LEAD→…→CASHED with a tamper-evident chain.
let e = P.createEntry("ACME", 40000, AT); let chain = [];
for (const s of ["QUALIFIED", "PROPOSAL", "PILOT_SIGNED", "INVOICED", "CASHED"]) {
  const r = P.advance(e, s, { at: AT, chain }); assert.ok(r.ok, "advance " + s); e = r.entry; chain = r.chain;
}
ok("legal progression LEAD→CASHED succeeds + audit chain intact", e.stage === "CASHED" && chain.length === 5 && AUDIT.verifyChain(chain).ok === true);

// (2) FAIL-CLOSED: cannot SKIP a stage (e.g. QUALIFIED → CASHED) — no false success.
{
  const q = P.advance(P.createEntry("X", 10000, AT), "QUALIFIED", { at: AT }).entry;
  const skip = P.advance(q, "CASHED", { at: AT });
  ok("skipping to CASHED ⇒ REFUSED (no false success), entry unchanged", skip.ok === false && /no skipping|illegal transition/.test(skip.reason) && skip.entry.stage === "QUALIFIED");
}

// (3) FAIL-CLOSED: cannot move backward.
{
  const signed = P.createEntry("Y", 10000, AT);
  let s = signed; for (const st of ["QUALIFIED", "PROPOSAL", "PILOT_SIGNED"]) s = P.advance(s, st, { at: AT }).entry;
  ok("backward transition ⇒ REFUSED", P.advance(s, "QUALIFIED", { at: AT }).ok === false);
}

// (4) totals: signed ≥ invoiced ≥ cashed, nested (no double-count), LOST excluded.
const mk = (id, amt, upto) => { let x = P.createEntry(id, amt, AT); const seq = ["QUALIFIED", "PROPOSAL", "PILOT_SIGNED", "INVOICED", "CASHED"]; for (const st of seq) { if (P.STAGES.indexOf(st) > P.STAGES.indexOf(upto)) break; x = P.advance(x, st, { at: AT }).entry; } return x; };
const entries = [mk("c1", 40000, "CASHED"), mk("c2", 40000, "INVOICED"), mk("c3", 40000, "PILOT_SIGNED"), mk("c4", 40000, "PROPOSAL")];
const lost = P.advance(mk("c5", 99999, "PILOT_SIGNED"), "LOST", { at: AT }).entry; entries.push(lost);
const tot = P.pipelineTotals(entries);
ok("totals nested + honest: signed≥invoiced≥cashed, correct sums", tot.signed === 120000 && tot.invoiced === 80000 && tot.cashed === 40000 && tot.signed >= tot.invoiced && tot.invoiced >= tot.cashed);
ok("LOST entry excluded from all buckets (its €99,999 not counted)", tot.signed === 120000 && tot.counts.LOST === 1);

// (5) tamper on the transition chain ⇒ detected.
ok("tampered transition chain ⇒ detected", (() => { const t = chain.map(x => ({ ...x })); t[0] = { ...t[0], payload: { ...t[0].payload, to: "CASHED-HACK" } }; return AUDIT.verifyChain(t).ok === false; })());

// (6) weighted (expected) pipeline is a HYPOTHESIS, strictly ≤ a naive sum and ≥ cashed.
ok("weighted pipeline is between cashed and the gross sum (expected-value, labelled hypothesis)", tot.weightedPipeline >= tot.cashed && tot.weightedPipeline <= 160000);

// (7) a refused transition is still AUDITED (ok:false recorded in the chain).
{
  const r = P.advance(P.createEntry("Z", 1, AT), "CASHED", { at: AT, chain: [] });
  ok("refused transition is journaled (ok:false) + chain verifiable", r.ok === false && r.chain.length === 1 && r.chain[0].payload.ok === false && AUDIT.verifyChain(r.chain).ok === true);
}

console.log(`\nPIPELINE-LEDGER suite — ${pass} assertions passed. (no fabricated client/payment; fail-closed)`);
