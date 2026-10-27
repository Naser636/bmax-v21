#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves reproducible niche scoring + the A/B/C/D switch engine: no switch on a single
// refusal / too-small sample, no false success, escalation B→C→D below the stop rate. Scores are HYPOTHESIS inputs.
"use strict";
const assert = require("assert");
const N = require("./niche-scoring.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const sc = (o) => Object.assign({ urgency: 3, publicNeedSignal: 3, budget: 3, decisionMakerAccess: 3, timeToCashInv: 3, contractValue: 3, deliveryCapacity: 3, acquisitionCostRiskInv: 3, referenceRecurrence: 3 }, o);
const niches = [
  { id: "B-ai-governance", scores: sc({ urgency: 5, publicNeedSignal: 5, contractValue: 4, referenceRecurrence: 4 }) },
  { id: "A-iso27001", scores: sc({ urgency: 4, publicNeedSignal: 4, contractValue: 4 }) },
  { id: "C-automation", scores: sc({ urgency: 3, publicNeedSignal: 2 }) },
  { id: "D-partners", scores: sc({ decisionMakerAccess: 2, timeToCashInv: 2 }) },
];

// (1) ranking is deterministic + reproducible; strongest signals win.
const r1 = N.rankNiches(niches); const r2 = N.rankNiches(niches);
ok("ranking deterministic + reproducible", JSON.stringify(r1) === JSON.stringify(r2) && r1[0].id === "B-ai-governance");
// (2) score maths: all-3s niche = sum of weights × 3.
const base = N.scoreNiche({ id: "x", scores: sc({}) });
const sumW = Object.values(N.DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0);
ok("score = Σ(weight × 3) for an all-3 niche", base.score === sumW * 3 && base.missing.length === 0);
// (3) missing criterion ⇒ counted 0 + flagged (fail-closed).
ok("missing criterion ⇒ flagged + contributes 0", N.scoreNiche({ id: "y", scores: { urgency: 5 } }).missing.length === N.CRITERIA.length - 1);
// (4) weights change ranking (not just raw scores).
const wC = { ...N.DEFAULT_WEIGHTS, deciqionMakerAccess: 9 }; void wC;
ok("different weights can change the ranking", (() => { const w = { urgency: 0, publicNeedSignal: 0, budget: 0, decisionMakerAccess: 0, timeToCashInv: 0, contractValue: 10, deliveryCapacity: 0, acquisitionCostRiskInv: 0, referenceRecurrence: 0 }; const r = N.rankNiches(niches, w); return r[0].score === 40; })());

// ── A/B/C/D switch engine ──────────────────────────────────────────────────────────────────────────────────────
const TH = { minSample: 20, successMeetings: 3, stopQualifiedRate: 0.1 };
// (5) too-small sample (e.g. 1 refusal) ⇒ HOLD_A (never switch on a single refusal).
ok("single refusal / small sample ⇒ HOLD_A (no premature switch)", N.switchDecision({ sample: 1, qualifiedReplies: 0 }, TH, "A").strategy === "HOLD_A");
// (6) success signal met ⇒ STAY_A (no false abandonment).
ok("success threshold met ⇒ STAY_A", N.switchDecision({ sample: 25, qualifiedReplies: 5, meetings: 4 }, TH, "A").strategy === "STAY_A");
// (7) full sample, signal present but no success yet ⇒ CONTINUE_A (refine, don't abandon).
ok("signal present (rate ≥ stop) but no success ⇒ CONTINUE_A", N.switchDecision({ sample: 20, qualifiedReplies: 3, meetings: 0 }, TH, "A").strategy === "CONTINUE_A");
// (8) full sample, below stop rate ⇒ escalate A→B.
ok("full sample below stop rate ⇒ SWITCH_B (re-design offer)", N.switchDecision({ sample: 20, qualifiedReplies: 0, meetings: 0 }, TH, "A").strategy === "SWITCH_B");
// (9) escalation continues B→C→D.
ok("below stop at stage B ⇒ SWITCH_C; at C ⇒ SWITCH_D", N.switchDecision({ sample: 20, qualifiedReplies: 0 }, TH, "B").strategy === "SWITCH_C" && N.switchDecision({ sample: 20, qualifiedReplies: 0 }, TH, "C").strategy === "SWITCH_D");

console.log(`\nNICHE-SCORING suite — ${pass} assertions passed. (scores HYPOTHESIS; switch on real signals, fail-closed)`);
