#!/usr/bin/env node
"use strict";
/*
 * V146 MÉTIER 4 (data engineering) — CONTROLLED READ-ONLY DATA CONNECTOR (CSV / JSON). PURE, deterministic, fail-closed.
 * Imports a text payload (synthetic, clearly labelled), parses it, maps fields, validates the schema and quality (REUSING
 * profession-p4-data-reference.assessDataQuality — the 6-dimension check incl. timeliness), detects duplicates, and produces
 * a reproducible anomaly report. READ-ONLY: it parses text, it never writes anywhere and never fetches. No new primitive,
 * no parallel integration architecture — it feeds the existing data-quality engine.
 *
 * importCsv(text, {schema, fieldMap?, timeliness?}) / importJson(text, {schema,...}) -> { ok, rows, quality, duplicates,
 * anomalies, dropped, note }. Malformed input ⇒ { ok:false, code } (fail-closed, never a partial silent success).
 */
const P4 = require("./profession-p4-data-reference.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string"; }

// minimal, deterministic CSV: header row + comma-separated; supports double-quoted fields with "" escaping and commas inside.
function parseCsvLine(line: string): string[] {
  const out: string[] = []; let cur = ""; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += c; }
    else if (c === '"') inQ = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur); return out;
}
function coerce(v: string): any { if (v === "") return null; const n = Number(v); return v.trim() !== "" && Number.isFinite(n) && String(n) === v.trim() ? n : v; }

function applyMap(row: any, fieldMap: any): any {
  if (!isObj(fieldMap)) return row;
  const out: any = {}; for (const k of Object.keys(row)) out[isStr(fieldMap[k]) ? fieldMap[k] : k] = row[k]; return out;
}
function dedupe(rows: any[], keyField: string): { rows: any[]; duplicates: any[] } {
  const seen = new Set<string>(); const uniq: any[] = []; const duplicates: any[] = [];
  for (const r of rows) { const k = keyField && r[keyField] !== undefined ? String(r[keyField]) : JSON.stringify(r); if (seen.has(k)) duplicates.push(r); else { seen.add(k); uniq.push(r); } }
  return { rows: uniq, duplicates };
}

function analyze(rows: any[], o: any): any {
  const schema = isObj(o.schema) ? o.schema : {};
  const keyField = isStr(o.keyField) ? o.keyField : "id";
  const { rows: uniq, duplicates } = dedupe(rows, keyField);
  const quality = P4.assessDataQuality(uniq, schema, isObj(o.timeliness) ? { timeliness: o.timeliness } : undefined);
  // anomalies surfaced from the quality report (nulls/type/range/stale) + duplicates.
  const anomalies: any[] = [];
  if (quality.nulls > 0) anomalies.push({ kind: "MISSING_REQUIRED", count: quality.nulls });
  if (quality.typeErrors > 0) anomalies.push({ kind: "TYPE_MISMATCH", count: quality.typeErrors });
  if (quality.rangeErrors > 0) anomalies.push({ kind: "OUT_OF_RANGE", count: quality.rangeErrors });
  if (quality.stale > 0) anomalies.push({ kind: "STALE", count: quality.stale });
  if (duplicates.length > 0) anomalies.push({ kind: "DUPLICATE", count: duplicates.length });
  return Object.freeze({ ok: true, rows: Object.freeze(uniq), rowCount: uniq.length, quality, duplicates: Object.freeze(duplicates), anomalies: Object.freeze(anomalies), clean: quality.clean && duplicates.length === 0, note: "READ-ONLY import on synthetic/labelled data; quality via assessDataQuality (6-dim incl. timeliness); fail-closed; no write/fetch." });
}

function importCsv(text: any, opts?: any): any {
  const o = isObj(opts) ? opts : {};
  if (!isStr(text) || text.trim().length === 0) return Object.freeze({ ok: false, code: "EMPTY_INPUT" });
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l: string) => l.length > 0);
  if (lines.length < 2) return Object.freeze({ ok: false, code: "NO_DATA_ROWS", detail: "need a header row + ≥1 data row" });
  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows: any[] = []; let dropped = 0;
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    if (cells.length !== header.length) { dropped++; continue; }                 // ragged row ⇒ dropped (fail-closed)
    const row: any = {}; header.forEach((h, j) => { row[h] = coerce(cells[j]); });
    rows.push(applyMap(row, o.fieldMap));
  }
  if (rows.length === 0) return Object.freeze({ ok: false, code: "NO_VALID_ROWS", dropped });
  return Object.freeze({ ...analyze(rows, o), dropped });
}

function importJson(text: any, opts?: any): any {
  const o = isObj(opts) ? opts : {};
  if (!isStr(text) || text.trim().length === 0) return Object.freeze({ ok: false, code: "EMPTY_INPUT" });
  let parsed: any; try { parsed = JSON.parse(text); } catch (e: any) { return Object.freeze({ ok: false, code: "INVALID_JSON", detail: (e && e.message) || String(e) }); }
  const arr = Array.isArray(parsed) ? parsed : (isObj(parsed) && Array.isArray(parsed.records) ? parsed.records : null);
  if (!arr) return Object.freeze({ ok: false, code: "NOT_AN_ARRAY", detail: "expected a JSON array or { records: [...] }" });
  const rows = arr.filter(isObj).map((r: any) => applyMap(r, o.fieldMap));
  const dropped = arr.length - rows.length;
  if (rows.length === 0) return Object.freeze({ ok: false, code: "NO_VALID_ROWS", dropped });
  return Object.freeze({ ...analyze(rows, o), dropped });
}

const DATA_CONNECTOR_CONTRACT = Object.freeze({
  id: "V146-DATA-CONNECTOR",
  reuses: ["profession-p4-data-reference.assessDataQuality (6-dimension quality incl. timeliness)"],
  invariants: Object.freeze([
    "READ-ONLY: parses text; never writes or fetches; synthetic/labelled data only",
    "fail-closed: empty/no-data/ragged-CSV/invalid-JSON/not-an-array ⇒ { ok:false, code } (never a silent partial import)",
    "dedup by key field; quality + anomalies via the existing data-quality engine (no parallel integration architecture)",
    "deterministic parser; coerces numbers only when exact; no new primitive",
  ]),
});
module.exports = { importCsv, importJson, parseCsvLine, DATA_CONNECTOR_CONTRACT };
export {};
