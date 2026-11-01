#!/usr/bin/env node
/**
 * dataset-quality-assertions — a named, enumerable ASSERTION-TYPE registry over dataset-quality-service
 * (dbt-style: each quality check is a named assertion type), plus a SARIF adapter that REUSES the existing
 * sarif-report.toSarif. CAPABILITY_GAP_REGISTER_V1.md G-04 (P2): give D04's findings a stable, dbt-style
 * taxonomy and emit them as SARIF, honestly marking the dimensions not yet implemented.
 *
 * WHY: dataset-quality-service already emits findings keyed by `area` (completeness/validity/uniqueness/
 * conformance). This adds (a) an ENUMERABLE, frozen registry naming each assertion type and its IMPLEMENTED /
 * NOT_YET_IMPLEMENTED status (so coverage is explicit, not implied), and (b) a fail-closed SARIF adapter —
 * dataset-quality nests findings under `report.findings`, which sarif-report.toSarif (expects TOP-LEVEL
 * `findings[]`) cannot consume directly; this lifts them and delegates to the proven toSarif.
 *
 * HONESTY: the NOT_YET_IMPLEMENTED types (Moses's freshness/distribution/volume + referential relationships)
 * are declared as GAPS, never as silently-passing checks — coverage is enumerable and truthful. The adapter is
 * fail-closed: a non-ok / findings-less dataset-quality result ⇒ INVALID_INPUT (never a hollow empty SARIF).
 *
 * ADDITIVE / NON-INVASIVE: modifies NEITHER dataset-quality-service NOR sarif-report. PURE (no fs/net/clock).
 * NO new primitive. Dual export (ESM + CJS).
 */
"use strict";

const SARIF: any = require("./sarif-report.js");

const SCHEMA = "odg.dataset-quality-assertions.v1";

// Enumerable, frozen assertion-type taxonomy. `area` matches the dataset-quality finding `area`/id-prefix.
const ASSERTION_TYPES = Object.freeze([
  { name: "required_not_missing", area: "completeness", status: "IMPLEMENTED", description: "a required field has a non-empty value in every row" },
  { name: "type_valid", area: "validity", status: "IMPLEMENTED", description: "each value conforms to the field's declared type" },
  { name: "unique", area: "uniqueness", status: "IMPLEMENTED", description: "rows (by keyFields, else whole-record) are not duplicated" },
  { name: "accepted_values", area: "conformance", status: "IMPLEMENTED", description: "values fall within a declared enum" },
  { name: "range_min_max", area: "conformance", status: "IMPLEMENTED", description: "numeric values fall within a declared min/max" },
  { name: "pattern_match", area: "conformance", status: "IMPLEMENTED", description: "string values match a declared regex (malformed regex ⇒ fail-closed HIGH schema finding)" },
  // Declared-but-not-implemented (Moses's observability dimensions + dbt relationships). Honest GAPS — never
  // silently passed. A caller must NOT treat their absence as a clean result.
  { name: "freshness", area: "freshness", status: "NOT_YET_IMPLEMENTED", description: "data recency vs an expected window (requires a timestamp + clock — out of the pure, point-in-time scope today)" },
  { name: "distribution", area: "distribution", status: "NOT_YET_IMPLEMENTED", description: "value distribution vs an expected profile (anomaly/drift)" },
  { name: "volume", area: "volume", status: "NOT_YET_IMPLEMENTED", description: "row-count vs an expected range" },
  { name: "relationships", area: "referential_integrity", status: "NOT_YET_IMPLEMENTED", description: "referential integrity across datasets (dbt relationships) — single-dataset scope today" },
]);

const IMPLEMENTED = Object.freeze(ASSERTION_TYPES.filter((a) => a.status === "IMPLEMENTED").map((a) => a.name));
const BY_AREA: Record<string, any> = {};
for (const a of ASSERTION_TYPES) if (a.status === "IMPLEMENTED" && !(a.area in BY_AREA)) BY_AREA[a.area] = a;

// Map a dataset-quality finding to its named assertion type (by area, else id-prefix). Unknown ⇒ null (honest).
function assertionTypeOf(finding: any): any {
  if (!finding || typeof finding !== "object") return null;
  const area = typeof finding.area === "string" ? finding.area : (typeof finding.id === "string" && finding.id.includes(":") ? finding.id.split(":")[0] : "");
  // conformance findings can be any of accepted_values/range/pattern; without per-value detail we return the area-representative.
  const hit = ASSERTION_TYPES.find((a) => a.area === area && a.status === "IMPLEMENTED");
  return hit ? hit.name : null;
}

// Coverage read-model: which assertion types are implemented vs declared-gaps (enumerable, truthful).
function coverage(): any {
  return {
    schema: SCHEMA,
    implemented: IMPLEMENTED.slice(),
    notYetImplemented: ASSERTION_TYPES.filter((a) => a.status !== "IMPLEMENTED").map((a) => a.name),
    note: "NOT_YET_IMPLEMENTED types are declared GAPS, not silently-passing checks. Absence of a finding for them does NOT mean the data is clean on that dimension.",
  };
}

// SARIF adapter: lift dataset-quality's report.findings to the top-level shape toSarif expects, then DELEGATE
// to the proven sarif-report.toSarif. Fail-closed: a non-ok / findings-less result ⇒ INVALID_INPUT.
function toSarifFromDatasetQuality(dqResult: any, opts: any = {}): any {
  if (!dqResult || dqResult.ok !== true || !dqResult.report || !Array.isArray(dqResult.report.findings)) {
    return { ok: false, code: "INVALID_INPUT", detail: "an ok dataset-quality-service result with report.findings[] is required" };
  }
  // annotate each finding with its named assertion type (additive; does not mutate the source array)
  const findings = dqResult.report.findings.map((f: any) => ({ ...f, assertionType: assertionTypeOf(f) }));
  return SARIF.toSarif({ ok: true, findings }, opts);
}

export { ASSERTION_TYPES, IMPLEMENTED, assertionTypeOf, coverage, toSarifFromDatasetQuality, SCHEMA };
module.exports = { ASSERTION_TYPES, IMPLEMENTED, assertionTypeOf, coverage, toSarifFromDatasetQuality, SCHEMA };

if (require.main === module) {
  const DQ = require("./dataset-quality-service.js");
  const r = DQ.assessDataset({ format: "csv", content: "id,email\n1,a@b.com\n2,\n1,bad\n", schema: { fields: [{ name: "id", type: "integer", required: true }, { name: "email", type: "email", required: true }], keyFields: ["id"] } });
  const res = toSarifFromDatasetQuality(r); // toSarif wrapper: { ok, sarif, resultCount, ruleCount, truncated }
  process.stdout.write(JSON.stringify({ implemented: IMPLEMENTED.length, gaps: coverage().notYetImplemented.length, sarifResults: res.ok ? res.resultCount : "INVALID", validSarif: res.ok === true && SARIF.isValidSarif(res.sarif) }, null, 2) + "\n");
}
