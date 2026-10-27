#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves axis-F traceability COMPOSES operational-evidence + freshness + the shared
// readiness vocabulary into one requirement→evidence→verification-state→gap view, with the honest rule that a
// SATISFIED control whose evidence is STALE is reported STALE (not current), readiness ≠ certification, and every
// non-verified requirement yields a remediation entry.
"use strict";
const assert = require("assert");
const T = require("./certification-traceability.js");
const AXES = require("./portfolio-axes.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };
const NOW = "2026-10-27T00:00:00Z";

// (1) pure verificationStateFor mapping incl. the STALE override.
ok("SATISFIED + FRESH ⇒ INTERNALLY_VERIFIED", T.verificationStateFor({ status: "SATISFIED" }, "FRESH") === "INTERNALLY_VERIFIED");
ok("SATISFIED + STALE ⇒ STALE (override — FRESH≠SATISFIED both ways)", T.verificationStateFor({ status: "SATISFIED" }, "STALE") === "STALE");
ok("SATISFIED + no date ⇒ EVIDENCE_COLLECTED", T.verificationStateFor({ status: "SATISFIED" }, null) === "EVIDENCE_COLLECTED");
ok("DOCUMENTED_NOT_APPROVED ⇒ DRAFTED", T.verificationStateFor({ status: "MECHANISM_PRESENT", opState: "DOCUMENTED_NOT_APPROVED" }, null) === "DRAFTED");
ok("APPROVED_PENDING_EXECUTION ⇒ GAP", T.verificationStateFor({ status: "MECHANISM_PRESENT", opState: "APPROVED_PENDING_EXECUTION" }, null) === "GAP");
ok("MECHANISM_PRESENT (no op evidence) ⇒ IMPLEMENTED", T.verificationStateFor({ status: "MECHANISM_PRESENT", opState: "NONE" }, null) === "IMPLEMENTED");
ok("EXTERNAL ⇒ BLOCKED", T.verificationStateFor({ status: "EXTERNAL" }, null) === "BLOCKED");

// (2) readiness vocabulary is the SHARED canonical one (not re-invented).
ok("readiness vocabulary == portfolio-axes READINESS_STATES", JSON.stringify(T.READINESS) === JSON.stringify(AXES.READINESS_STATES));

// Build with ref "7" SATISFIED (APPROVED + responsible + artifact), ref "8" DRAFTED.
const base = {
  gatedSuites: ["audit-log", "evidence-provenance", "mechanical-acceptance", "governance-kernel"],
  evidence: {
    "7": { state: "APPROVED", responsible: "CTO", artifact: "documented-info-control-policy.md" },
    "8": { state: "DRAFTED" },
  },
  now: NOW,
};

// (3) FRESH evidence date ⇒ ref 7 INTERNALLY_VERIFIED, traceable, not a gap.
const fresh = T.buildTraceability({ ...base, evidenceDates: { "7": "2026-09-01T00:00:00Z" } });
const row7f = fresh.rows.find(r => r.ref === "7");
ok("buildTraceability ok + NOT_CERTIFIED", fresh.ok && fresh.certificationStatus === "NOT_CERTIFIED");
ok("satisfied + fresh ⇒ INTERNALLY_VERIFIED, traceable, not gap", row7f.verificationState === "INTERNALLY_VERIFIED" && row7f.traceable === true && row7f.gap === false);

// (4) STALE evidence date ⇒ ref 7 downgraded to STALE + remediation re-attest.
const stale = T.buildTraceability({ ...base, evidenceDates: { "7": "2024-01-01T00:00:00Z" } });
const row7s = stale.rows.find(r => r.ref === "7");
ok("satisfied + stale ⇒ STALE (downgraded), gap true", row7s.verificationState === "STALE" && row7s.gap === true);
ok("STALE ⇒ remediation entry says re-attest", stale.remediation.some(x => x.ref === "7" && /re-attest/i.test(x.missing)));

// (5) DRAFTED control ⇒ DRAFTED + remediation approve.
const row8 = fresh.rows.find(r => r.ref === "8");
ok("drafted control ⇒ DRAFTED + remediation approve", row8.verificationState === "DRAFTED" && fresh.remediation.some(x => x.ref === "8" && /approve/i.test(x.missing)));

// (6) byState counts sum to total; summary coherent.
const sum = Object.values(fresh.byState).reduce((a, b) => a + b, 0);
ok("byState sums to total rows; summary.internallyVerified≥1", sum === fresh.rows.length && fresh.summary.internallyVerified >= 1 && fresh.summary.total === fresh.rows.length);

// (7) remediation non-empty (there are GAP/IMPLEMENTED/external rows) and each names what is missing.
ok("remediation register populated + every entry names missing", fresh.remediation.length > 0 && fresh.remediation.every(x => x.ref && x.missing));

// (8) readiness ≠ certification note present.
ok("note: readiness ≠ certification", fresh.notes.some(n => /readiness.*certification|NOT_CERTIFIED/i.test(n)));

// (9) fail-closed: missing now.
ok("fail-closed: no now ⇒ INVALID_INPUT", T.buildTraceability({}).code === "INVALID_INPUT");

// (10) deterministic.
ok("reproducible", JSON.stringify(T.buildTraceability({ ...base, evidenceDates: { "7": "2026-09-01T00:00:00Z" } })) === JSON.stringify(fresh));

console.log(`\nCERTIFICATION-TRACEABILITY suite — ${pass} assertions passed. (compose op-evidence+freshness+vocab; STALE override; remediation; readiness≠certification)`);
