#!/usr/bin/env node
"use strict";
/* V176 §2/§7 — prospect qualification + PARTIAL-function hardening ledger. Proves: QUALIFIED requires ICP fit + budget
 * evidence + a HARD buy-signal (market size alone NEVER qualifies); NURTURE/DISQUALIFIED otherwise; a QUALIFIED prospect is
 * NOT a client (outreach owner-gated); the 6 V173 PARTIAL functions are honestly assessed with measured local hardening and
 * NONE flipped to AUTONOMOUS. SYNTHETIC prospects; no real contact; no fabricated demand. */
const Q = require("./odg-prospect-qualification.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  // ---- qualification discipline ----
  const qualified = Q.qualifyProspect({ id: "a", segmentFit: 5, budgetEvidence: "OBSERVED", buySignal: "REGULATORY_DEADLINE", regulatoryUrgency: 5 });
  check("fit + OBSERVED budget + hard buy-signal ⇒ QUALIFIED", qualified.tier === "QUALIFIED" && /budget evidence.*buy-signal/.test(qualified.reason));
  check("QUALIFIED prospect is explicitly NOT a client (outreach owner-gated)", /NOT a client|prospect is not a sale/.test(qualified.caveat));
  check("good fit but NO budget evidence ⇒ NURTURE (not solvent)", Q.qualifyProspect({ id: "b", segmentFit: 4, budgetEvidence: "NONE", buySignal: "NONE" }).tier === "NURTURE");
  check("good fit + budget but NO hard buy-signal ⇒ NURTURE (market size ≠ demand)", Q.qualifyProspect({ id: "c", segmentFit: 4, budgetEvidence: "OBSERVED", buySignal: "NONE" }).tier === "NURTURE");
  check("weak ICP fit ⇒ DISQUALIFIED even with budget + tender", Q.qualifyProspect({ id: "d", segmentFit: 1, budgetEvidence: "OBSERVED", buySignal: "TENDER" }).tier === "DISQUALIFIED");
  check("market size alone NEVER qualifies (high fit, no budget, no signal ⇒ NURTURE not QUALIFIED)", Q.qualifyProspect({ id: "e", segmentFit: 5, budgetEvidence: "NONE", buySignal: "NONE", regulatoryUrgency: 0 }).tier !== "QUALIFIED");

  // ---- batch funnel ----
  const b = Q.scoreBatch([{ id: "a", segmentFit: 5, budgetEvidence: "OBSERVED", buySignal: "REGULATORY_DEADLINE", regulatoryUrgency: 5 }, { id: "b", segmentFit: 4, budgetEvidence: "NONE", buySignal: "NONE" }, { id: "d", segmentFit: 1 }]);
  check("batch funnel: 1 QUALIFIED / 1 NURTURE / 1 DISQUALIFIED + qualifiedRate + honest note", b.byTier.QUALIFIED === 1 && b.byTier.NURTURE === 1 && b.byTier.DISQUALIFIED === 1 && b.qualifiedRate > 0 && /QUALIFIED ≠ client|no real contact/.test(b.note));

  // ---- hardening ledger over the 6 V173 PARTIAL functions ----
  const l = Q.hardeningLedger();
  const byFn: any = {}; for (const r of l.rows) byFn[r.fn] = r;
  check("ledger covers exactly the 6 V173 PARTIAL functions", l.total === 6 && byFn.needs_budget && byFn.prospecting && byFn.retention && byFn.onboarding_delivery && byFn.product_design && byFn.finance);
  check("needs_budget + prospecting HARDENED_LOCAL by this engine (prospecting SEND stays owner-gated)", /HARDENED_LOCAL/.test(byFn.needs_budget.status) && /HARDENED_LOCAL/.test(byFn.prospecting.status) && byFn.prospecting.ownerGated === true);
  check("retention + onboarding PARTIALLY_HARDENED by V174 support-renewal engine", /PARTIALLY_HARDENED_V174/.test(byFn.retention.status) && /PARTIALLY_HARDENED_V174/.test(byFn.onboarding_delivery.status));
  check("finance stays OWNER_GATED (payment execution)", byFn.finance.status === "OWNER_GATED" && byFn.finance.ownerGated === true);
  check("NO function flipped to AUTONOMOUS (all remain PARTIAL — needs e2e real-traffic proof)", l.flippedToAutonomous === 0 && l.stillPartial === 6 && /NO function flipped to AUTONOMOUS|end-to-end real-traffic proof/.test(l.note));

  // ---- honesty + determinism ----
  check("contract: market size never qualifies, QUALIFIED≠client, no AUTONOMOUS flip, synthetic, owner-gates preserved", Q.PROSPECT_QUALIFICATION_CONTRACT.invariants.some((i: string) => /market size alone NEVER qualifies/.test(i)) && Q.PROSPECT_QUALIFICATION_CONTRACT.invariants.some((i: string) => /NOT a client/.test(i)) && Q.PROSPECT_QUALIFICATION_CONTRACT.invariants.some((i: string) => /NO PARTIAL function flipped to AUTONOMOUS/.test(i)));
  check("deterministic + frozen", JSON.stringify(Q.hardeningLedger().rows) === JSON.stringify(l.rows) && Object.isFrozen(l) && Object.isFrozen(qualified));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — prospect-qualification (§2/§7: QUALIFIED requires fit+budget+hard-signal [market size NEVER qualifies], QUALIFIED≠client [owner-gated outreach]; 6 V173 PARTIAL functions hardened honestly [4 HARDENED_LOCAL incl. V174 retention/onboarding, prospecting SEND + finance OWNER_GATED], 0 flipped to AUTONOMOUS; SYNTHETIC, no real contact, €0 clients)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
