// EXTRACTION ADAPTER — pluggable extractors that turn an input file into normalised row records with provenance.
// DETERMINISTIC extractors (csv, text-fixed) are fully implemented + free. The pdf/ocr/llm extractors are an
// HONEST INTERFACE: they throw NOT_IMPLEMENTED with a cost estimate (no purchase, no fake output) and ship a
// SUBSTITUTE so the pipeline/tests can exercise the contract without a paid service. €0, no network.
import { readFileSync, existsSync } from 'node:fs';

export class NotImplementedExtractor extends Error { constructor(kind, est) { super(`EXTRACTOR_NOT_IMPLEMENTED: ${kind}`); this.kind = kind; this.costEstimate = est; } }

// shared: parse a delimited file into rows, stamping provenance {file,line}
function parseDelimited(path, delim, fileLabel) {
  if (!existsSync(path)) throw new Error('INPUT_MISSING: ' + path);
  const lines = readFileSync(path, 'utf8').trim().split('\n');
  if (lines.length < 2) throw new Error('INPUT_EMPTY: ' + path);
  const cols = lines[0].split(delim).map(c => c.trim());
  return lines.slice(1).map((l, i) => {
    const v = l.split(delim);
    if (v.length !== cols.length) throw new Error(`INPUT_MALFORMED: ${path} row ${i + 2} has ${v.length} fields, expected ${cols.length}`);
    const o = Object.fromEntries(cols.map((c, j) => [c, (v[j] ?? '').trim()]));
    o._src = { file: fileLabel || path.split('/').pop(), line: i + 2 };
    return o;
  });
}

// DETERMINISTIC: CSV / TSV
export const csvExtractor = { kind: 'csv', deterministic: true, extract: (path, { fileLabel } = {}) => parseDelimited(path, ',', fileLabel) };
export const tsvExtractor = { kind: 'tsv', deterministic: true, extract: (path, { fileLabel } = {}) => parseDelimited(path, '\t', fileLabel) };

// DETERMINISTIC: simple fixed "key: value" invoice text blocks separated by a blank line (no OCR needed).
export const textFixedExtractor = {
  kind: 'text-fixed', deterministic: true,
  extract: (path, { fileLabel } = {}) => {
    if (!existsSync(path)) throw new Error('INPUT_MISSING: ' + path);
    const blocks = readFileSync(path, 'utf8').trim().split(/\n\s*\n/);
    return blocks.map((blk, i) => {
      const o = { _src: { file: fileLabel || path.split('/').pop(), block: i + 1 } };
      for (const line of blk.split('\n')) { const m = line.match(/^\s*([A-Za-z_]+)\s*:\s*(.+?)\s*$/); if (m) o[m[1].toLowerCase()] = m[2]; }
      return o;
    });
  },
};

// HONEST INTERFACE (NOT IMPLEMENTED): LLM/OCR extraction of unstructured PDFs/scans. Throws with a cost estimate.
// A SUBSTITUTE extractor is provided for tests/demo so the pipeline contract is exercised without any paid service.
const costEst = (kind) => ({ kind, basis: 'no provider purchased', estPerPageEUR: kind === 'ocr' ? '0.001-0.01 (OCR)' : '0.002-0.02 (LLM vision)', note: 'build + verify under a SEPARATE paid authorization before claiming this works' });
export const pdfLlmExtractor = { kind: 'pdf-llm', deterministic: false, extract: () => { throw new NotImplementedExtractor('pdf-llm', costEst('llm')); } };
export const ocrExtractor = { kind: 'ocr', deterministic: false, extract: () => { throw new NotImplementedExtractor('ocr', costEst('ocr')); } };
// substitute: lets tests/demo run the contract deterministically (clearly labelled synthetic, NOT a real extractor)
export function makeSubstituteExtractor(rows) { return { kind: 'substitute(synthetic)', deterministic: true, substitute: true, extract: () => rows.map((r, i) => ({ ...r, _src: { file: 'SUBSTITUTE', row: i + 1 } })) }; }

const REGISTRY = { csv: csvExtractor, tsv: tsvExtractor, 'text-fixed': textFixedExtractor, 'pdf-llm': pdfLlmExtractor, ocr: ocrExtractor };
export function getExtractor(kind) { const e = REGISTRY[kind]; if (!e) throw new Error('UNKNOWN_EXTRACTOR: ' + kind + ' (have ' + Object.keys(REGISTRY).join(',') + ')'); return e; }
export function listExtractors() { return Object.values(REGISTRY).map(e => ({ kind: e.kind, deterministic: e.deterministic, status: e.deterministic ? 'IMPLEMENTED' : 'NOT_IMPLEMENTED (interface + cost estimate)' })); }
