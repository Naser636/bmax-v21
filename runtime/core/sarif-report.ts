#!/usr/bin/env node
/**
 * sarif-report — emit the assurance pilot's findings as a SARIF 2.1.0 log (V21 Phase 6 / benchmark ref #6).
 *
 * SARIF 2.1.0 (OASIS) is the open interchange format for static-analysis results: once ODG's assurance
 * output is SARIF, ANY consumer (GitHub code-scanning, GitLab, VS Code SARIF viewer, a custom dashboard)
 * can read it — the single highest-leverage, lowest-lock-in standard from the external benchmark, and the
 * one that makes the assurance result sellable/interoperable. This is a pure, deterministic converter over
 * assurance-pilot-runner's `{ findings:[{id,area,severity,detail,remediation,evidence}], seal }` output.
 *
 * Fidelity to the standard + ODG honesty:
 *   - severity → SARIF level: HIGH→error, MEDIUM→warning, LOW/INFO→note (deny-by-default: unknown→warning).
 *   - rules[] deduped by stable ruleId (the finding id's prefix before ':', else area); results reference it.
 *   - GitHub's 25,000-results/run cap is honored, and any truncation is REPORTED (never silently dropped).
 *   - fail-closed: a non-ok / malformed pilot result yields INVALID_INPUT, never a hollow "valid" log.
 * No fs/clock/network; `driver.version` is the honest emitter version (caller-supplied, not fabricated).
 */
"use strict";

// GitHub code-scanning SARIF cap (verified 2026-10-27): 25,000 results per run.
const SARIF_MAX_RESULTS = 25000;
const SARIF_VERSION = "2.1.0";
const SARIF_SCHEMA = "https://json.schemastore.org/sarif-2.1.0.json";

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function nonEmptyString(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

/** sarifLevel(severity): map ODG severity → SARIF result.level (deny-by-default to "warning"). */
function sarifLevel(severity: any): string {
  const s = nonEmptyString(severity) ? severity.toUpperCase() : "";
  if (s === "HIGH" || s === "CRITICAL" || s === "ERROR") return "error";
  if (s === "MEDIUM" || s === "WARNING") return "warning";
  if (s === "LOW" || s === "INFO" || s === "NOTE") return "note";
  return "warning";
}

/** stable ruleId for a finding: the id's category prefix (before ':'), else its area, else "finding". */
function ruleIdOf(f: any): string {
  if (nonEmptyString(f && f.id)) return String(f.id).split(":")[0];
  if (nonEmptyString(f && f.area)) return String(f.area);
  return "finding";
}

/** logical location name: the component after ':' in the id (e.g. a dependency name), else the project. */
function locationName(f: any, project: string): string {
  if (nonEmptyString(f && f.id) && String(f.id).includes(":")) { const part = String(f.id).split(":").slice(1).join(":"); if (nonEmptyString(part)) return part; }
  return project;
}

/**
 * toSarif(result, opts?): convert an assurance-pilot-runner result into a SARIF 2.1.0 log.
 * opts: { toolName, version, informationUri, maxResults }. Returns { ok, sarif, resultCount, ruleCount, truncated }.
 */
function toSarif(result: any, opts: any = {}): any {
  if (!isObj(result) || result.ok !== true || !Array.isArray(result.findings)) {
    return { ok: false, code: "INVALID_INPUT", detail: "an ok assurance-pilot-runner result with findings[] is required" };
  }
  const project = nonEmptyString(result.project) ? result.project : "project";
  const maxResults = Number.isInteger(opts.maxResults) && opts.maxResults > 0 ? opts.maxResults : SARIF_MAX_RESULTS;
  const all = result.findings;
  const kept = all.slice(0, maxResults);
  const truncated = all.length - kept.length;

  const rulesById: Record<string, any> = {};
  const results = kept.map((f: any) => {
    const ruleId = ruleIdOf(f);
    if (!rulesById[ruleId]) {
      rulesById[ruleId] = {
        id: ruleId,
        name: ruleId,
        shortDescription: { text: nonEmptyString(f.area) ? `${f.area} finding` : ruleId },
        defaultConfiguration: { level: sarifLevel(f.severity) },
      };
    }
    return {
      ruleId,
      level: sarifLevel(f.severity),
      message: { text: nonEmptyString(f.detail) ? f.detail : ruleId },
      locations: [{ logicalLocations: [{ fullyQualifiedName: locationName(f, project) }] }],
      properties: {
        area: f.area || null,
        severity: f.severity || null,
        remediation: nonEmptyString(f.remediation) ? f.remediation : null,
        evidence: nonEmptyString(f.evidence) ? f.evidence : null,
      },
    };
  });

  const driver: any = {
    name: nonEmptyString(opts.toolName) ? opts.toolName : "ODG-Assurance",
    version: nonEmptyString(opts.version) ? opts.version : "1",
    rules: Object.values(rulesById),
  };
  if (nonEmptyString(opts.informationUri)) driver.informationUri = opts.informationUri;

  const sarif = {
    version: SARIF_VERSION,
    $schema: SARIF_SCHEMA,
    runs: [{
      tool: { driver },
      results,
      properties: {
        project,
        synthetic: result.synthetic === true,
        seal: nonEmptyString(result.seal) ? result.seal : null,
        truncated,
        totalFindings: all.length,
      },
    }],
  };
  return { ok: true, sarif, resultCount: results.length, ruleCount: driver.rules.length, truncated };
}

/** isValidSarif(log): minimal STRUCTURAL validity check (no external schema dep) — deny-by-default. */
function isValidSarif(log: any): boolean {
  if (!isObj(log) || log.version !== SARIF_VERSION || !Array.isArray(log.runs) || log.runs.length === 0) return false;
  return log.runs.every((run: any) =>
    isObj(run) && isObj(run.tool) && isObj(run.tool.driver) && nonEmptyString(run.tool.driver.name) &&
    Array.isArray(run.tool.driver.rules) && Array.isArray(run.results) &&
    run.results.every((r: any) => isObj(r) && nonEmptyString(r.ruleId) && nonEmptyString(r.level) && isObj(r.message) && nonEmptyString(r.message.text)));
}

export { SARIF_MAX_RESULTS, SARIF_VERSION, sarifLevel, ruleIdOf, toSarif, isValidSarif };
module.exports = { SARIF_MAX_RESULTS, SARIF_VERSION, sarifLevel, ruleIdOf, toSarif, isValidSarif };

// Read-only CLI: print the format identity + cap; mutates nothing.
if (require.main === module) {
  process.stdout.write(JSON.stringify({ format: "SARIF", version: SARIF_VERSION, maxResults: SARIF_MAX_RESULTS }, null, 2) + "\n");
}
