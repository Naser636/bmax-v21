#!/usr/bin/env node
"use strict";
/*
 * V147 MÉTIER 1 (CRA/SBOM) — REMEDIATION ENGINE. PURE, deterministic, fail-closed. The logical continuation of the V143
 * DETECTION capability (sbom-audit-service): it takes EXISTING findings and turns them into a verifiable remediation PLAN,
 * then verifies a correction by comparing a BEFORE vs AFTER SBOM state. It does NOT replace or weaken detection.
 *
 * HONESTY (directive §2.1): this engine invents NOTHING. It never fabricates a CVE, a CVSS score, a fixed version, or the
 * availability of a patch. It only uses what each finding actually carries. When no verified fix is known, it says so and
 * proposes investigation rather than a false solution.
 * SECURITY (directive §2.4): it analyses + proposes only. It applies NO change to any real repository, performs no push, no
 * publication, no real remediation. Distinguishes RECOMMENDATION → PROPOSED_PATCH → (out of scope: APPLIED → VERIFIED).
 *
 * buildRemediationPlan(findings, opts?) -> { ok, items[], summary, note }
 *   finding: { id, severity?, component?, version?, evidence?, area?, cve?, cvss?, fixedVersion?, fixVerified?,
 *              direct?, dependents?[], applicable? }
 * verifyRemediation({ before, after, findings? }) -> { ok, diff, resolutions[], closure, residualRisk, note }
 *   before/after: { components: [{ name, version }], knownVulns?: [{ id, component, fixedVersion? }] }
 */
const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)/;

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

// deterministic numeric semver compare on the x.y.z prefix. Returns 1 / 0 / -1, or null if either side is not comparable
// (we never guess ordering of non-semver strings — that would risk a false "resolved").
function cmpSemver(a: any, b: any): number | null {
  if (!isStr(a) || !isStr(b)) return null;
  const ma = SEMVER_RE.exec(a.trim()), mb = SEMVER_RE.exec(b.trim());
  if (!ma || !mb) return null;
  for (let i = 1; i <= 3; i++) { const x = parseInt(ma[i], 10), y = parseInt(mb[i], 10); if (x !== y) return x > y ? 1 : -1; }
  return 0;
}

// classify what the finding actually establishes — never upgraded beyond its evidence.
function classifyStatus(f: any): string {
  if (f.applicable === false) return "NOT_APPLICABLE";
  if (!isStr(f.component)) return "MISSING_INFO";                           // cannot act without a component
  if (!isStr(f.version)) return "MISSING_INFO";
  if (isStr(f.evidence) || isStr(f.cve)) return "CONFIRMED";               // concrete proof of the issue
  return "POTENTIAL";                                                       // component known, but proof incomplete
}

// fix availability — strictly from supplied, verified data. No invented target versions.
function fixAvailability(f: any): any {
  if (isStr(f.fixedVersion) && f.fixVerified === true) return { state: "VERIFIED_FIX", targetVersion: f.fixedVersion };
  if (isStr(f.fixedVersion)) return { state: "PROPOSED_UNVERIFIED_FIX", targetVersion: f.fixedVersion };
  return { state: "NO_KNOWN_FIX", targetVersion: null };
}

const SEV_RANK: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 };
function sev(f: any): string { const s = isStr(f.severity) ? f.severity.toUpperCase() : "UNKNOWN"; return SEV_RANK[s] !== undefined ? s : "UNKNOWN"; }

function buildItem(f: any, idx: number): any {
  const status = classifyStatus(f);
  const fix = fixAvailability(f);
  const s = sev(f);
  const direct = f.direct === true;
  // priority: severity, bumped by directness, and a confirmed+verified-fix item is the most actionable.
  let priorityScore = SEV_RANK[s] * 2 + (direct ? 1 : 0) + (fix.state === "VERIFIED_FIX" ? 1 : 0);
  if (status === "NOT_APPLICABLE") priorityScore = -1;
  const dependents = Array.isArray(f.dependents) ? f.dependents.filter(isStr) : [];
  // the recommended action is bounded by what is actually known.
  const action = status === "NOT_APPLICABLE" ? "NO_ACTION (not applicable — documented)"
    : status === "MISSING_INFO" ? "INVESTIGATE — identify the exact component/version before any change (missing info)"
    : fix.state === "VERIFIED_FIX" ? `UPGRADE ${f.component} ${f.version} → ${fix.targetVersion} (verified fix)`
    : fix.state === "PROPOSED_UNVERIFIED_FIX" ? `CANDIDATE UPGRADE ${f.component} → ${fix.targetVersion} — VERIFY the fix (version/patch not confirmed) before applying`
    : `INVESTIGATE — no verified fix known for ${f.component} ${f.version}; assess mitigation/replacement/accepted-risk (do NOT fabricate a fix)`;
  const regressionRisk = dependents.length > 0
    ? `${dependents.length} dependent(s) may break on upgrade: ${dependents.slice(0, 10).join(", ")} — run their tests`
    : (fix.state === "NO_KNOWN_FIX" ? "unknown (no fix path established)" : "no recorded dependents; still run the full test suite");
  return Object.freeze({
    seq: idx + 1,
    finding: { id: isStr(f.id) ? f.id : `finding#${idx + 1}`, cve: isStr(f.cve) ? f.cve : null, cvss: typeof f.cvss === "number" ? f.cvss : null, evidence: isStr(f.evidence) ? f.evidence : null, area: isStr(f.area) ? f.area : null },
    status, severity: s, component: isStr(f.component) ? f.component : null, version: isStr(f.version) ? f.version : null,
    direct, dependents: Object.freeze(dependents),
    fixAvailability: Object.freeze(fix),
    recommendedAction: action,
    remediationState: "RECOMMENDATION",            // RECOMMENDATION → PROPOSED_PATCH → (APPLIED/VERIFIED are OWNER-GATED, out of this engine)
    regressionRisk,
    prerequisites: status === "MISSING_INFO" ? ["obtain component + exact version + proof"] : (fix.state === "VERIFIED_FIX" ? ["lockfile update", "rebuild", "re-run affected tests"] : ["investigation / vendor advisory", "impact assessment"]),
    testsRequired: ["unit + integration of the affected component", "regression suite of recorded dependents", "a fresh SBOM + detection re-scan (BEFORE/AFTER) to prove closure"],
    proofToClose: "a NEW SBOM/detection analysis showing the vulnerable component/version is gone (or updated past the verified fix) AND no new HIGH finding introduced — not a declaration that a fix was applied",
    validation: { owner: "OWNER/operator (human)", status: "PENDING" },
    priorityScore,
  });
}

function buildRemediationPlan(findings: any, opts?: any): any {
  if (!Array.isArray(findings)) return Object.freeze({ ok: false, code: "NO_FINDINGS", detail: "an array of findings is required (fail-closed)" });
  const valid = findings.filter(isObj);
  if (valid.length === 0) return Object.freeze({ ok: true, items: Object.freeze([]), summary: Object.freeze({ total: 0, actionable: 0 }), note: "no findings ⇒ empty plan (nothing to remediate asserted)" });
  const items = valid.map((f: any, i: number) => buildItem(f, i)).sort((a: any, b: any) => b.priorityScore - a.priorityScore || a.seq - b.seq);
  const byStatus: Record<string, number> = {}; const byFix: Record<string, number> = {}; const bySeverity: Record<string, number> = {};
  for (const it of items) { byStatus[it.status] = (byStatus[it.status] || 0) + 1; byFix[it.fixAvailability.state] = (byFix[it.fixAvailability.state] || 0) + 1; bySeverity[it.severity] = (bySeverity[it.severity] || 0) + 1; }
  return Object.freeze({
    ok: true,
    items: Object.freeze(items),
    summary: Object.freeze({
      total: items.length,
      byStatus: Object.freeze(byStatus), byFix: Object.freeze(byFix), bySeverity: Object.freeze(bySeverity),
      actionableVerifiedFix: byFix["VERIFIED_FIX"] || 0,
      needInvestigation: (byFix["NO_KNOWN_FIX"] || 0) + (byStatus["MISSING_INFO"] || 0),
      executionOrder: Object.freeze(items.filter((i: any) => i.status !== "NOT_APPLICABLE").map((i: any) => i.finding.id)),
    }),
    note: "REMEDIATION PLAN only — no CVE/score/fixed-version invented; no auto-fix applied to any real repo. VERIFIED_FIX items are actionable; NO_KNOWN_FIX/MISSING_INFO route to investigation. Closure requires a fresh BEFORE/AFTER analysis, not a declaration.",
  });
}

// ---- §2.3 before/after verification: closure is derived from the NEW SBOM, never from a claim ----
function componentMap(state: any): Map<string, string> {
  const m = new Map<string, string>();
  if (isObj(state) && Array.isArray(state.components)) for (const c of state.components) if (isObj(c) && isStr(c.name) && isStr(c.version)) m.set(c.name, c.version);
  return m;
}

function verifyRemediation(input: any): any {
  const i = isObj(input) ? input : {};
  if (!isObj(i.before) || !isObj(i.after)) return Object.freeze({ ok: false, code: "MISSING_STATE", detail: "both a before and after SBOM state are required (fail-closed)" });
  const before = componentMap(i.before), after = componentMap(i.after);
  const removed: string[] = [], added: string[] = [], updated: any[] = [], unchanged: string[] = [];
  for (const [name, v] of before) { if (!after.has(name)) removed.push(`${name}@${v}`); else if (after.get(name) !== v) updated.push({ name, from: v, to: after.get(name) }); else unchanged.push(`${name}@${v}`); }
  for (const [name, v] of after) if (!before.has(name)) added.push(`${name}@${v}`);

  // per-finding resolution against the AFTER state. A finding is RESOLVED only with positive evidence from the new SBOM.
  const findings = Array.isArray(i.findings) ? i.findings.filter(isObj) : [];
  const resolutions = findings.map((f: any) => {
    if (!isStr(f.component)) return Object.freeze({ id: isStr(f.id) ? f.id : null, resolution: "UNVERIFIABLE", reason: "finding has no component (cannot check the SBOM)" });
    const afterV = after.get(f.component);
    if (afterV === undefined) return Object.freeze({ id: f.id, component: f.component, resolution: "RESOLVED_REMOVED", reason: `component '${f.component}' absent from the AFTER SBOM (removed)` });
    // present in after: resolved only if moved past a VERIFIED fixed version (semver-comparable); else still present.
    if (isStr(f.fixedVersion) && f.fixVerified === true) {
      const c = cmpSemver(afterV, f.fixedVersion);
      if (c === null) return Object.freeze({ id: f.id, component: f.component, afterVersion: afterV, resolution: "NEEDS_REVIEW", reason: `cannot compare '${afterV}' to fixed '${f.fixedVersion}' (non-semver) — manual check required` });
      if (c >= 0) return Object.freeze({ id: f.id, component: f.component, afterVersion: afterV, resolution: "RESOLVED_UPGRADED", reason: `now ${afterV} ≥ verified fix ${f.fixedVersion}` });
      return Object.freeze({ id: f.id, component: f.component, afterVersion: afterV, resolution: "STILL_PRESENT", reason: `still ${afterV} < verified fix ${f.fixedVersion}` });
    }
    return Object.freeze({ id: f.id, component: f.component, afterVersion: afterV, resolution: "STILL_PRESENT", reason: "component still present and no verified fixed-version to compare against" });
  });

  // newly-introduced risk: findings supplied for the AFTER state that were not in before (regression).
  const newRisks = Array.isArray(i.afterFindings) ? i.afterFindings.filter(isObj).map((f: any) => ({ id: isStr(f.id) ? f.id : null, severity: isStr(f.severity) ? f.severity : "UNKNOWN", component: isStr(f.component) ? f.component : null })) : [];
  const stillPresent = resolutions.filter((r: any) => r.resolution === "STILL_PRESENT").length;
  const needsReview = resolutions.filter((r: any) => r.resolution === "NEEDS_REVIEW" || r.resolution === "UNVERIFIABLE").length;
  const resolvedCount = resolutions.filter((r: any) => r.resolution === "RESOLVED_REMOVED" || r.resolution === "RESOLVED_UPGRADED").length;
  const newHigh = newRisks.filter((r: any) => String(r.severity).toUpperCase() === "HIGH").length;

  // closure: only if every finding is resolved, nothing needs review, and no new HIGH risk was introduced.
  const closed = findings.length > 0 && stillPresent === 0 && needsReview === 0 && newHigh === 0;
  const closure = {
    verdict: closed ? "CLOSED_VERIFIED" : (findings.length === 0 ? "INCONCLUSIVE_NO_FINDINGS" : "NOT_CLOSED"),
    resolved: resolvedCount, stillPresent, needsReview, newHighIntroduced: newHigh,
    basis: "derived from the AFTER SBOM + supplied findings — NOT from a declaration that a fix was applied",
  };
  const residualRisk = [
    ...(stillPresent > 0 ? [`${stillPresent} finding(s) still present`] : []),
    ...(needsReview > 0 ? [`${needsReview} finding(s) need manual review`] : []),
    ...(newHigh > 0 ? [`${newHigh} NEW high-severity finding(s) introduced (regression)`] : []),
  ];
  return Object.freeze({
    ok: true,
    diff: Object.freeze({ removed: Object.freeze(removed.sort()), added: Object.freeze(added.sort()), updated: Object.freeze(updated), unchangedCount: unchanged.length }),
    resolutions: Object.freeze(resolutions),
    newRisks: Object.freeze(newRisks),
    closure: Object.freeze(closure),
    residualRisk: Object.freeze(residualRisk.length ? residualRisk : ["none detected from the supplied AFTER evidence (not a guarantee of absolute safety)"]),
    note: "BEFORE/AFTER SBOM diff + closure derived from the new analysis; a correction is 'closed' only on positive AFTER evidence, never on a claim. No real repo was modified.",
  });
}

const CRA_REMEDIATION_CONTRACT = Object.freeze({
  id: "V147-CRA-REMEDIATION-ENGINE",
  metier: "M1 CRA/SBOM — remediation planning + before/after closure verification",
  reuses: ["sbom-audit-service findings shape (detection, V143)", "deterministic semver prefix comparison"],
  remediationStates: Object.freeze(["RECOMMENDATION", "PROPOSED_PATCH", "APPLIED (owner-gated, out of scope)", "VERIFIED (owner-gated, out of scope)"]),
  invariants: Object.freeze([
    "invents NOTHING: no CVE, no CVSS, no fixed version, no patch availability — uses only what each finding carries",
    "NO verified fix ⇒ route to investigation (never a fabricated solution); MISSING_INFO ⇒ identify component first",
    "no auto-fix on any real repo; no push/publication; analyse + propose only (APPLIED/VERIFIED are owner-gated)",
    "closure is derived from the AFTER SBOM + fresh findings, never from a declaration; new HIGH ⇒ not closed",
    "deterministic + fail-closed; does not replace or weaken V143 detection",
  ]),
});
module.exports = { buildRemediationPlan, verifyRemediation, cmpSemver, CRA_REMEDIATION_CONTRACT };
export {};
