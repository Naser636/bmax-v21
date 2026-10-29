#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves PRODUCT D7 SLICE 2: executed technical checks (assurance-pilot, with exit code)
// + evidence-freshness gate + exportable, integrity-stamped report. Fail-closed: a HIGH technical finding ⇒ exit 1 ⇒
// technical FAIL ⇒ NOT_ASSURED; STALE/missing evidence ⇒ NOT_ASSURED (cannot support PASS); ASSURED only when base
// assured + technical PASS + fresh evidence. Always NOT_CERTIFIED. Composes existing services; no new primitive.
"use strict";
const assert = require("assert");
const R = require("./ai-assurance-report.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const baseProfile = { tenantId: "t1", country: "FR", processesEUPersonalData: true, targetFrameworks: ["GDPR"] };
const verifiedProfile = { ...baseProfile, declaredEvidence: [
  { id: "E1", obligationId: "GDPR-ROPA", tenantId: "t1" }, { id: "E2", obligationId: "GDPR-LAWFUL", tenantId: "t1" }, { id: "E3", obligationId: "GDPR-BREACH", tenantId: "t1" } ] };
const verifier = () => ({ verified: true, reason: "ok" });

// (1) technical pilot with a GPL dep ⇒ HIGH ⇒ exitCode 1 ⇒ technical FAIL ⇒ NOT_ASSURED.
{
  const r = R.buildAssuranceReport({ system: { id: "s1", activities: {}, profile: baseProfile }, technical: { dependencies: [{ name: "gpl-lib", license: "GPL-3.0" }], tests: { total: 10, passing: 10 } }, now: "2026-10-29" });
  ok("GPL dep ⇒ technical FAIL (exitCode 1) ⇒ overall NOT_ASSURED", r.report.technical.status === "FAIL" && r.report.technical.exitCode === 1 && r.report.overall === "NOT_ASSURED");
}
// (2) clean technical pilot ⇒ PASS exitCode 0.
{
  const r = R.buildAssuranceReport({ system: { id: "s1", activities: {}, profile: baseProfile }, technical: { dependencies: [{ name: "mit-lib", license: "MIT" }], tests: { total: 10, passing: 10 } }, now: "2026-10-29" });
  ok("permissive deps + good coverage ⇒ technical PASS (exitCode 0)", r.report.technical.status === "PASS" && r.report.technical.exitCode === 0);
}
// (3) STALE evidence ⇒ freshness FAIL ⇒ overall NOT_ASSURED (stale cannot support PASS).
{
  const r = R.buildAssuranceReport({ system: { id: "s1", activities: {}, profile: verifiedProfile }, verifier, technical: { dependencies: [{ name: "mit-lib", license: "MIT" }], tests: { total: 10, passing: 10 } }, evidenceControls: [{ ref: "ROPA", operationalEvidenceAt: "2020-01-01" }], ttlDays: 90, now: "2026-10-29" });
  ok("stale evidence ⇒ freshness FAIL ⇒ NOT_ASSURED (even with verified base + clean technical)", r.report.evidenceFreshness.status === "FAIL" && r.report.overall === "NOT_ASSURED");
}
// (4) ASSURED path: base assured (verified GDPR, no AI activity) + technical PASS + fresh evidence ⇒ ASSURED_TECHNICAL.
{
  const r = R.buildAssuranceReport({ system: { id: "s1", activities: {}, profile: verifiedProfile }, verifier, technical: { dependencies: [{ name: "mit-lib", license: "MIT" }], tests: { total: 10, passing: 10 } }, evidenceControls: [{ ref: "ROPA", operationalEvidenceAt: "2026-10-01" }], ttlDays: 90, now: "2026-10-29" });
  const a = r.report;
  ok("verified base + technical PASS + fresh evidence ⇒ ASSURED_TECHNICAL", a.overall === "ASSURED_TECHNICAL" && a.technical.status === "PASS" && a.evidenceFreshness.status === "PASS");
}
// (5) executedChecks + checkResults record exit codes (provenance of what actually ran).
{
  const r = R.buildAssuranceReport({ system: { id: "s1", activities: {}, profile: baseProfile }, technical: { dependencies: [{ name: "mit-lib", license: "MIT" }], tests: { total: 10, passing: 10 } }, evidenceControls: [{ ref: "ROPA", operationalEvidenceAt: "2026-10-01" }], now: "2026-10-29" });
  ok("executedChecks + checkResults record the pilot/freshness exit codes",
     r.report.executedChecks.some((c) => /assurance-pilot\(exit=0\)/.test(c)) && r.report.checkResults.some((c) => c.check === "assurance-pilot-runner" && c.exitCode === 0) && r.report.checkResults.some((c) => c.check === "control-evidence-freshness"));
}
// (6) integrity digest present + detects mutation; exportJson round-trips.
{
  const r = R.buildAssuranceReport({ system: { id: "s1", activities: {}, profile: baseProfile }, now: "2026-10-29" });
  const parsed = JSON.parse(r.exportJson);
  const prov = require("./evidence-provenance.js");
  const copy = { ...r.report }; delete copy.integrityDigest;
  ok("integrity digest present, recomputes to match (tamper-check), exportJson round-trips",
     typeof r.report.integrityDigest === "string" && r.report.integrityDigest.length >= 16 && prov.contentDigest(copy) === r.report.integrityDigest && parsed.overall === r.report.overall);
}
// (7) always NOT_CERTIFIED.
{
  const r = R.buildAssuranceReport({ system: { id: "s1", activities: {}, profile: verifiedProfile }, verifier, now: "2026-10-29" });
  ok("certificationStatus NOT_CERTIFIED (technical assurance ≠ certification)", /NOT_CERTIFIED/.test(r.report.certificationStatus));
}
// (8) fail-closed input.
{
  ok("missing system ⇒ INVALID_INPUT", R.buildAssuranceReport({}).code === "INVALID_INPUT");
}

console.log(`\nAI-ASSURANCE-REPORT suite — ${pass} assertions passed. (executed technical checks + exit codes; freshness gate stale⇒not-PASS; ASSURED fail-closed; integrity digest; exportable; always NOT_CERTIFIED)`);
