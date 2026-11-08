#!/usr/bin/env node
"use strict";

/*
 * WI-P11-16 — DOCUMENT PIPELINE (P11 Intelligent Document Processing — foundation). PURE, deterministic, LOCAL.
 * Pipeline: INGESTION → VALIDATION → EXTRACTION → STRUCTURATION → PROVENANCE → DEDUP → INDEXATION → SEARCH.
 * Works on SYNTHETIC, reproducible, TEXT-based documents (formats kv / csv / text) — it does NOT claim advanced
 * OCR or external document connectors (honest scope). Every record carries provenance (source id + contentSha +
 * extracted fields). Invalid/incomplete documents are fail-closed with a reason. Dual export.
 */

const crypto = require("crypto");

const FORMATS = Object.freeze(["kv", "csv", "text"]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.length > 0; }
function sha(s: any): string { return crypto.createHash("sha256").update("D " + String(s)).digest("hex"); }

/** ingest(doc) -> { ok, doc } | { ok:false, code, reason }. doc: { id, format, content }. */
function ingest(doc: any): any {
  const d = isObj(doc) ? doc : {};
  if (!isStr(d.id)) return { ok: false, code: "INVALID_DOC", reason: "id required" };
  if (!FORMATS.includes(d.format)) return { ok: false, code: "UNSUPPORTED_FORMAT", reason: `format ∈ ${FORMATS.join(",")}` };
  if (typeof d.content !== "string" || d.content.trim().length === 0) return { ok: false, code: "EMPTY_CONTENT", reason: "content must be non-empty" };
  return { ok: true, doc: Object.freeze({ id: d.id, format: d.format, content: d.content, contentSha: sha(d.content) }) };
}

/** extract(doc) -> { ok, fields } | { ok:false, code }. Format-specific structured extraction. */
function extract(doc: any): any {
  const d = isObj(doc) ? doc : {};
  try {
    if (d.format === "kv") {
      const fields: any = {};
      for (const line of String(d.content).split(/\r?\n/)) {
        const m = line.match(/^\s*([^:]+?)\s*:\s*(.*)$/);
        if (m) fields[m[1].trim()] = m[2].trim();
      }
      if (Object.keys(fields).length === 0) return { ok: false, code: "EXTRACT_EMPTY", reason: "no key:value pairs" };
      return { ok: true, fields };
    }
    if (d.format === "csv") {
      const rows = String(d.content).split(/\r?\n/).filter((r: string) => r.trim().length);
      if (rows.length < 2) return { ok: false, code: "EXTRACT_EMPTY", reason: "csv needs a header + one row" };
      const header = rows[0].split(",").map((s: string) => s.trim());
      const vals = rows[1].split(",").map((s: string) => s.trim());
      const fields: any = {}; header.forEach((h: string, i: number) => { if (h) fields[h] = vals[i] === undefined ? null : vals[i]; });
      return { ok: true, fields };
    }
    return { ok: true, fields: { text: String(d.content) } };
  } catch (e: any) { return { ok: false, code: "EXTRACT_ERROR", reason: String(e && e.message || e) }; }
}

/** structure(fields, schema?) -> { ok, record } | { ok:false, code, missing }. schema: { required:[keys] }. */
function structure(fields: any, schema?: any): any {
  const f = isObj(fields) ? fields : {};
  const required = isObj(schema) && Array.isArray(schema.required) ? schema.required : [];
  const missing = required.filter((k: any) => !(isStr(k) && Object.prototype.hasOwnProperty.call(f, k) && f[k] !== "" && f[k] !== null));
  if (missing.length > 0) return { ok: false, code: "INCOMPLETE", reason: "missing required fields", missing: missing.sort() };
  return { ok: true, record: f };
}

/** processDocument(doc, schema?) -> { ok, record, provenance, trace } | { ok:false, code, stage, trace }. */
function processDocument(doc: any, schema?: any): any {
  const trace: any[] = [];
  const ing = ingest(doc); trace.push({ stage: "ingest", ok: ing.ok });
  if (!ing.ok) return { ok: false, code: ing.code, reason: ing.reason, stage: "ingest", trace };
  const ext = extract(ing.doc); trace.push({ stage: "extract", ok: ext.ok });
  if (!ext.ok) return { ok: false, code: ext.code, reason: ext.reason, stage: "extract", trace };
  const str = structure(ext.fields, schema); trace.push({ stage: "structure", ok: str.ok });
  if (!str.ok) return { ok: false, code: str.code, reason: str.reason, missing: str.missing, stage: "structure", trace };
  trace.push({ stage: "provenance", ok: true });
  return {
    ok: true,
    record: str.record,
    provenance: Object.freeze({ sourceDocId: ing.doc.id, contentSha: ing.doc.contentSha, format: ing.doc.format, extractedFields: Object.keys(str.record).sort() }),
    trace,
  };
}

/** runPipeline(docs, schema?) -> { records, rejected, duplicates, index }. Ingest→structure→dedup→index. */
function runPipeline(docs: any, schema?: any): any {
  const list = Array.isArray(docs) ? docs : [];
  const records: any[] = []; const rejected: any[] = []; const duplicates: any[] = [];
  const seenSha: any = {};
  for (const doc of list) {
    const r = processDocument(doc, schema);
    if (!r.ok) { rejected.push({ id: isObj(doc) ? doc.id : null, code: r.code, stage: r.stage }); continue; }
    const sh = r.provenance.contentSha;
    if (seenSha[sh]) { duplicates.push({ id: r.provenance.sourceDocId, duplicateOf: seenSha[sh] }); continue; }
    seenSha[sh] = r.provenance.sourceDocId;
    records.push(Object.freeze({ id: r.provenance.sourceDocId, record: r.record, provenance: r.provenance }));
  }
  return Object.freeze({ records: Object.freeze(records), rejected: Object.freeze(rejected), duplicates: Object.freeze(duplicates), index: buildIndex(records) });
}

function tokens(v: any): string[] { return String(v).toLowerCase().split(/[^a-z0-9]+/).filter((t: string) => t.length > 0); }
/** buildIndex(records) -> inverted index term -> sorted docIds. */
function buildIndex(records: any): any {
  const idx: any = {};
  for (const r of (Array.isArray(records) ? records : [])) {
    const terms = new Set<string>();
    for (const k of Object.keys(r.record || {})) for (const t of tokens(r.record[k])) terms.add(t);
    for (const t of terms) (idx[t] = idx[t] || new Set()).add(r.id);
  }
  const out: any = {}; for (const t of Object.keys(idx).sort()) out[t] = Array.from(idx[t]).sort();
  return Object.freeze(out);
}
/** search(index, query) -> sorted docIds matching ALL query terms (AND). */
function search(index: any, query: any): string[] {
  const idx = isObj(index) ? index : {};
  const qs = tokens(query);
  if (qs.length === 0) return [];
  let acc: any = null;
  for (const t of qs) {
    const hits = new Set(Array.isArray(idx[t]) ? idx[t] : []);
    acc = acc === null ? hits : new Set([...acc].filter((x) => hits.has(x)));
  }
  return Array.from(acc || []).sort() as string[];
}

const DOCUMENT_PIPELINE_CONTRACT = Object.freeze({
  id: "WI-P11-16-DOCUMENT-PIPELINE",
  source: "P11 Intelligent Document Processing (foundation) — synthetic text documents; no advanced OCR / external connectors claimed",
  formats: FORMATS,
  notAuthority: "pure local pipeline over synthetic text documents; no OCR, no external document source, no network/clock",
  invariants: Object.freeze([
    "pure/deterministic: documents in → records/index out; contentSha is sha256 of content",
    "pipeline: ingest → validate → extract → structure → provenance → dedup → index → search; fail-closed per stage",
    "every record carries provenance (sourceDocId + contentSha + extracted field names)",
    "invalid/incomplete/unsupported documents are rejected with a code (never silently accepted)",
    "dedup is by contentSha; honest scope = text formats kv/csv/text (no OCR claim)",
  ]),
});

module.exports = { FORMATS, DOCUMENT_PIPELINE_CONTRACT, ingest, extract, structure, processDocument, runPipeline, buildIndex, search };

if (require.main === module) {
  process.stdout.write(JSON.stringify(DOCUMENT_PIPELINE_CONTRACT, null, 2) + "\n");
}

export {};
