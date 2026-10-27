#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Adversarial suite for excellence-gate (learning + recovery coverage). Hermetic, no
// clock. Proves EFFECTIVE reuse (a recorded learning changes a later decision) — not mere storage.
"use strict";
const assert = require("assert");
const G = require("./excellence-gate.js");
const prov = require("./evidence-provenance.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const NOW = "2026-10-27";
const REV = { commit: "t", treeDirty: false, available: true };
const REG = [{ id: "LEARN-REF", authority: "ODG", domain: "learning", version: "1.0", date: "2026-10-01", source: "ODG learning method", normativeStatus: "industry-practice", usageRights: "own", practicesAdopted: ["reproduce-before-fix"], limits: [], nextReviewDate: "2027-10-01", verificationStatus: "offline-pending-reverify" },
  { id: "REC-REF", authority: "ODG", domain: "recovery", version: "1.0", date: "2026-10-01", source: "ODG recovery method", normativeStatus: "industry-practice", usageRights: "own", practicesAdopted: ["checkpoint-resume"], limits: [], nextReviewDate: "2027-10-01", verificationStatus: "offline-pending-reverify" }];

// a VALID sealed learning
const sealed = prov.stampProvenance({ practice: "reproduce-before-fix", source: "mission-123" }, { revision: REV });
const learning = { id: "L1", practice: "reproduce-before-fix", provenanceSealed: sealed, claims: ["a proven engineering practice"] };

// ── LEARNING family ──────────────────────────────────────────────────────────────────────────────────────────────
// (1) valid learning ⇒ applied + audit chain intact
const r1 = G.gateLearningReuse({ learning, registry: REG, now: NOW });
ok("learning: valid+provenanced ⇒ applied, audit chain intact", r1.applied === true && r1.appliedPractice === "reproduce-before-fix" && r1.provOk === true && r1.auditVerified === true);

// (2) EFFECTIVE REUSE: a later decision is actually CHANGED by the learning (not just stored)
const dec = G.decideWithLearning(["default-approach", "reproduce-before-fix"], r1);
ok("learning: EFFECTIVE reuse ⇒ later decision influenced by the learning", dec.influencedByLearning === true && dec.chosen === "reproduce-before-fix");
// control: without the learning applied, the decision is NOT influenced
ok("learning: control — no applied learning ⇒ decision NOT influenced", G.decideWithLearning(["default-approach", "reproduce-before-fix"], { applied: false }).influencedByLearning === false);

// (3) ABSENT learning ⇒ not applied (fail-closed)
ok("learning: absent ⇒ not applied", G.gateLearningReuse({ learning: null, registry: REG, now: NOW }).applied === false);

// (4) INVALID provenance (tampered) ⇒ not applied
const tampered = { ...learning, provenanceSealed: { ...sealed, practice: "something-else" } };
ok("learning: tampered provenance ⇒ not applied (no false reuse)", G.gateLearningReuse({ learning: tampered, registry: REG, now: NOW }).applied === false);

// (5) STALE reference ⇒ advisory but STILL applied (offline-safe, non-blocking)
const r5 = G.gateLearningReuse({ learning, registry: [{ ...REG[0], nextReviewDate: "2020-01-01" }], now: NOW });
ok("learning: stale reference ⇒ advisory, still applied (non-blocking)", r5.applied === true && r5.excellence.advisory === true);

// (6) PROHIBITED superlative claim on the learning ⇒ NOT applied (fail-closed)
const superl = { ...learning, claims: ["the world's best practice, number one"] };
ok("learning: prohibited superlative claim ⇒ NOT applied", G.gateLearningReuse({ learning: superl, registry: REG, now: NOW }).applied === false);

// (7) reviewer UNAVAILABLE (throws) ⇒ advisory, non-blocking (still applied if provenance ok)
const r7 = G.gateLearningReuse({ learning, registry: REG, now: NOW, reviewer: () => { throw new Error("down"); } });
ok("learning: reviewer error ⇒ advisory, non-blocking", r7.reviewerErrored === true && r7.applied === true);

// (8) audit chain links across multiple gate calls + detects tamper
let chain = r1.chain; chain = G.gateLearningReuse({ learning, registry: REG, now: NOW, chain }).chain;
ok("learning: multi-call audit chain intact + tamper-detectable", require("./audit-log.js").verifyChain(chain).ok === true && chain.length === 2 && (() => { const t = chain.map(e => ({ ...e })); t[0] = { ...t[0], payload: { ...t[0].payload, applied: false } }; return require("./audit-log.js").verifyChain(t).ok === false; })());

// ── RECOVERY family ──────────────────────────────────────────────────────────────────────────────────────────────
const action = { id: "R1", kind: "checkpoint-resume", claims: ["resume from a verified checkpoint"] };
const recEvidence = prov.stampProvenance({ checkpoint: "cp-7", verified: true }, { revision: REV });

// (9) valid recovery ⇒ proceed + audit intact
const rr1 = G.gateRecovery({ action, evidence: recEvidence, registry: REG, now: NOW });
ok("recovery: valid action+evidence ⇒ proceed, audit intact", rr1.proceed === true && rr1.evidenceOk === true && rr1.auditVerified === true);

// (10) recovery after failure with NO evidence ⇒ advisory, still proceeds (evidence optional)
ok("recovery: no evidence supplied ⇒ advisory, proceeds", G.gateRecovery({ action, registry: REG, now: NOW }).proceed === true);

// (11) CONTRADICTORY evidence ⇒ do NOT proceed (no false success)
ok("recovery: contradictory evidence ⇒ do NOT proceed", G.gateRecovery({ action, evidence: recEvidence, contradictory: true, registry: REG, now: NOW }).proceed === false);

// (12) TAMPERED recovery evidence ⇒ do NOT proceed
ok("recovery: tampered evidence ⇒ do NOT proceed", G.gateRecovery({ action, evidence: { ...recEvidence, checkpoint: "cp-FORGED" }, registry: REG, now: NOW }).proceed === false);

// (13) PROHIBITED superlative claim on the recovery ⇒ do NOT proceed
ok("recovery: prohibited superlative ⇒ do NOT proceed", G.gateRecovery({ action: { ...action, claims: ["the best, world-class recovery"] }, evidence: recEvidence, registry: REG, now: NOW }).proceed === false);

// (14) reviewer unavailable ⇒ advisory, non-blocking
ok("recovery: reviewer error ⇒ advisory, proceeds", G.gateRecovery({ action, evidence: recEvidence, registry: REG, now: NOW, reviewer: () => { throw new Error("x"); } }).proceed === true);

console.log(`\nEXCELLENCE-GATE suite — ${pass} assertions passed.`);
