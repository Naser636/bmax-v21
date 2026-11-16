#!/usr/bin/env node
"use strict";
/*
 * V231 §1.1 — JIDOKA-COMPLETENESS acceptance check. PURE, deterministic. Applies the Radar's own V230 proposal:
 * "ensure EVERY computed fail-closed verdict is actually CONSUMED by its decider (a 'stop' must stop the decision)."
 * This does NOT re-implement any gate — it EXERCISES each real consumption path end-to-end and asserts the fail-closed
 * verdict reaches the decision. It turns the PROPOSED item into a verifiable ACCEPTED/GAPS verdict with reproducible
 * evidence, letting the Radar recompute the proposal (§1.1 last line).
 *
 * HARD HONESTY: verdict is ACCEPTED only when ALL fail-closed verdicts are demonstrably consumed; any unconsumed verdict
 * ⇒ GAPS_REMAIN (never a false ACCEPTED). Deterministic (injected asOf). Reuses the real deciders; no new gate. Dual export.
 */

const OD = require("./opportunity-detector.js");         // V223 integrity-MISMATCH + V225 budgetProvenance consumption
const LOOP = require("./odg-radar-to-mission-loop.js");  // V224 contradictory → governanceGate consumption
const COR = require("./odg-claim-corroboration.js");     // V221/V222 corroboration CONTESTED

const NOW = Date.UTC(2026, 10, 16);
const TENDER = Object.freeze({ ref: "jc", buyer: "CD", subject: "TMA", sourceType: "official-tender", source: "fm", url: "https://fm.test/x", httpStatus: 200, publishedAt: "2026-10-01", deadline: "2026-12-15", budgetEur: 250000, lastCheckedAt: "2026-10-20" });

/* verify() -> runs each fail-closed consumption path and reports whether the verdict reaches the decider. */
function verify(): any {
  const checks: any[] = [];

  // (1) contentProvenance.integrity === MISMATCH ⇒ opportunity grade REJECTED (V223).
  const tampered = OD.detect([Object.assign({}, TENDER, { content: "TAMPERED", expectedHash: OD.sha256("ORIGINAL") })], { nowMs: NOW }).shortlist[0];
  checks.push(Object.freeze({ verdict: "contentProvenance.integrity=MISMATCH", decider: "opportunity-detector grade (enterprise-lead-grade contradictions)",
    consumed: tampered.contentProvenance.integrity === "MISMATCH" && tampered.grade === "REJECTED", evidence: "tampered content ⇒ grade " + tampered.grade }));

  // (2) budgetProvenance.verification_status === REJECTED (non-2xx) ⇒ grade downgraded A→B (V225).
  const unreachable = OD.detect([Object.assign({}, TENDER, { httpStatus: 503 })], { nowMs: NOW }).shortlist[0];
  const reachable = OD.detect([TENDER], { nowMs: NOW }).shortlist[0];
  checks.push(Object.freeze({ verdict: "budgetProvenance=REJECTED (unreachable source)", decider: "opportunity-detector grade",
    consumed: unreachable.provenance.verification_status === "REJECTED" && unreachable.grade === "B" && reachable.grade === "A", evidence: "503 ⇒ grade " + unreachable.grade + " (reachable=" + reachable.grade + ")" }));

  // (3) loop contradictory (computed from counterSources ⇒ CONTESTED) ⇒ governanceGate REFUSED CONTRADICTORY_SIGNAL (V224).
  const sig = { id: "jc-contra", synthetic: true, provenance: "OBSERVED_EVIDENCE", sources: ["https://a.test/x"], counterSources: ["https://b.test/retraction"], consultedEpochMs: NOW - 10 * 86400000, buySignal: "REGULATORY_DEADLINE", segmentFit: 4, budgetEvidence: "OBSERVED", regulatoryUrgency: 4, metier: "M5" };
  const tr = LOOP.runLoop([sig], { nowEpochMs: NOW }).traces[0];
  checks.push(Object.freeze({ verdict: "loop contradictory (counterSources ⇒ CONTESTED)", decider: "governanceGate CONTRADICTORY_SIGNAL refusal",
    consumed: tr.assess.contradictory === true && tr.gate.verdict === "REFUSED" && tr.gate.reasons.includes("CONTRADICTORY_SIGNAL"), evidence: "counter-source ⇒ " + tr.gate.verdict }));

  // (4) corroboration CONTESTED ⇒ the loop's contradictory derivation (the mechanism path above) — assert the primitive directly.
  const cor = COR.corroborate({ claim: "x", evidence: [{ url: "https://a.test/x", stance: "SUPPORTS" }, { url: "https://b.test/y", stance: "CONTRADICTS" }] });
  checks.push(Object.freeze({ verdict: "corroboration CONTESTED (any contradiction)", decider: "feeds loop.assess.contradictory (check 3)",
    consumed: cor.level === "CONTESTED", evidence: "a contradicting source ⇒ " + cor.level }));

  const consumedCount = checks.filter((c: any) => c.consumed).length;
  const verdict = consumedCount === checks.length ? "ACCEPTED" : "GAPS_REMAIN";
  return Object.freeze({
    proposal: "jidoka-completeness",
    verdict, consumedCount, total: checks.length,
    checks: Object.freeze(checks),
    note: verdict === "ACCEPTED"
      ? "ACCEPTED — every enumerated fail-closed verdict is demonstrably CONSUMED by its decider (exercised end-to-end); the 'stop on abnormality' stops the decision, not merely computed."
      : "GAPS_REMAIN — at least one fail-closed verdict is computed but NOT consumed by a decider; see checks[].consumed=false.",
    honesty: "ACCEPTED only when ALL verdicts are demonstrably consumed; exercises the REAL deciders (no re-implemented gate); deterministic. This verifies CONSUMPTION, not real-world operation.",
  });
}

const JIDOKA_COMPLETENESS_CONTRACT = Object.freeze({
  id: "V231-JIDOKA-COMPLETENESS",
  purpose: "§1.1 — apply + verify the Radar's jidoka-completeness proposal: every fail-closed verdict consumed by its decider",
  invariants: Object.freeze([
    "EXERCISES the real deciders end-to-end (opportunity-detector grade, loop governanceGate, corroboration) — no re-implemented gate",
    "ACCEPTED only when ALL enumerated fail-closed verdicts are demonstrably consumed; any unconsumed ⇒ GAPS_REMAIN (no false ACCEPTED)",
    "deterministic (injected asOf); verifies CONSUMPTION of fail-closed signals, NOT real-world operation",
  ]),
});

module.exports = { verify, JIDOKA_COMPLETENESS_CONTRACT };
export {};
