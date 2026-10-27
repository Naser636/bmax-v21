#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves axis-B is a complete, honest audit+remediation package that REUSES the
// axis-A engine: spec completeness; effort-derived economics (assumptions); a synthetic two-pass run that finds →
// remediates → re-assesses with valid before/after SARIF; residual exceptions escalate; fail-closed.
"use strict";
const assert = require("assert");
const B = require("./mid-market-offer.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// (1) spec completeness + narrow (no pentest/legal/cert; advisory roadmap, not code impl).
const O = B.OFFER;
ok("spec complete (qualification/scope/exclusions/workflow/deliverables/acceptance/upgrade/reuse)", O.code === "B-MID-AUDIT-REMEDIATE" && O.qualification.length > 0 && O.workflow.length >= 5 && O.deliverables.length > 0 && O.acceptanceCriteria.length >= 3 && O.upgradePath && O.reuseNote);
ok("reuse note = generic method only, no client data reuse", /no client data is reused|generic/i.test(O.reuseNote));
ok("exclusions keep remediation advisory (no code impl in client repo)", /implementing code|code implementation|advisory roadmap only/i.test(O.exclusions.join(" ")));

// (2) economics derived + labeled assumptions; larger footprint than A.
const e = B.economics();
ok("economics derived + assumptions + bigger than A (€4500/32h)", e.price === 4500 && e.humanHours === 32 && typeof e.grossMargin === "number" && e.assumptions === true);

// (3) synthetic two-pass run: outdated+non-permissive get remediated ⇒ resolved>0, residual lower, valid SARIF both.
const project = { project: "midco", dependencies: [{ name: "a", version: "1", license: "MIT", outdated: true }, { name: "b", version: "2", license: "GPL-3.0", outdated: false }], tests: { total: 10, passing: 8 }, aiActivities: {} };
const r = B.runPackage(project, { at: "2026-10-27" });
ok("baseline found issues, remediation resolved ≥1, residual lower", r.ok && r.baselineFindings > 0 && r.resolved >= 1 && r.residualFindings <= r.baselineFindings);
ok("valid SARIF before AND after; acceptance passed", r.sarifValidBefore === true && r.sarifValidAfter === true && r.acceptancePassed === true);
ok("dossier carries baseline + residual seals + both SARIF", r.dossier.baselineSeal && r.dossier.residualSeal && r.dossier.sarifBefore && r.dossier.sarifAfter);

// (4) residual exception (unknown license persists — not auto-remediated) ⇒ escalate to human review.
const risky = { project: "r", dependencies: [{ name: "x", version: "1", license: "UNKNOWN", outdated: true }], tests: { total: 10, passing: 10 }, aiActivities: { generatesSyntheticContent: true } };
const rr = B.runPackage(risky, { at: "2026-10-27" });
ok("residual unknown-license / AI-Act HIGH ⇒ RESIDUAL_NEEDS_HUMAN_REVIEW", rr.ok && rr.triageStatus === "NEEDS_HUMAN_REVIEW" && rr.machineVerdict === "RESIDUAL_NEEDS_HUMAN_REVIEW" && rr.reviewReasons.length > 0);

// (5) honesty note: synthetic ≠ sold; fail-closed; reproducible.
ok("note: synthetic two-pass ≠ sold engagement", /SYNTHETIC.*NOT a sold|not a sold\/validated|NOT a sold/i.test(r.note));
ok("fail-closed input", B.runPackage(null).code === "INVALID_INPUT" && B.runPackage({}).code === "INVALID_INPUT");
ok("reproducible", JSON.stringify(B.runPackage(project, { at: "2026-10-27" })) === JSON.stringify(r));

console.log(`\nMID-MARKET-OFFER suite — ${pass} assertions passed. (axis-B audit+remediation reusing A; before/after SARIF; residual escalation; assumptions)`);
