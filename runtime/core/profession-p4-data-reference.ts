#!/usr/bin/env node
"use strict";

/*
 * V12.4 §43 P4 — Data Engineering reference project (E2 executed + E3 adversarial). PURE, deterministic. Over a
 * CLEARLY-LABELLED SYNTHETIC dataset it runs data-quality assertions (nulls / type errors / range errors / duplicates),
 * checks lineage/provenance presence, evaluates schema backward-COMPATIBILITY (REUSING api-contract.checkCompatibility —
 * no second contract engine), and proves idempotent (dedup) ingestion. Synthetic only; real warehouse/ETL over real
 * data (E5) is owner-gated NOT_RUN. Dual export.
 */

const API = require("./api-contract");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function round(n: number): number { return Number(n.toFixed(4)); }
function typeOf(v: any): string { return Array.isArray(v) ? "array" : (v === null ? "null" : typeof v); }

/** assessDataQuality(rows, schema) -> quality findings + score. schema: { field: {type, min?, max?, required?} }. */
function assessDataQuality(rows: any, schema: any, opts?: any): any {
  const rs = arr(rows).filter(isObj); const sc = isObj(schema) ? schema : {};
  const o = isObj(opts) ? opts : {};
  let nulls = 0, typeErrors = 0, rangeErrors = 0;
  for (const row of rs) {
    for (const f of Object.keys(sc)) {
      const spec = isObj(sc[f]) ? sc[f] : {};
      const v = row[f];
      if (v === undefined || v === null) { if (spec.required === true) nulls++; continue; }
      if (isStr(spec.type) && typeOf(v) !== spec.type) typeErrors++;
      if (typeof v === "number") { if (typeof spec.min === "number" && v < spec.min) rangeErrors++; if (typeof spec.max === "number" && v > spec.max) rangeErrors++; }
    }
  }
  const seen = new Set(); let duplicates = 0;
  for (const row of rs) { const k = isStr(row.id) ? row.id : JSON.stringify(row); if (seen.has(k)) duplicates++; else seen.add(k); }
  // V143 — TIMELINESS dimension (standard 6-dimension data quality: accuracy/completeness/consistency/TIMELINESS/validity/
  // uniqueness; research-backed). OPT-IN (opts.timeliness={field, maxAgeMs, nowMs}) so default behaviour is unchanged: a row
  // whose timestamp field is older than nowMs − maxAgeMs (or missing/unparseable) is STALE — a timeliness defect. Fail-closed.
  let stale = 0; let timelinessChecked = false;
  const tl = isObj(o.timeliness) ? o.timeliness : null;
  if (tl && isStr(tl.field) && typeof tl.maxAgeMs === "number" && tl.maxAgeMs >= 0 && typeof tl.nowMs === "number" && isFinite(tl.nowMs)) {
    timelinessChecked = true;
    for (const row of rs) {
      const raw = row[tl.field];
      const ts = typeof raw === "number" ? raw : (isStr(raw) ? Date.parse(raw) : NaN);
      if (!isFinite(ts) || (tl.nowMs - ts) > tl.maxAgeMs) stale++;   // missing/unparseable OR older than maxAge ⇒ stale (fail-closed)
    }
  }
  const dimsChecked = 3 + (timelinessChecked ? 1 : 0);   // completeness, validity, uniqueness (+ timeliness when configured)
  const totalChecks = rs.length * Math.max(1, Object.keys(sc).length);
  const defects = nulls + typeErrors + rangeErrors + duplicates + stale;
  const score = totalChecks > 0 ? round(1 - defects / totalChecks) : 0;
  return Object.freeze({ rows: rs.length, nulls, typeErrors, rangeErrors, duplicates, stale, timelinessChecked, dimsChecked, defects, score, clean: defects === 0 });
}

/** checkLineage(dataset) -> { ok, reason }. Fail-closed: a dataset without source+transform provenance is not trusted. */
function checkLineage(dataset: any): any {
  const d = isObj(dataset) ? dataset : {};
  const ok = isStr(d.source) && Array.isArray(d.transforms) && d.transforms.length > 0;
  return Object.freeze({ ok, reason: ok ? "lineage present (source + transforms)" : "missing source/transform lineage (fail-closed)" });
}

/** schemaCompatibility(oldSchema, newSchema) -> reuse api-contract: a removed/added required field or type change is BREAKING. */
function schemaCompatibility(oldSchema: any, newSchema: any): any {
  const toContract = (sc: any) => ({ requiredIn: Object.keys(isObj(sc) ? sc : {}).filter((f: any) => sc[f] && sc[f].required), requiredOut: [], inputSchema: Object.fromEntries(Object.keys(isObj(sc) ? sc : {}).map((f: any) => [f, (sc[f] && sc[f].type) || "string"])) });
  return API.checkCompatibility(toContract(oldSchema), toContract(newSchema));
}

/** idempotentReplay(rows) -> { deduped, idempotent }. Ingesting the same rows twice yields the same deduped set. */
function idempotentReplay(rows: any): any {
  const dedup = (xs: any[]) => { const seen = new Set(); const out: any[] = []; for (const r of xs) { const k = isObj(r) && isStr(r.id) ? r.id : JSON.stringify(r); if (!seen.has(k)) { seen.add(k); out.push(r); } } return out; };
  const once = dedup(arr(rows)); const twice = dedup(arr(rows).concat(arr(rows)));
  return Object.freeze({ deduped: once.length, idempotent: once.length === twice.length });
}

function runReferenceProject(opts: any): any {
  const o = isObj(opts) ? opts : {};
  const schema = isObj(o.schema) ? o.schema : { id: { type: "string", required: true }, age: { type: "number", min: 0, max: 120, required: true } };
  const rows = arr(o.rows).length ? o.rows : [{ id: "r1", age: 30 }, { id: "r2", age: 45 }, { id: "r3", age: 22 }];
  const quality = assessDataQuality(rows, schema);
  const lineage = checkLineage(isObj(o.dataset) ? o.dataset : { source: "synthetic-gen", transforms: ["normalize"] });
  const compat = o.newSchema ? schemaCompatibility(schema, o.newSchema) : null;
  const replay = idempotentReplay(rows);
  const degraded = !quality.clean || !lineage.ok || !replay.idempotent || (compat && compat.compatible === false);
  return Object.freeze({ synthetic: true, profession: "P4", quality, lineage, schemaCompatibility: compat, replay, level: compat ? "E3" : "E2", degraded: !!degraded, note: "SYNTHETIC dataset (not real/client data, not E5); quality+lineage+schema-compat+idempotence; real warehouse/ETL (E5) owner-gated NOT_RUN" });
}

const P4_DATA_REFERENCE_CONTRACT = Object.freeze({
  id: "V124-P4-DATA-REFERENCE",
  source: "V12.4 §43 P4 (Data Engineering) — E2 reference + E3 adversarial (bad data / breaking schema)",
  levels: Object.freeze(["E0", "E1", "E2", "E3", "E4(owner/independent)", "E5(owner-gated NOT_RUN)"]),
  reuses: Object.freeze(["api-contract.checkCompatibility (schema compatibility)"]),
  notAuthority: "a runnable data-engineering reference over a SYNTHETIC dataset; no real data, no E5 claim",
  invariants: Object.freeze([
    "SYNTHETIC data only; real warehouse/ETL (E5) owner-gated NOT_RUN (no inflated level)",
    "quality (nulls/type/range/duplicates) + lineage (fail-closed) + schema backward-compatibility + idempotent replay",
    "schema compatibility reuses api-contract (no second contract engine)",
    "pure/deterministic + reproducible",
  ]),
});

module.exports = { assessDataQuality, checkLineage, schemaCompatibility, idempotentReplay, runReferenceProject, P4_DATA_REFERENCE_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...P4_DATA_REFERENCE_CONTRACT, demo: runReferenceProject({}) }, null, 2) + "\n"); }

export {};
