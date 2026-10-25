// INGEST — step 2/3 of the product journey: validate formats + required fields + consistency, normalise values,
// and preserve provenance. FAIL-CLOSED: a hard schema error (missing required field, non-numeric amount, unparseable
// date) returns ok:false with explicit errors — the pipeline MUST NOT proceed to reconciliation on bad input.
// €0, pure, deterministic. Uses the extraction adapter so any input format can feed the same validated shape.
import { getExtractor } from './extract-adapter.mjs';
import { parseAmount, normalizeDate } from './normalize.mjs';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const SCHEMA = { required: ['ref', 'date', 'amount'], numeric: ['amount'], dateFields: ['date'] };

// normalizeAmounts/normalizeDates are OPT-IN (default OFF so the proven default pipeline is byte-for-byte unchanged).
// When ON, amounts route through parseAmount (EU/US separators, currency, parentheses-negatives) and ambiguous
// amounts/dates become WARNINGS (flagged for review) — never silently guessed into a hard error.
export function ingest(path, { kind = 'csv', schema = SCHEMA, fileLabel, normalizeAmounts = false, normalizeDates = false } = {}) {
  const errors = [], warnings = [];
  let raw;
  try { raw = getExtractor(kind).extract(path, { fileLabel }); }
  catch (e) { return { ok: false, rows: [], errors: [String(e.message)], warnings, provenance: { kind, path } }; }

  const rows = [];
  raw.forEach((r, idx) => {
    const where = r._src ? JSON.stringify(r._src) : `#${idx + 1}`;
    for (const f of schema.required) if (r[f] === undefined || r[f] === '') errors.push(`${where}: missing required field "${f}"`);
    const o = { ...r };
    for (const f of schema.numeric) {
      if (r[f] === undefined) continue;
      if (normalizeAmounts) {
        const p = parseAmount(r[f]);
        if (p.value === null) errors.push(`${where}: field "${f}" not numeric ("${r[f]}")`);
        else { o[f] = p.value; if (p.ambiguous) warnings.push(`${where}: ${p.note}`); }
      } else {
        const n = Number(r[f]);
        if (Number.isNaN(n)) errors.push(`${where}: field "${f}" not numeric ("${r[f]}")`);
        else o[f] = n;
      }
    }
    for (const f of schema.dateFields || []) {
      if (r[f] === undefined) continue;
      if (normalizeDates) {
        const d = normalizeDate(r[f]);
        if (d.iso) { o[f] = d.iso; if (d.ambiguous) warnings.push(`${where}: ${d.note}`); }
        else warnings.push(`${where}: ${d.note} ("${r[f]}")`);
      } else if (!ISO.test(r[f])) warnings.push(`${where}: date "${r[f]}" not ISO yyyy-mm-dd`);
    }
    rows.push(o);
  });

  // consistency checks (non-fatal): duplicate (ref,amount,date) within one source
  const seen = new Map();
  for (const r of rows) { const k = `${r.ref}|${r.amount}|${r.date}`; if (seen.has(k)) warnings.push(`duplicate line in source: ${k}`); else seen.set(k, 1); }

  const ok = errors.length === 0;
  return {
    ok, kind, rowCount: rows.length, rows: ok ? rows : [],
    errors, warnings,
    provenance: { kind, fileLabel: fileLabel || path.split('/').pop(), ingestedRows: rows.length, deterministic: getExtractor(kind).deterministic },
  };
}
