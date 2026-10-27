#!/usr/bin/env node
// @ts-nocheck — runs under tsx. ODG ISO/IEC 42001 self-readiness: evidence VERIFIED against the REAL gated suites
// in package.json (not a claim); honest statuses (SATISFIED only if all cited suites gated), GAP/EXTERNAL surfaced,
// NOT_CERTIFIED + principle-level (clause text not consulted, metadata-only). No fabricated certification.
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const I = require("./iso-42001-readiness.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// REAL evidence: derive gated suite base-names from package.json test:report (self-assessment reflects reality).
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "..", "package.json"), "utf8"));
const gatedSuites = (pkg.scripts["test:report"].match(/runtime\/core\/([a-z0-9-]+)\.test\.ts/g) || []).map(s => s.replace("runtime/core/", "").replace(".test.ts", ""));

const r = I.assessIso42001Readiness({ gatedSuites, now: "2026-10-27" });
const byTheme = (frag) => r.controls.find(c => c.theme.includes(frag));

// (1) assessment reflects REAL gated evidence.
ok("roles/authority ⇒ SATISFIED_VERIFIED (agent-identity gated)", byTheme("Roles").status === "SATISFIED_VERIFIED" && byTheme("Roles").evidenceGated.includes("agent-identity"));
ok("logging/traceability ⇒ SATISFIED_VERIFIED (audit-log gated)", byTheme("Logging").status === "SATISFIED_VERIFIED" && byTheme("Logging").evidenceGated.includes("audit-log"));
ok("transparency ⇒ SATISFIED_VERIFIED (proposal-generator + excellence-policy gated)", byTheme("Transparency").status === "SATISFIED_VERIFIED" && byTheme("Transparency").evidenceGated.includes("proposal-generator"));

// (2) EXTERNAL honestly flagged.
ok("operational AI-behaviour monitoring ⇒ EXTERNAL (not claimed)", byTheme("monitoring of AI").status === "EXTERNAL");

// (3) honesty banners.
ok("NOT_CERTIFIED + self-assessment banner", /NOT_CERTIFIED/.test(r.certificationStatus) && /self-assessment/.test(r.markdown));
ok("principle-level: clause text NOT consulted + metadata-only stated", r.notes.some(n => /clause.*NOT consulted|clause-by-clause/i.test(n)) && r.notes.some(n => /metadata-only/i.test(n)));
ok("distinguishes 42001 from AI-Act and 27001", r.notes.some(n => /EU AI Act/.test(n) && /27001/.test(n)));

// (4) a FAKE unverified evidence suite is NOT counted (verifier is real).
const fake = I.assessIso42001Readiness({ gatedSuites: ["totally-not-a-suite"], now: "2026-10-27" });
ok("no real gated evidence ⇒ non-external themes GAP (no false satisfaction)", fake.controls.filter(c => !/EXTERNAL/.test(c.status)).every(c => c.status === "GAP") && fake.summary.satisfied === 0);

// (5) summary consistency + reproducible.
ok("summary totals consistent + reproducible", r.summary.satisfied + r.summary.partial + r.summary.gap <= r.summary.total && I.assessIso42001Readiness({ gatedSuites, now: "2026-10-27" }).markdown === r.markdown);
ok("standard id is 42001:2023", /42001:2023/.test(r.standard));

console.log(`\nISO-42001-READINESS suite — ${pass} assertions passed. (self-assessment; evidence verified vs real gated suites; NOT certified)`);
