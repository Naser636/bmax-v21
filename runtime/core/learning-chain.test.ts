#!/usr/bin/env node
// @ts-nocheck — L5 bulk test migration (runtime/core): runs under tsx unchanged; suppresses tsc
// typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.
"use strict";

/*
 * LEARNING-CHAIN STATE MODEL (§V S2) — hermetic unit proof. PURE: synthetic learning records, NO fs/clock/
 * network. Proves the two hard rules: CONTIGUITY (a gap caps the chain; later evidence is `ahead`, never
 * counted) and NO FABRICATED EFFECT (EFFECTIVE needs a real measured before≠after). Also grades two REAL
 * campaign learnings (evidence-provenance, incident-recurrence) to show the model applied to actual records.
 *
 * Run: node runtime/core/learning-chain.test.js   (or via tsx under `npm test`)
 */

const path = require("path");
const REPO = process.cwd();
const { STATES, classifyLearningState, summarizeChain } = require(path.join(REPO, "runtime", "core", "learning-chain.js"));

let failures = 0;
const check = (c, l) => { if (c) console.log(`  PASS ${l}`); else { failures++; console.log(`  FAIL ${l}`); } };

console.log("LEARNING-CHAIN (§V S2) — hermetic unit proof");

check(JSON.stringify(STATES) === JSON.stringify(["CAPTURED", "PERSISTED", "DISCOVERABLE", "REUSED", "EFFECTIVE"]), "the five ordered states are the §V chain");

// (1) empty / untracked
const u = classifyLearningState({});
check(u.state === null && u.complete === false && /UNTRACKED/.test(u.reason), "empty record ⇒ UNTRACKED (no CAPTURED evidence)");
check(classifyLearningState(null).state === null, "null record ⇒ UNTRACKED (fail-closed)");

// (2) each prefix of the chain classifies to that state, with the correct missing gap
const captured = { captured: { description: "projection admits ledger pollution" } };
check(classifyLearningState(captured).state === "CAPTURED" && classifyLearningState(captured).missing === "PERSISTED", "CAPTURED only ⇒ state CAPTURED, missing PERSISTED");
const persisted = { ...captured, persisted: { file: "memory/x.md" } };
check(classifyLearningState(persisted).state === "PERSISTED" && classifyLearningState(persisted).missing === "DISCOVERABLE", "CAPTURED+PERSISTED ⇒ PERSISTED, missing DISCOVERABLE");
const discoverable = { ...persisted, discoverable: { index: "MEMORY.md line" } };
check(classifyLearningState(discoverable).state === "DISCOVERABLE" && classifyLearningState(discoverable).missing === "REUSED", "…+DISCOVERABLE ⇒ DISCOVERABLE, missing REUSED");
const reused = { ...discoverable, reused: { refs: ["capability-executors.writeEvidence"] } };
check(classifyLearningState(reused).state === "REUSED" && classifyLearningState(reused).missing === "EFFECTIVE", "…+REUSED (concrete ref) ⇒ REUSED, missing EFFECTIVE");

// (3) CONTIGUITY: evidence for a later state does NOT jump a gap
const gap = { captured: { description: "x" }, reused: { count: 5 }, effective: { baseline: 1, after: 0 } }; // missing PERSISTED+DISCOVERABLE
const g = classifyLearningState(gap);
check(g.state === "CAPTURED" && g.missing === "PERSISTED", "CONTIGUITY: REUSED+EFFECTIVE evidence but no PERSISTED ⇒ capped at CAPTURED");
check(g.ahead.includes("REUSED") && g.ahead.includes("EFFECTIVE") && g.reached.REUSED === false, "CONTIGUITY: beyond-gap evidence is reported as `ahead`, NOT counted as reached");

// (4) NO FABRICATED EFFECT: EFFECTIVE needs a real measured before≠after
const full = (eff) => ({ captured: { description: "d" }, persisted: { ref: "r" }, discoverable: { index: "i" }, reused: { count: 2 }, effective: eff });
check(classifyLearningState(full({ baseline: 10, after: 7 })).complete === true, "EFFECTIVE: baseline≠after (10→7) ⇒ complete chain");
check(classifyLearningState(full({ delta: -3 })).complete === true, "EFFECTIVE: explicit non-zero delta ⇒ complete");
check(classifyLearningState(full({ baseline: 5, after: 5 })).state === "REUSED" && classifyLearningState(full({ baseline: 5, after: 5 })).complete === false, "NO FABRICATED EFFECT: baseline==after ⇒ NOT effective (capped at REUSED)");
check(classifyLearningState(full({ delta: 0 })).complete === false, "NO FABRICATED EFFECT: zero delta ⇒ NOT effective");
check(classifyLearningState(full(true)).complete === false, "NO FABRICATED EFFECT: bare effective:true (no measurement) ⇒ NOT effective");

// (5) summarizeChain over a portfolio
const summary = summarizeChain([captured, persisted, reused, full({ baseline: 1, after: 2 })]);
check(summary.total === 4 && summary.effective === 1 && summary.byState.CAPTURED === 1 && summary.byState.REUSED === 1, "summarizeChain tallies by highest contiguous state + counts effective");

// (6) grade two REAL campaign learnings (evidence reflecting what was actually shipped + proven)
const evidenceProvenance = {
  id: "evidence-provenance",
  captured: { description: "C5-A2: executor evidence was mtime-only, source-unattributed, not tamper-evident" },
  persisted: { file: "memory/evidence-provenance-capability.md", commit: "8b1c5b5" },
  discoverable: { index: "MEMORY.md + roadmap §V-B-LOG B1" },
  reused: { refs: ["capability-executors.writeEvidence (single composed chokepoint — all evidence writers)"] },
  // effect: every artifact went from 0 provenance fields to an attributable+tamper-evident stamp.
  effective: { metric: "provenance fields per evidence artifact", baseline: 0, after: 1 },
};
const er = classifyLearningState(evidenceProvenance);
check(er.complete === true && er.state === "EFFECTIVE", "REAL: evidence-provenance grades EFFECTIVE (measured 0→attributable stamp, reused at the writeEvidence chokepoint)");
const incidentRecurrence = {
  id: "incident-recurrence",
  captured: { description: "recurrence was implicit in per-incident attempts; no explicit signal" },
  persisted: { file: "runtime/core/incident-recurrence.js", commit: "3c2c528" },
  discoverable: { index: "roadmap §V-B-LOG B3 + compass; exported + CLI" },
  reused: { refs: ["odg diagnose (computes loadRecurrence every run)"] },
  effective: { metric: "recurrence verdict surfaced on live ledger", baseline: "implicit (attempts only)", after: "FROZEN_LOOP explicit" },
};
check(classifyLearningState(incidentRecurrence).complete === true, "REAL: incident-recurrence grades EFFECTIVE (implicit→explicit FROZEN_LOOP, reused by odg diagnose)");

console.log(failures === 0 ? "ALL PASS — learning-chain (§V S2)" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
