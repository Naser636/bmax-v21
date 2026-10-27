#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the operational-evidence layer enforces DOCUMENTED≠APPROVED≠EXECUTED: default
// (no evidence) ⇒ 0 SATISFIED; a DRAFTED template stays MECHANISM_PRESENT (not satisfied); APPROVED/EXECUTED with
// responsible+artifact ⇒ SATISFIED; an APPROVED claim WITHOUT responsible+artifact is DOWNGRADED (no fabricated
// approval); unknown state ⇒ NONE; EXTERNAL rows untouched. Reproducible.
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const OE = require("./iso-operational-evidence.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "..", "package.json"), "utf8"));
const gatedSuites = (pkg.scripts["test:report"].match(/runtime\/core\/([a-z0-9-]+)\.test\.ts/g) || []).map(s => s.replace("runtime/core/", "").replace(".test.ts", ""));
const row = (r, ref) => r.rows.find(x => x.ref === ref);

// (1) DEFAULT: no operational evidence ⇒ 0 SATISFIED, mechanism rows present (honest current reality).
const d = OE.assessOperational({ gatedSuites, now: "2026-10-27" });
ok("no operational evidence ⇒ 0 SATISFIED", d.summary.satisfied === 0 && d.summary.mechanismPresent > 0);
ok("a MECHANISM_PRESENT row has opState NONE by default", row(d, "A.8.15").status === "MECHANISM_PRESENT" && row(d, "A.8.15").opState === "NONE");

// (2) DRAFTED template ⇒ stays MECHANISM_PRESENT (documented-not-approved), NOT satisfied.
const dr = OE.assessOperational({ gatedSuites, evidence: { "A.8.15": { state: "DRAFTED" } }, now: "2026-10-27" });
ok("DRAFTED ⇒ MECHANISM_PRESENT + DOCUMENTED_NOT_APPROVED, not satisfied", row(dr, "A.8.15").status === "MECHANISM_PRESENT" && row(dr, "A.8.15").opState === "DOCUMENTED_NOT_APPROVED" && dr.summary.satisfied === 0);

// (3) APPROVED with responsible+artifact ⇒ SATISFIED.
const ap = OE.assessOperational({ gatedSuites, evidence: { "A.8.15": { state: "APPROVED", responsible: "CTO", artifact: "logging-policy-v1 (signed)" } }, now: "2026-10-27" });
ok("APPROVED + responsible + artifact ⇒ SATISFIED", row(ap, "A.8.15").status === "SATISFIED" && ap.summary.satisfied === 1);

// (4) EXECUTED with responsible+artifact ⇒ SATISFIED.
const ex = OE.assessOperational({ gatedSuites, evidence: { "10": { state: "EXECUTED", responsible: "CTO", artifact: "reboot-drill-report" } }, now: "2026-10-27" });
ok("EXECUTED + responsible + artifact ⇒ SATISFIED", row(ex, "10").status === "SATISFIED");

// (5) FAIL-CLOSED: APPROVED WITHOUT responsible/artifact ⇒ downgraded to DRAFTED, NOT satisfied, flagged.
const bad = OE.assessOperational({ gatedSuites, evidence: { "A.8.15": { state: "APPROVED" } }, now: "2026-10-27" });
ok("APPROVED without responsible+artifact ⇒ downgraded, not satisfied, flagged", row(bad, "A.8.15").status === "MECHANISM_PRESENT" && bad.summary.satisfied === 0 && /no fabricated approval/i.test(row(bad, "A.8.15").flag || ""));
// (6) normaliseEvidence directly: unknown state ⇒ NONE.
ok("unknown state ⇒ NONE (deny-by-default)", OE.normaliseEvidence({ state: "RUBBISH" }).state === "NONE");
ok("EXECUTED needs responsible+artifact (else DRAFTED)", OE.normaliseEvidence({ state: "EXECUTED", responsible: "CTO" }).state === "DRAFTED");

// (7) EXTERNAL rows untouched by operational evidence.
ok("A.8.16 monitoring stays EXTERNAL regardless of evidence", row(OE.assessOperational({ gatedSuites, evidence: { "A.8.16": { state: "EXECUTED", responsible: "x", artifact: "y" } }, now: "2026-10-27" }), "A.8.16").status === "EXTERNAL");

// (8) honesty + reproducible.
ok("DOCUMENTED≠APPROVED≠EXECUTED + no-self-approve notes", d.notes.some(n => /DOCUMENTED ≠ APPROVED ≠ EXECUTED/.test(n)) && d.notes.some(n => /does not self-approve|HUMAN act/i.test(n)));
ok("reproducible", OE.assessOperational({ gatedSuites, now: "2026-10-27" }).markdown === d.markdown);

console.log(`\nISO-OPERATIONAL-EVIDENCE suite — ${pass} assertions passed. (documented≠approved≠executed; no fabricated approval; NOT certified)`);
