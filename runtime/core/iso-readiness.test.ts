#!/usr/bin/env node
// @ts-nocheck — runs under tsx. ODG ISO-27001 self-readiness: evidence VERIFIED against the REAL gated suites in
// package.json (not a claim); honest statuses (SATISFIED only if all cited suites gated), GAP/EXTERNAL surfaced,
// NOT_CERTIFIED + principle-level (clause text not read). No fabricated certification.
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const I = require("./iso-readiness.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// REAL evidence: derive the gated suite base-names from package.json test:report (self-assessment reflects reality).
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "..", "package.json"), "utf8"));
const gatedSuites = (pkg.scripts["test:report"].match(/runtime\/core\/([a-z0-9-]+)\.test\.ts/g) || []).map(s => s.replace("runtime/core/", "").replace(".test.ts", ""));

const r = I.assessIsoReadiness({ gatedSuites, now: "2026-10-27" });

// (1) assessment reflects REAL gated evidence: identity/audit/recovery themes SATISFIED (their suites are gated).
const byTheme = (frag) => r.controls.find(c => c.theme.includes(frag));
ok("identity/access ⇒ SATISFIED_VERIFIED (evidence suites really gated)", byTheme("Identity").status === "SATISFIED_VERIFIED" && byTheme("Identity").evidenceGated.includes("agent-identity"));
ok("logging/audit ⇒ SATISFIED_VERIFIED (audit-log gated)", byTheme("Logging").status === "SATISFIED_VERIFIED" && byTheme("Logging").evidenceGated.includes("audit-log"));
ok("incident recovery ⇒ SATISFIED_VERIFIED (checkpoint+build-recovery gated)", byTheme("recovery").status === "SATISFIED_VERIFIED");

// (2) EXTERNAL themes honestly flagged (KMS, prod monitoring) — not claimed satisfied.
ok("KMS/key-management ⇒ EXTERNAL (not claimed)", byTheme("key management").status === "EXTERNAL");
ok("production multi-tenant ⇒ PARTIAL_EXTERNAL (hermetic proven, prod external)", byTheme("multi-tenant").status === "PARTIAL_EXTERNAL");
ok("backups ⇒ PARTIAL_EXTERNAL (local proven, off-host external)", byTheme("Backups").status === "PARTIAL_EXTERNAL");

// (3) honesty: NOT_CERTIFIED + principle-level (clause text not read) + Amd 1:2024 noted.
ok("NOT_CERTIFIED + self-assessment banner", /NOT_CERTIFIED/.test(r.certificationStatus) && /self-assessment/.test(r.markdown));
ok("principle-level honesty: clause text NOT consulted stated", r.notes.some(n => /clause text was NOT consulted|clause-by-clause/i.test(n)) && r.notes.some(n => /Amd 1:2024/.test(n)));

// (4) a FAKE unverified evidence suite is NOT counted (verifier is real).
const fake = I.assessIsoReadiness({ gatedSuites: ["totally-not-a-suite"], now: "2026-10-27" });
ok("no real gated evidence ⇒ non-external themes are GAP (no false satisfaction)", fake.controls.filter(c => !/EXTERNAL/.test(c.status)).every(c => c.status === "GAP") && fake.summary.satisfied === 0);

// (5) summary consistency + reproducible.
ok("summary totals consistent + reproducible", r.summary.satisfied + r.summary.partial + r.summary.gap <= r.summary.total && I.assessIsoReadiness({ gatedSuites, now: "2026-10-27" }).markdown === r.markdown);

console.log(`\nISO-READINESS suite — ${pass} assertions passed. (self-assessment; evidence verified vs real gated suites; NOT certified)`);
