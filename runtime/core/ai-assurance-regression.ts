#!/usr/bin/env node
/**
 * ai-assurance-regression — PRODUCT D7 SLICE 3: regression/change monitoring between two ai-assurance reports
 * (from ai-assurance-report.buildAssuranceReport) + a CLI export. Detects when assurance DEGRADES across versions:
 * a control PASS→FAIL, overall ASSURED→NOT_ASSURED, technical exit 0→1 (new HIGH), evidence fresh→stale/missing, or a
 * report-integrity break. Fail-closed: a missing/invalid/empty report or a broken integrity digest is NEVER treated as
 * "no regression" — it is INVALID_INPUT / INTEGRITY_FAILED. Composes evidence-provenance for the integrity recheck;
 * NO new primitive. Pure/deterministic.
 */
"use strict";

const prov = require("./evidence-provenance.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isReport(r: any): boolean { return isObj(r) && isObj(r.controlTally) && typeof r.overall === "string"; }

/** verifyReportIntegrity(report): recompute the content digest (excluding the digest field) and compare. */
function verifyReportIntegrity(report: any): boolean {
  if (!isObj(report) || typeof report.integrityDigest !== "string" || !report.integrityDigest) return false;
  const copy: any = { ...report }; delete copy.integrityDigest;
  return prov.contentDigest(copy) === report.integrityDigest;
}

/**
 * compareReports(before, after): detect regressions/improvements between two assurance reports. Returns
 * { ok, verdict, overallTransition, tallyDelta, regressions[], changes[], integrity, exitCode, certificationStatus }.
 * verdict ∈ INTEGRITY_FAILED | REGRESSION | IMPROVED | STABLE. Fail-closed on non-reports.
 */
function compareReports(before: any, after: any): any {
  if (!isReport(before) || !isReport(after)) return { ok: false, code: "INVALID_INPUT", reason: "two assurance report objects (with controlTally + overall) are required", exitCode: 2 };

  // integrity recheck FIRST — a tampered/corrupt report cannot be trusted for a 'no regression' conclusion.
  // FAIL-CLOSED on an ABSENT digest too: buildAssuranceReport ALWAYS stamps one, so a missing/unverifiable digest is
  // "cannot verify" and must NEVER collapse into "intact/no-regression". verifyReportIntegrity returns false when the
  // digest is absent OR mismatched; we require it to be explicitly true on BOTH sides.
  const beforeIntact = verifyReportIntegrity(before);
  const afterIntact = verifyReportIntegrity(after);
  const integrityFailed = !beforeIntact || !afterIntact;

  const regressions: any[] = [];
  const changes: any[] = [];

  // overall transition.
  const overallTransition = `${before.overall} → ${after.overall}`;
  const overallRegressed = before.overall === "ASSURED_TECHNICAL" && after.overall !== "ASSURED_TECHNICAL";
  const overallImproved = before.overall !== "ASSURED_TECHNICAL" && after.overall === "ASSURED_TECHNICAL";
  if (overallRegressed) regressions.push({ kind: "overall", detail: `assurance regressed: ${overallTransition}`, severity: "HIGH" });
  if (before.overall !== after.overall) changes.push({ kind: "overall", from: before.overall, to: after.overall });

  // control tally deltas.
  const keys = ["PASS", "FAIL", "INSUFFICIENT_EVIDENCE", "NOT_APPLICABLE"];
  const tallyDelta: any = {};
  for (const k of keys) tallyDelta[k] = ((after.controlTally[k] || 0) - (before.controlTally[k] || 0));
  if (tallyDelta.PASS < 0) regressions.push({ kind: "controls", detail: `PASS controls dropped by ${-tallyDelta.PASS}`, severity: "HIGH" });
  if (tallyDelta.FAIL > 0) regressions.push({ kind: "controls", detail: `FAIL controls increased by ${tallyDelta.FAIL}`, severity: "HIGH" });
  if (tallyDelta.INSUFFICIENT_EVIDENCE > 0) regressions.push({ kind: "controls", detail: `INSUFFICIENT_EVIDENCE controls increased by ${tallyDelta.INSUFFICIENT_EVIDENCE}`, severity: "MEDIUM" });

  // technical regression.
  const bt = isObj(before.technical) ? before.technical : {}, at = isObj(after.technical) ? after.technical : {};
  if (bt.status === "PASS" && (at.status === "FAIL" || at.status === "INSUFFICIENT_EVIDENCE")) regressions.push({ kind: "technical", detail: `technical check regressed PASS→${at.status} (exit ${bt.exitCode}→${at.exitCode})`, severity: "HIGH" });
  if (typeof bt.exitCode === "number" && typeof at.exitCode === "number" && bt.exitCode === 0 && at.exitCode === 1) changes.push({ kind: "technical-exit", from: 0, to: 1 });
  if (typeof at.highCount === "number" && typeof bt.highCount === "number" && at.highCount > bt.highCount) regressions.push({ kind: "technical", detail: `technical HIGH findings increased ${bt.highCount}→${at.highCount}`, severity: "HIGH" });

  // evidence-freshness regression (evidence went stale/missing ⇒ can no longer support PASS).
  const bf = isObj(before.evidenceFreshness) ? before.evidenceFreshness : {}, af = isObj(after.evidenceFreshness) ? after.evidenceFreshness : {};
  if (bf.status === "PASS" && (af.status === "FAIL" || af.status === "INSUFFICIENT_EVIDENCE")) regressions.push({ kind: "evidence-freshness", detail: `evidence freshness regressed PASS→${af.status} (stale/missing/unverifiable evidence)`, severity: "HIGH" });

  // integrity / version consistency heuristic: a regression comparison expects two DIFFERENT versions (different
  // generatedAt). Same generatedAt + different digest means the two reports are not identical though they claim the
  // same version timestamp — an anomaly (stale clock or tampering). Flagged fail-closed (errs safe: adds, never masks).
  if (before.generatedAt && before.generatedAt === after.generatedAt && before.integrityDigest && after.integrityDigest && before.integrityDigest !== after.integrityDigest) {
    regressions.push({ kind: "integrity", detail: "two reports claim the same generatedAt but differ in content (different integrity digests) — anomalous (stale clock or tampering); investigate", severity: "HIGH" });
  }
  if (before.generatedAt !== after.generatedAt) changes.push({ kind: "version", from: before.generatedAt || null, to: after.generatedAt || null });

  const verdict = integrityFailed ? "INTEGRITY_FAILED" : (regressions.length ? "REGRESSION" : (overallImproved ? "IMPROVED" : "STABLE"));
  const exitCode = verdict === "INTEGRITY_FAILED" ? 2 : (verdict === "REGRESSION" ? 1 : 0);
  return {
    ok: true, verdict, exitCode, overallTransition, tallyDelta,
    regressions, changes,
    integrity: { beforeIntact, afterIntact, integrityFailed },
    certificationStatus: "NOT_CERTIFIED — a technical regression comparison, not a conformity verdict",
    limitations: [
      "fail-closed: a non-report input, OR a report whose integrity digest is absent/mismatched (unverifiable), is NEVER 'no regression' — INVALID_INPUT/INTEGRITY_FAILED (exit 2)",
      "control regressions are detected from AGGREGATE tally deltas (PASS dropped / FAIL or INSUFFICIENT rose); an exactly-offsetting per-control flip (X PASS→FAIL while Y FAIL→PASS) nets to zero and is NOT caught at control-id granularity (the report does not carry per-control ids)",
      "technical/freshness PASS→FAIL and PASS→INSUFFICIENT_EVIDENCE are caught directly; other degradations are caught only via the overall ASSURED_TECHNICAL→NOT_ASSURED transition",
      "the same-generatedAt-different-digest check is a heuristic anomaly flag (errs safe — it adds a regression, never masks one), not a proof of tampering",
      "a technical regression comparison, NOT a certification or conformity assessment",
    ],
    note: "D7 regression monitor: compares two assurance reports; REGRESSION on detected control/technical/freshness/integrity degradation (see limitations for granularity). A missing/invalid report or an absent/broken digest ⇒ never 'no regression' (fail-closed). NOT a certification.",
  };
}

export { compareReports, verifyReportIntegrity };
module.exports = { compareReports, verifyReportIntegrity };

if (require.main === module) {
  const fs = require("fs");
  const [a, b] = [process.argv[2], process.argv[3]];
  if (!a || !b) { process.stdout.write("usage: ai-assurance-regression <before.json> <after.json>\n"); process.exit(2); }
  let before: any, after: any;
  try { before = JSON.parse(fs.readFileSync(a, "utf8")); after = JSON.parse(fs.readFileSync(b, "utf8")); }
  catch (e: any) { process.stderr.write(`cannot read/parse reports: ${(e && e.message) || e}\n`); process.exit(2); }
  const r = compareReports(before.report || before, after.report || after);
  process.stdout.write(JSON.stringify(r, null, 2) + "\n");
  process.exit(typeof r.exitCode === "number" ? r.exitCode : 2);
}
