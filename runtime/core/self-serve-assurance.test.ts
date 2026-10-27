#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the self-serve triage: a clean project ⇒ AUTO_COMPLETE (no human); an exception
// (unknown license / AI-Act HIGH / too many findings / failed run) ⇒ NEEDS_HUMAN_REVIEW with reasons; batchThroughput
// measures the automatable fraction + effective human-time/delivery (auto≈0); fail-closed input; reproducible; SYNTHETIC.
"use strict";
const assert = require("assert");
const S = require("./self-serve-assurance.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const clean = { project: "clean", dependencies: [{ name: "a", version: "1", license: "MIT", outdated: false }, { name: "b", version: "2", license: "Apache-2.0", outdated: false }], tests: { total: 10, passing: 10 }, aiActivities: {} };
const unknownLic = { project: "ulic", dependencies: [{ name: "x", version: "1", license: "UNKNOWN", outdated: false }], tests: { total: 10, passing: 10 }, aiActivities: {} };
const aiHigh = { project: "ai", dependencies: [{ name: "a", version: "1", license: "MIT", outdated: false }], tests: { total: 10, passing: 10 }, aiActivities: { generatesSyntheticContent: true } };

// (1) clean ⇒ AUTO_COMPLETE, deliverable without human.
const rc = S.runSelfServe(clean, { at: "2026-10-27" });
ok("clean project ⇒ AUTO_COMPLETE, machine verdict deliverable", rc.ok && rc.autoComplete === true && rc.machineVerdict === "DELIVERABLE_WITHOUT_HUMAN" && rc.humanStepsRequired.length === 0);
// (2) unknown license ⇒ NEEDS_HUMAN_REVIEW.
ok("unknown license ⇒ NEEDS_HUMAN_REVIEW", S.runSelfServe(unknownLic).status === "NEEDS_HUMAN_REVIEW" && S.runSelfServe(unknownLic).reviewReasons.some(r => /unknown license/.test(r)));
// (3) AI-Act HIGH (synthetic content) ⇒ NEEDS_HUMAN_REVIEW.
ok("AI-Act HIGH ⇒ NEEDS_HUMAN_REVIEW", S.runSelfServe(aiHigh).status === "NEEDS_HUMAN_REVIEW" && S.runSelfServe(aiHigh).reviewReasons.some(r => /AI-Act HIGH/.test(r)));
// (4) too many findings ⇒ review (lots of outdated deps).
const many = { project: "many", dependencies: Array.from({ length: 20 }, (_, j) => ({ name: "d" + j, version: "1", license: "MIT", outdated: true })), tests: { total: 10, passing: 10 }, aiActivities: {} };
ok(">maxAutoFindings ⇒ NEEDS_HUMAN_REVIEW", S.runSelfServe(many).status === "NEEDS_HUMAN_REVIEW");
// (5) fail-closed input.
ok("bad input ⇒ INVALID_INPUT", S.runSelfServe({}).code === "INVALID_INPUT" && S.runSelfServe(null).ok === false);
// (6) batchThroughput measures automatable fraction + effective human time (auto≈0).
const batch = S.batchThroughput([clean, clean, clean, unknownLic, aiHigh], { reviewHours: 4 });
ok("batch: autoFraction + effective human time (auto≈0)", batch.total === 5 && batch.auto === 3 && batch.autoFraction === 0.6 && batch.effectiveHumanHoursPerDelivery === Math.round(0.4 * 4 * 1000) / 1000);
// (7) higher auto fraction ⇒ lower effective human time (the lever).
ok("more auto ⇒ lower effective human time", S.batchThroughput([clean, clean, clean, clean], { reviewHours: 4 }).effectiveHumanHoursPerDelivery < batch.effectiveHumanHoursPerDelivery);
// (8) honest note + reproducible.
ok("note: SYNTHETIC + not a hosted product; reproducible", /not a hosted product|SYNTHETIC/i.test(rc.note) && JSON.stringify(S.runSelfServe(clean, { at: "2026-10-27" })) === JSON.stringify(rc));

console.log(`\nSELF-SERVE-ASSURANCE suite — ${pass} assertions passed. (auto vs human triage; automatable fraction; effective human time)`);
