// DOMAIN-C normalize — deterministic amount / currency / date normalisation with HONEST AMBIGUITY detection.
// Reconciliation fails silently when "1,200" means 1200 to one system and 1.200 to another, or when 01/02/2026 is
// read as Jan-2 vs Feb-1. This module normalises what it can and FLAGS what is genuinely ambiguous for human review
// rather than guessing silently. Pure, deterministic, €0. Serves §C: montants/devises/dates/correspondances ambiguës.

const CURRENCY = { '€': 'EUR', '$': 'USD', '£': 'GBP', '¥': 'JPY' };

// parseAmount("1.200,50") -> {value, currency, negative, ambiguous, note}. Never throws on a numeric-ish string;
// returns ambiguous:true (not a silent guess) when the decimal/thousands separator cannot be resolved with certainty.
export function parseAmount(raw) {
  const s0 = String(raw ?? '').trim();
  let currency = null;
  for (const [sym, code] of Object.entries(CURRENCY)) if (s0.includes(sym)) currency = code;
  const m = s0.match(/[A-Z]{3}/); if (!currency && m) currency = m[0];
  // parentheses = accounting negative
  const negative = /^\(.*\)$/.test(s0.replace(/\s/g, '')) || s0.trim().startsWith('-');
  let s = s0.replace(/[()\s]/g, '').replace(/[€$£¥]/g, '').replace(/[A-Za-z]/g, '').replace(/^-/, '');
  if (s === '' || !/[0-9]/.test(s)) return { value: null, currency, negative: false, ambiguous: false, note: 'NOT_NUMERIC', raw: s0 };

  const hasComma = s.includes(','), hasDot = s.includes('.');
  let ambiguous = false, note = 'ok';
  let normalized;
  if (hasComma && hasDot) {
    // the separator that appears LAST is the decimal separator; the other groups thousands.
    const decSep = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
    const thouSep = decSep === ',' ? '.' : ',';
    normalized = s.split(thouSep).join('').replace(decSep, '.');
  } else if (hasComma || hasDot) {
    const sep = hasComma ? ',' : '.';
    const after = s.slice(s.lastIndexOf(sep) + 1);
    const before = s.slice(0, s.lastIndexOf(sep));
    const multiple = (s.split(sep).length - 1) > 1;
    if (multiple) { normalized = s.split(sep).join(''); note = 'grouped-thousands'; } // 1.234.567 -> thousands
    else if (after.length === 3 && before.length >= 1) { normalized = s.split(sep).join(''); ambiguous = true; note = `AMBIGUOUS: "${s}" read as thousands (${before}${after}); could be decimal`; }
    else { normalized = s.replace(sep, '.'); } // 1,20 / 1.5 -> decimal
  } else normalized = s;

  const value = Number(normalized);
  if (Number.isNaN(value)) return { value: null, currency, negative, ambiguous: false, note: 'UNPARSEABLE', raw: s0 };
  return { value: negative ? -value : value, currency, negative, ambiguous, note, raw: s0 };
}

const PASS_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
// normalizeDate -> {iso, ambiguous, note}. dd/mm vs mm/dd is flagged ambiguous when BOTH parts are <=12.
export function normalizeDate(raw) {
  const s = String(raw ?? '').trim();
  if (PASS_ISO.test(s)) return { iso: s, ambiguous: false, note: 'iso' };
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!m) return { iso: null, ambiguous: false, note: 'UNRECOGNISED_DATE' };
  const a = +m[1], b = +m[2], y = +m[3];
  if (a > 12 && b <= 12) return { iso: `${y}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`, ambiguous: false, note: 'dd/mm' };
  if (b > 12 && a <= 12) return { iso: `${y}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`, ambiguous: false, note: 'mm/dd' };
  // both <=12: genuinely ambiguous — do NOT guess; flag for review (default to dd/mm with the flag set).
  return { iso: `${y}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`, ambiguous: true, note: `AMBIGUOUS d/m vs m/d for "${s}"` };
}
