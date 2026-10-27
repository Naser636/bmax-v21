#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves certification readiness is FAIL-CLOSED: default (no evidence, no dossier) ⇒
// NOT_READY; only when every non-external control is SATISFIED AND every mandatory dossier item is present ⇒
// READY_FOR_STAGE1; dropping one dossier item or all evidence ⇒ NOT_READY. No fabrication; NOT a certification.
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const CR = require("./certification-readiness.js");
const OE = require("./iso-operational-evidence.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "..", "package.json"), "utf8"));
const gatedSuites = (pkg.scripts["test:report"].match(/runtime\/core\/([a-z0-9-]+)\.test\.ts/g) || []).map(s => s.replace("runtime/core/", "").replace(".test.ts", ""));

// (1) DEFAULT: nothing supplied ⇒ NOT_READY, 0 controls satisfied, all dossier missing.
const d = CR.assessCertificationReadiness({ gatedSuites, now: "2026-10-27" });
ok("default ⇒ NOT_READY", d.verdict === "NOT_READY" && d.controls.satisfied === 0 && d.dossier.present === 0 && d.blockers.length > 0);
ok("default honest: NOT a certification note", d.notes.some(n => /NOT a certification|accredited/i.test(n)));

// Build evidence that SATISFIES every non-external control (EXECUTED where required, else APPROVED) — for the aggregate test.
const nonExtRefs = d.controls.missing.map(m => m.split(": ")[0]);
const evidence = {};
for (const ref of nonExtRefs) evidence[ref] = { state: OE.requiredState(ref), responsible: "CTO", artifact: `art-${ref}` };
const fullDossier = {}; for (const k of CR.MANDATORY_DOSSIER) fullDossier[k] = true;

// (2) all controls satisfied + full dossier ⇒ READY_FOR_STAGE1.
const ready = CR.assessCertificationReadiness({ gatedSuites, evidence, dossier: fullDossier, now: "2026-10-27" });
ok("all non-external controls SATISFIED + full dossier ⇒ READY_FOR_STAGE1", ready.verdict === "READY_FOR_STAGE1" && ready.controls.missing.length === 0 && ready.dossier.missing.length === 0);

// (3) FAIL-CLOSED: drop one dossier item ⇒ NOT_READY.
const lessDossier = { ...fullDossier, internal_audit_performed: false };
ok("missing one dossier item ⇒ NOT_READY", CR.assessCertificationReadiness({ gatedSuites, evidence, dossier: lessDossier, now: "2026-10-27" }).verdict === "NOT_READY");

// (4) FAIL-CLOSED: full dossier but no control evidence ⇒ NOT_READY.
ok("full dossier, no control evidence ⇒ NOT_READY", CR.assessCertificationReadiness({ gatedSuites, dossier: fullDossier, now: "2026-10-27" }).verdict === "NOT_READY");

// (5) execution-required controls can't be satisfied by APPROVED even in the aggregate (clause 10 APPROVED ⇒ still blocked).
const evApprovedAll = {}; for (const ref of nonExtRefs) evApprovedAll[ref] = { state: "APPROVED", responsible: "CTO", artifact: `art-${ref}` };
ok("APPROVED-only everywhere ⇒ NOT_READY (clause 10/A.5 need EXECUTED)", CR.assessCertificationReadiness({ gatedSuites, evidence: evApprovedAll, dossier: fullDossier, now: "2026-10-27" }).verdict === "NOT_READY");

// (6) EXTERNAL controls surfaced as a blocker even when ready otherwise.
ok("EXTERNAL controls flagged as a scope blocker", ready.blockers.some(b => /EXTERNAL/.test(b)) && ready.controls.external > 0);

// (7) mandatory dossier list + reproducible.
ok("MANDATORY_DOSSIER includes SoA + internal audit + management review", CR.MANDATORY_DOSSIER.includes("statement_of_applicability") && CR.MANDATORY_DOSSIER.includes("internal_audit_performed") && CR.MANDATORY_DOSSIER.includes("management_review_performed"));
ok("reproducible", CR.assessCertificationReadiness({ gatedSuites, now: "2026-10-27" }).markdown === d.markdown);

console.log(`\nCERTIFICATION-READINESS suite — ${pass} assertions passed. (fail-closed; NOT a certification; no fabrication)`);
