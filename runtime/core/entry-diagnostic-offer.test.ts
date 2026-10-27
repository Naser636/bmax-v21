#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the axis-A entry offer is complete + economically honest (assumptions labeled)
// + that the synthetic end-to-end acceptance run works: a clean project auto-completes with a valid SARIF dossier and
// passes acceptance; an exception (unknown license) routes to human review; fail-closed input.
"use strict";
const assert = require("assert");
const A = require("./entry-diagnostic-offer.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// (1) offer spec completeness (scope/exclusions/inputs/deliverables/acceptance/lifecycle/upgrade/referral).
const O = A.OFFER;
ok("offer spec complete", O.code === "A-ENTRY-DIAG" && O.scope.length > 0 && O.exclusions.length > 0 && O.requiredInputs.length > 0 && O.deliverables.length > 0 && O.acceptanceCriteria.length >= 3 && O.upgradePathToB && O.referralToCE && O.escalation && O.dataHandling);
ok("offer exclusions keep it narrow (no pentest/legal/cert)", O.exclusions.join(" ").match(/pentest|penetration/i) && /certification|legal/i.test(O.exclusions.join(" ")));

// (2) economics derived from effort + explicitly labeled ASSUMPTION.
const e = A.economics();
ok("economics derived (price/hours ⇒ margin + net), labeled assumptions", e.price === 900 && e.humanHours === 6 && typeof e.grossMargin === "number" && typeof e.marginPct === "number" && e.assumptions === true && /ASSUMPTION/i.test(e.note));
ok("economics overridable", A.economics({ priceEUR: 1500, humanHours: 8 }).price === 1500);

// (3) synthetic end-to-end acceptance — clean project ⇒ AUTO_COMPLETE, valid SARIF, acceptance passes.
const clean = { project: "acme", dependencies: [{ name: "a", version: "1", license: "MIT", outdated: false }, { name: "b", version: "2", license: "Apache-2.0", outdated: false }], tests: { total: 10, passing: 10 }, aiActivities: {} };
const r = A.runEntryDiagnostic(clean, { at: "2026-10-27" });
ok("clean project ⇒ AUTO_COMPLETE + valid SARIF + acceptance passed", r.ok && r.triageStatus === "AUTO_COMPLETE" && r.machineVerdict === "DELIVERABLE_WITHOUT_HUMAN" && r.sarifValid === true && r.acceptancePassed === true);
ok("dossier carries seal + SARIF + finding count", r.dossier.seal && r.dossier.sarif && typeof r.dossier.findingCount === "number");

// (4) an exception (unknown license) ⇒ NEEDS_HUMAN_REVIEW (not silently auto-completed).
const risky = { project: "risky", dependencies: [{ name: "x", version: "1", license: "UNKNOWN", outdated: false }], tests: { total: 10, passing: 10 }, aiActivities: { generatesSyntheticContent: true } };
const rr = A.runEntryDiagnostic(risky, { at: "2026-10-27" });
ok("unknown license / AI-Act HIGH ⇒ HOLD_FOR_HUMAN_REVIEW with reasons", rr.ok && rr.triageStatus === "NEEDS_HUMAN_REVIEW" && rr.machineVerdict === "HOLD_FOR_HUMAN_REVIEW" && rr.reviewReasons.length > 0);
ok("even a review case still produces a valid SARIF deliverable", rr.sarifValid === true);

// (5) honesty note: synthetic ≠ sold; fail-closed input; reproducible.
ok("note: synthetic acceptance ≠ sold engagement", /SYNTHETIC.*NOT a sold|not a sold engagement/i.test(r.note));
ok("fail-closed: bad input ⇒ INVALID_INPUT", A.runEntryDiagnostic(null).code === "INVALID_INPUT" && A.runEntryDiagnostic({}).code === "INVALID_INPUT");
ok("reproducible", JSON.stringify(A.runEntryDiagnostic(clean, { at: "2026-10-27" })) === JSON.stringify(r));

console.log(`\nENTRY-DIAGNOSTIC-OFFER suite — ${pass} assertions passed. (axis-A offer spec + effort-derived economics + synthetic end-to-end acceptance)`);
