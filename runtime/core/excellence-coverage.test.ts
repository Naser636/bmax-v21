#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the excellence-coverage matrix + the shared requireExcellence boundary.
"use strict";
const assert = require("assert");
const C = require("./excellence-coverage.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// (1) matrix is honest: every consults:true row cites executable evidence; every consults:false row states a gap.
ok("matrix: covered rows cite evidence; uncovered rows state a gap", C.COVERAGE_MATRIX.every(r => (r.consults ? !!r.evidence : r.status === "NOT_COVERED" && !!r.gap)));

// (2) covered families now include mission-execution, capability-self-review, learning, recovery (gated evidence).
const fams = C.coveredFamilies();
ok("covered families include mission-execution + capability-self-review + learning + recovery", fams.includes("mission-execution") && fams.includes("capability-self-review") && fams.includes("learning") && fams.includes("recovery"));

// (3) still-uncovered components explicitly listed (resolution / per-executor execution / legacy) — no total-coverage claim.
const unc = C.uncoveredComponents().map(r => r.component);
ok("still-uncovered components explicitly listed (each with a gap)", unc.length >= 1 && C.uncoveredComponents().every(r => r.consults === false && !!r.gap));

// (4) summary is internally consistent.
const s = C.coverageSummary();
ok("summary consistent (covered + uncovered = total)", s.covered + s.uncovered === s.total && s.covered >= 4 && s.uncovered >= 1);

// (5) SHARED boundary requireExcellence: prohibited superlative ⇒ admit:false.
const prohibited = { verdict: "IMPROVE", claims: [{ claim: "world number one", justified: false }], staleReferences: [], gaps: [] };
ok("shared boundary: prohibited claim ⇒ admit false", C.requireExcellence(prohibited, {}).admit === false);

// (6) SHARED boundary: stale / INSUFFICIENT_EVIDENCE ⇒ ADVISORY but admit:true (non-blocking, offline-safe).
const advisory = { verdict: "INSUFFICIENT_EVIDENCE", claims: [], staleReferences: ["X"], gaps: [{ present: false }] };
const a = C.requireExcellence(advisory, {});
ok("shared boundary: stale/insufficient ⇒ admit true (advisory, non-blocking)", a.admit === true && a.advisory === true);

// (7) SHARED boundary strict mode ⇒ advisories also block.
ok("shared boundary: strict mode blocks on advisories", C.requireExcellence(advisory, { strict: true }).admit === false);

// (8) SHARED boundary: clean MEETS review ⇒ admit true, no advisory.
ok("shared boundary: clean review ⇒ admit true", C.requireExcellence({ verdict: "MEETS", claims: [{ claim: "x", justified: true }], staleReferences: [], gaps: [{ present: true }] }, {}).admit === true);

// (9) SHARED boundary: absent review ⇒ advisory admit (non-strict), blocked under strict.
ok("shared boundary: absent review ⇒ advisory admit / strict block", C.requireExcellence(null, {}).admit === true && C.requireExcellence(null, { strict: true }).admit === false);

console.log(`\nEXCELLENCE-COVERAGE suite — ${pass} assertions passed.`);
