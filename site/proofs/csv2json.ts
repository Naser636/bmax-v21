/* Freelance micro-deliverable prototype (ODG capability test): RFC-4180-ish CSV → JSON.
 * Pure, dependency-free, typed. Handles quoted fields, embedded commas/quotes/newlines, CRLF, BOM. */
export type Row = Record<string, string>;

export function parseCsv(input: string, opts: { delimiter?: string } = {}): Row[] {
  const delim = opts.delimiter ?? ",";
  let s = input.replace(/^﻿/, ""); // strip BOM
  const records: string[][] = [];
  let field = "";
  let row: string[] = [];
  let i = 0;
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { pushField(); records.push(row); row = []; };
  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue; } // escaped quote
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === delim) { pushField(); i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { pushRow(); i++; continue; }
    field += c; i++;
  }
  // flush last field/row unless the input ended exactly on a newline with nothing pending
  if (field.length > 0 || row.length > 0) pushRow();
  if (records.length === 0) return [];
  const header = records[0];
  return records.slice(1).map((r) => {
    const o: Row = {};
    header.forEach((h, idx) => { o[h] = r[idx] ?? ""; });
    return o;
  });
}
