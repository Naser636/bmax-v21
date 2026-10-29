#!/usr/bin/env node
/**
 * dataset-quality-service — the Documents/Data (#14) business capability: ingest a REAL dataset (CSV or JSON), run
 * real quality checks against a declared schema, and produce an evidence-based quality report with per-issue findings.
 *
 * Why NEW (not the existing src/core/data-quality-* modules): those are trivial stubs that FAKE the result
 * (computeDataQualityMetrics returns score=100 unconditionally, valid=total). This computes REAL metrics —
 * completeness / validity / uniqueness / overall — from the actual records, and is fail-closed/honest:
 *   - an empty dataset scores NO_DATA (null), NEVER a fabricated 100.
 *   - unparseable input ⇒ fail-closed INVALID_INPUT/PARSE_ERROR, never a hollow "clean" report.
 *   - a cell with no declared type carries no validity constraint (not silently "valid" against an invented rule).
 * Pure/deterministic: no fs, no network, no clock. Findings use the {id,area,severity,detail,remediation,evidence}
 * shape so they are SARIF-emittable like the other campaign capabilities. No new primitive.
 */
"use strict";

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function round(n: number): number { return Math.round(n * 1000) / 1000; }

// ---- minimal, dependency-free CSV parser (RFC-4180-ish: quoted fields, embedded commas/quotes/newlines) ----
function parseCsv(text: string): any[] {
  const rows: string[][] = [];
  let field = "", row: string[] = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  const nonEmpty = rows.filter((r) => !(r.length === 1 && r[0] === ""));
  if (nonEmpty.length === 0) return [];
  const header = nonEmpty[0];
  return nonEmpty.slice(1).map((r) => { const o: any = {}; header.forEach((h, idx) => { o[h] = r[idx] !== undefined ? r[idx] : ""; }); return o; });
}

function parseInput(input: any): { ok: boolean; records?: any[]; code?: string; reason?: string } {
  const fmt = String(input.format || (Array.isArray(input.records) ? "records" : "")).toLowerCase();
  if (fmt === "records") return Array.isArray(input.records) ? { ok: true, records: input.records } : { ok: false, code: "INVALID_INPUT", reason: "records[] required" };
  if (typeof input.content !== "string" || !input.content) return { ok: false, code: "INVALID_INPUT", reason: "content string required for csv/json" };
  if (fmt === "json") { try { const j = JSON.parse(input.content); const arr = Array.isArray(j) ? j : (Array.isArray(j.records) ? j.records : null); return arr ? { ok: true, records: arr } : { ok: false, code: "PARSE_ERROR", reason: "JSON is not an array of records" }; } catch (e: any) { return { ok: false, code: "PARSE_ERROR", reason: `invalid JSON: ${(e && e.message) || e}` }; } }
  if (fmt === "csv") { const recs = parseCsv(input.content); return recs.length ? { ok: true, records: recs } : { ok: false, code: "PARSE_ERROR", reason: "CSV has no data rows" }; }
  return { ok: false, code: "INVALID_INPUT", reason: `unknown format '${fmt}' (use csv|json|records)` };
}

const TYPE_CHECK: Record<string, (v: any) => boolean> = {
  string: (v) => typeof v === "string",
  number: (v) => (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))),
  integer: (v) => { const n = typeof v === "number" ? v : Number(v); return Number.isInteger(n) && String(v).trim() !== ""; },
  boolean: (v) => typeof v === "boolean" || /^(true|false)$/i.test(String(v)),
  date: (v) => /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?/.test(String(v)) && !isNaN(Date.parse(String(v))),
  email: (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v)),
};

function isEmpty(v: any): boolean { return v === null || v === undefined || (typeof v === "string" && v.trim() === ""); }

/**
 * assessDataset(input, opts?): ingest + assess. input = { format:"csv"|"json"|"records", content?, records?, schema? }.
 * schema = { fields:[{ name, type?, required? }], keyFields?:[string] }. Returns { ok, report } or fail-closed error.
 */
function assessDataset(input: any, opts: any = {}): any {
  if (!isObj(input)) return { ok: false, code: "INVALID_INPUT", reason: "input object required" };
  const parsed = parseInput(input);
  if (!parsed.ok) return parsed;
  const records = (parsed.records as any[]).filter((r) => isObj(r));
  const schema = isObj(input.schema) ? input.schema : {};
  const fields = Array.isArray(schema.fields) ? schema.fields : [];
  const requiredFields = fields.filter((f: any) => f && f.required).map((f: any) => f.name);
  const typedFields = fields.filter((f: any) => f && f.type);
  const keyFields: string[] = Array.isArray(schema.keyFields) ? schema.keyFields : [];
  const total = records.length;

  const findings: any[] = [];
  // ---- completeness (over required fields) ----
  let requiredCells = 0, filledRequired = 0;
  const missingByField: Record<string, number> = {};
  if (requiredFields.length) for (const r of records) for (const rf of requiredFields) { requiredCells++; if (isEmpty(r[rf])) missingByField[rf] = (missingByField[rf] || 0) + 1; else filledRequired++; }
  const completeness = requiredCells > 0 ? round(filledRequired / requiredCells) : null;   // null = not assessed (no required fields)

  // ---- validity (over typed fields; empty optional cells are not type-violations) ----
  let typedCells = 0, validCells = 0;
  const typeViolByField: Record<string, number> = {};
  if (typedFields.length) for (const r of records) for (const tf of typedFields) {
    const val = r[tf.name];
    if (isEmpty(val)) { if (requiredFields.includes(tf.name)) { typedCells++; /* missing required already counted; also a type miss */ typeViolByField[tf.name] = (typeViolByField[tf.name] || 0) + 1; } continue; }
    typedCells++;
    const check = TYPE_CHECK[String(tf.type)] || (() => true);   // unknown declared type ⇒ no constraint (honest)
    if (check(val)) validCells++; else typeViolByField[tf.name] = (typeViolByField[tf.name] || 0) + 1;
  }
  const validity = typedCells > 0 ? round(validCells / typedCells) : null;

  // ---- uniqueness (by keyFields if given, else whole-record) ----
  const seen = new Set<string>(); let duplicates = 0; const dupExamples: number[] = [];
  records.forEach((r, i) => { const key = keyFields.length ? keyFields.map((k) => String(r[k])).join("") : JSON.stringify(r); if (seen.has(key)) { duplicates++; if (dupExamples.length < 10) dupExamples.push(i); } else seen.add(key); });
  const uniqueness = total > 0 ? round((total - duplicates) / total) : null;

  // ---- findings ----
  for (const [f, n] of Object.entries(missingByField)) findings.push({ id: `completeness:${f}`, area: "completeness", severity: "HIGH", detail: `${n}/${total} rows missing required field '${f}'`, remediation: `populate '${f}' or relax the required constraint`, evidence: `${n} empty cells in required field '${f}'` });
  for (const [f, n] of Object.entries(typeViolByField)) findings.push({ id: `validity:${f}`, area: "validity", severity: "MEDIUM", detail: `${n} value(s) in '${f}' violate the declared type`, remediation: `coerce/clean '${f}' to its declared type or correct the schema`, evidence: `${n} type-violating cells in '${f}'` });
  if (duplicates > 0) findings.push({ id: `uniqueness:${keyFields.join("+") || "row"}`, area: "uniqueness", severity: "MEDIUM", detail: `${duplicates} duplicate row(s) by ${keyFields.length ? "key [" + keyFields.join(",") + "]" : "whole-record"}`, remediation: "de-duplicate or confirm duplicates are legitimate", evidence: `duplicate row indices (first 10): ${dupExamples.join(", ")}` });

  // ---- overall score: weighted mean over the dimensions that were assessed (never a fabricated 100) ----
  const dims: Array<[number | null, number]> = [[completeness, 0.4], [validity, 0.4], [uniqueness, 0.2]];
  const assessed = dims.filter(([v]) => v !== null);
  const overallScore = total === 0 ? null : (assessed.length ? round(assessed.reduce((a, [v, w]) => a + (v as number) * w, 0) / assessed.reduce((a, [, w]) => a + w, 0)) : null);

  return {
    ok: true,
    report: {
      rowCount: total,
      assessedDimensions: assessed.length,
      metrics: { completeness, validity, uniqueness, overallScore },
      dedup: { duplicates, uniqueRows: total - duplicates },
      findingCount: findings.length,
      findings: findings.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "HIGH" ? -1 : 1)),
      clean: total > 0 && findings.length === 0,
      limits: [
        "quality is assessed ONLY against the supplied schema; without a schema, only uniqueness is computed",
        "an empty dataset scores NO_DATA (null), never a fabricated 100",
        "a declared type the service does not know carries NO validity constraint (not silently passed/failed)",
        "this is a data-quality assessment, NOT a semantic/business-correctness validation of the values",
      ],
      note: "Real computed data-quality metrics (completeness/validity/uniqueness) over the actual records. Fail-closed: empty ⇒ null (not 100); unparseable ⇒ error. No content retained; nothing sent anywhere.",
    },
  };
}

export { parseCsv, assessDataset };
module.exports = { parseCsv, assessDataset };

if (require.main === module) {
  const demo = assessDataset({ format: "csv", content: "id,email\n1,a@b.com\n2,\n1,bad\n", schema: { fields: [{ name: "id", type: "integer", required: true }, { name: "email", type: "email", required: true }], keyFields: ["id"] } });
  process.stdout.write(JSON.stringify(demo.report.metrics, null, 2) + "\n");
}
