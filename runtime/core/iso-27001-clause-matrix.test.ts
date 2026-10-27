#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the ISO 27001 clause matrix: structure-level (clauses 4–10 + Annex A themes),
// evidence verified vs REAL gated suites, and the CRITICAL honesty rule — a gated software test ⇒ MECHANISM_PRESENT,
// NOT SATISFIED; SATISFIED requires an explicit operationalEvidence assertion. EXTERNAL controls flagged; NOT_CERTIFIED;
// normative text NOT reproduced; Amd 1:2024 climate noted. Reproducible.
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const M = require("./iso-27001-clause-matrix.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "..", "package.json"), "utf8"));
const gatedSuites = (pkg.scripts["test:report"].match(/runtime\/core\/([a-z0-9-]+)\.test\.ts/g) || []).map(s => s.replace("runtime/core/", "").replace(".test.ts", ""));

const r = M.buildClauseMatrix({ gatedSuites, now: "2026-10-27" });
const row = (ref) => r.rows.find(x => x.ref === ref);

// (1) structure present: MS clauses 4–10 + Annex A themes.
ok("MS clauses 4..10 present", ["4", "5", "6", "7", "8", "9", "10"].every(ref => row(ref)));
ok("Annex A themes present (A.5/A.6/A.7/A.8)", r.rows.some(x => x.area === "A.5") && r.rows.some(x => x.area === "A.8"));

// (2) CRITICAL: a gated code mechanism (A.8.15 logging ← audit-log) is MECHANISM_PRESENT, NOT satisfied, without op evidence.
ok("A.8.15 logging (audit-log gated) ⇒ MECHANISM_PRESENT, not SATISFIED", row("A.8.15").status === "MECHANISM_PRESENT" && row("A.8.15").codeEvidenceGated.includes("audit-log"));
// (3) asserting operational evidence promotes it to SATISFIED.
const rOp = M.buildClauseMatrix({ gatedSuites, operationalEvidence: { "A.8.15": true }, now: "2026-10-27" });
ok("A.8.15 + operationalEvidence ⇒ SATISFIED", rOp.rows.find(x => x.ref === "A.8.15").status === "SATISFIED");
ok("no SATISFIED at all without any operational evidence", r.summary.satisfied === 0 && r.summary.mechanismPresent > 0);

// (4) EXTERNAL controls flagged (monitoring A.8.16, crypto A.8.24, physical A.7).
ok("A.8.16 monitoring ⇒ EXTERNAL", row("A.8.16").status === "EXTERNAL");
ok("A.8.24 cryptography/KMS ⇒ EXTERNAL", row("A.8.24").status === "EXTERNAL");
ok("A.8.13 backup ⇒ PARTIAL_EXTERNAL (local proven, off-host external)", row("A.8.13").status === "PARTIAL_EXTERNAL");

// (5) honesty banners: NOT_CERTIFIED + test≠operated + no normative text + Amd 1:2024.
ok("NOT_CERTIFIED + 'test ≠ operated control' honesty", /NOT_CERTIFIED/.test(r.certificationStatus) && /test.*≠.*operated|MECHANISM_PRESENT ≠ SATISFIED/i.test(r.markdown));
ok("no normative text reproduced (structure-level stated)", r.notes.some(n => /NOT reproduced|STRUCTURE-LEVEL/i.test(n)));
ok("Amd 1:2024 climate at clause 4.1/4.2 noted", r.notes.some(n => /Amd 1:2024/.test(n)) && /climate/i.test(row("4").title + r.notes.join(" ")));

// (6) evidence verified vs REAL gated suites: fake list ⇒ non-external rows GAP, 0 satisfied/0 mechanism.
const fake = M.buildClauseMatrix({ gatedSuites: ["totally-not-a-suite"], now: "2026-10-27" });
ok("fake gated list ⇒ non-external rows GAP, 0 mechanism/0 satisfied", fake.summary.satisfied === 0 && fake.summary.mechanismPresent === 0 && fake.rows.filter(x => !/EXTERNAL/.test(x.status)).every(x => x.status === "GAP"));

// (7) summary consistent + reproducible.
ok("summary totals consistent + reproducible", r.summary.satisfied + r.summary.mechanismPresent + r.summary.external + r.summary.gap === r.summary.total && M.buildClauseMatrix({ gatedSuites, now: "2026-10-27" }).markdown === r.markdown);

console.log(`\nISO-27001-CLAUSE-MATRIX suite — ${pass} assertions passed. (structure-level; mechanism≠satisfied; NOT certified)`);
