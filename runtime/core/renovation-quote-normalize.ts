#!/usr/bin/env node
/**
 * renovation-quote-normalize — PRODUCT D8 (building-retrofit intelligence) FIRST VERTICAL: normalize and compare
 * energy-renovation quotes (devis de rénovation énergétique). It (1) maps raw quotes onto a VERSIONED canonical model
 * ("renovation-quote/1"), (2) recomputes line/quote totals with EXACT BigInt integer-minor arithmetic and VERIFIES
 * provided totals against them (fail-closed on mismatch — never silently corrected), and (3) compares comparable quotes
 * by canonical category, refusing a "cheapest" verdict when scopes differ or data is incomplete.
 *
 * HONESTY / fail-closed (mandate): NOTHING is fabricated. Prices are only the client-supplied figures (recomputed &
 * cross-checked exactly in BigInt, never invented). Energy savings, subsidy eligibility (MaPrimeRénov'/CEE) and
 * regulatory compliance are NEVER computed or asserted — declared values pass through labelled "declared, unverified".
 * Any quote with no usable line, an unknown unit, an only-"other" scope, or totals that don't reconcile is marked
 * INCOMPLETE/INCONSISTENT and EXCLUDED from price ranking (missing data must never produce a misleading "cheapest").
 * Composes evidence-provenance for an integrity digest; NO new primitive. Pure/deterministic.
 */
"use strict";

const prov = require("./evidence-provenance.js");

// canonical work categories, as token PHRASES (each phrase = tokens that must ALL be present as whole tokens). Whole-
// token matching (not substring) prevents mis-bucketing: "sol" matches only the token "sol", never "iSOLation"/"SOLaire".
const CATEGORY_PHRASES: Record<string, string[][]> = {
  "insulation-walls": [["isolation", "mur"], ["isolation", "murs"], ["ite"], ["iti"], ["mur"], ["murs"], ["wall"], ["walls"]],
  "insulation-roof": [["isolation", "toiture"], ["isolation", "combles"], ["toiture"], ["combles"], ["comble"], ["toit"], ["roof"]],
  "insulation-floor": [["isolation", "plancher"], ["isolation", "sol"], ["plancher"], ["floor"]],
  windows: [["fenetre"], ["fenetres"], ["menuiserie"], ["menuiseries"], ["vitrage"], ["window"], ["windows"]],
  heating: [["chauffage"], ["pompe", "a", "chaleur"], ["pac"], ["chaudiere"], ["heating"], ["heat", "pump"]],
  ventilation: [["vmc"], ["ventilation"]],
  "domestic-hot-water": [["eau", "chaude"], ["ecs"], ["ballon"], ["dhw"], ["hot", "water"]],
  audit: [["audit"], ["diagnostic"], ["dpe"]],
};
const KNOWN_UNITS = Object.freeze(["m2", "ml", "u", "forfait", "h"]);   // m², linear metre, unit, lump sum, hour
const MAX_MINOR = Number.MAX_SAFE_INTEGER;   // Number ceiling for exported integers; arithmetic itself is BigInt-exact
const MAX_MINOR_BIG = BigInt(MAX_MINOR);
// expose a plain frozen view for callers (kept for API compatibility).
const CATEGORIES = Object.freeze(Object.fromEntries(Object.entries(CATEGORY_PHRASES).map(([k, v]) => [k, v.map((p) => p.join(" "))])));

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isSafeNonNegInt(v: any): boolean { return typeof v === "number" && Number.isSafeInteger(v) && v >= 0; }
function deburr(s: any): string { return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
function tokensOf(s: any): string[] { return deburr(s).split(/[^a-z0-9]+/).filter(Boolean); }
function normUnit(s: any): string { return deburr(s).replace(/²/g, "2").replace(/\s+/g, ""); }

/** classify a raw line label/category into the canonical taxonomy by WHOLE-TOKEN phrase matching; unknown ⇒ "other". */
function classifyCategory(rawCategory: any, rawLabel: any): string {
  const set = new Set([...tokensOf(rawCategory), ...tokensOf(rawLabel)]);
  if (set.size === 0) return "other";
  for (const cat of Object.keys(CATEGORY_PHRASES)) {
    for (const phrase of CATEGORY_PHRASES[cat]) if (phrase.every((t) => set.has(t))) return cat;
  }
  return "other";
}

/** round(aMilli × priceMinor / 1000) EXACTLY in BigInt, half-up for non-negative inputs. */
function mulDivRoundBig(aMilli: number, priceMinor: number, d: bigint, half: bigint): bigint {
  return (BigInt(aMilli) * BigInt(priceMinor) + half) / d;
}

/**
 * normalizeQuote(raw): map one raw quote onto the canonical model and verify its arithmetic (BigInt-exact).
 * raw = { quoteId, contractor?, currency?, source?, declared?, totalHtMinor?, lines:[{ category?, label, quantityMilli,
 *   unit, unitPriceMinor, vatRateBps?, lineTotalMinor }] }   (quantityMilli = quantity × 1000; money in integer minor)
 * Returns a canonical quote with per-line fields + flags[]; `status` ∈ COMPLETE | INCOMPLETE | INCONSISTENT.
 */
function normalizeQuote(raw: any): any {
  if (!isObj(raw) || typeof raw.quoteId !== "string" || !raw.quoteId || !Array.isArray(raw.lines)) {
    return { ok: false, code: "INVALID_INPUT", reason: "quote { quoteId:string, lines:[…] } required" };
  }
  const flags: any[] = [];
  const currency = typeof raw.currency === "string" && raw.currency ? raw.currency : "EUR";
  const lines: any[] = [];
  let totalHtBig = BigInt(0), totalVatBig = BigInt(0), anyIncomplete = false, anyInconsistent = false, completeCount = 0;

  if (raw.lines.length === 0) { flags.push({ ref: "quote", code: "EMPTY", detail: "quote has no lines — cannot be assessed or ranked" }); anyIncomplete = true; }

  raw.lines.forEach((ln: any, i: number) => {
    const ref = `line[${i}]`;
    if (!isObj(ln)) { flags.push({ ref, code: "INCOMPLETE", detail: "line is not an object" }); anyIncomplete = true; return; }
    const unit = normUnit(ln.unit);
    const category = classifyCategory(ln.category, ln.label);
    if (category === "other" && (ln.category || ln.label)) flags.push({ ref, code: "UNCLASSIFIED_CATEGORY", detail: `label "${ln.label || ln.category}" did not match a canonical category ⇒ 'other'` });
    const haveQty = isSafeNonNegInt(ln.quantityMilli), havePrice = isSafeNonNegInt(ln.unitPriceMinor), haveTotal = isSafeNonNegInt(ln.lineTotalMinor);
    const unitKnown = KNOWN_UNITS.includes(unit);
    if (!unitKnown) flags.push({ ref, code: "UNKNOWN_UNIT", detail: `unit "${ln.unit}" not in ${KNOWN_UNITS.join("/")}` });
    if (!haveQty || !havePrice || !haveTotal) {
      flags.push({ ref, code: "INCOMPLETE", detail: "quantityMilli, unitPriceMinor and lineTotalMinor are all required as safe non-negative integers" });
      anyIncomplete = true;
      lines.push({ category, label: ln.label || null, unit: unitKnown ? unit : null, quantityMilli: haveQty ? ln.quantityMilli : null, unitPriceMinor: havePrice ? ln.unitPriceMinor : null, lineTotalMinor: haveTotal ? ln.lineTotalMinor : null, complete: false });
      return;
    }
    const expectedBig = mulDivRoundBig(ln.quantityMilli, ln.unitPriceMinor, BigInt(1000), BigInt(500));   // EXACT quantity×unitPrice (half-up)
    const overflow = expectedBig > MAX_MINOR_BIG;
    if (overflow) flags.push({ ref, code: "OVERFLOW", detail: "computed line total exceeds safe integer range" });
    if (expectedBig !== BigInt(ln.lineTotalMinor)) { flags.push({ ref, code: "LINE_TOTAL_MISMATCH", detail: `provided ${ln.lineTotalMinor} ≠ quantity×unitPrice ${expectedBig.toString()} (minor); not auto-corrected` }); anyInconsistent = true; }
    if (overflow) { anyInconsistent = true; lines.push({ category, label: ln.label || null, unit, quantityMilli: ln.quantityMilli, unitPriceMinor: ln.unitPriceMinor, lineTotalMinor: ln.lineTotalMinor, complete: false }); return; }
    const vatRateBps = isSafeNonNegInt(ln.vatRateBps) ? ln.vatRateBps : null;   // bps of 10000 (e.g. 550 = 5.5%)
    const vatBig = vatRateBps == null ? null : mulDivRoundBig(ln.lineTotalMinor, vatRateBps, BigInt(10000), BigInt(5000));
    totalHtBig += BigInt(ln.lineTotalMinor);
    if (vatBig != null) totalVatBig += vatBig;
    completeCount += 1;
    lines.push({ category, label: ln.label || null, unit, quantityMilli: ln.quantityMilli, unitPriceMinor: ln.unitPriceMinor, lineTotalMinor: ln.lineTotalMinor, vatRateBps, vatMinor: vatBig == null ? null : Number(vatBig), complete: true });
  });

  // sum overflow guard (BigInt sums can exceed safe-integer range even if each line is safe).
  if (totalHtBig > MAX_MINOR_BIG || totalVatBig > MAX_MINOR_BIG) { flags.push({ ref: "quote", code: "OVERFLOW", detail: "aggregate total exceeds safe integer range" }); anyInconsistent = true; }
  const totalHtMinor = totalHtBig > MAX_MINOR_BIG ? null : Number(totalHtBig);
  const totalVatMinor = totalVatBig > MAX_MINOR_BIG ? null : Number(totalVatBig);

  // cross-check provided quote-level total HT if supplied (fail-closed on mismatch).
  if (isSafeNonNegInt(raw.totalHtMinor) && BigInt(raw.totalHtMinor) !== totalHtBig) {
    flags.push({ ref: "quote", code: "QUOTE_TOTAL_MISMATCH", detail: `provided totalHtMinor ${raw.totalHtMinor} ≠ sum of lines ${totalHtBig.toString()}; not auto-corrected` });
    anyInconsistent = true;
  }
  const status = anyInconsistent ? "INCONSISTENT" : (anyIncomplete ? "INCOMPLETE" : "COMPLETE");

  // per-category canonical subtotals (only from complete lines).
  const byCategory: any = {};
  for (const l of lines) if (l.complete) byCategory[l.category] = (byCategory[l.category] || 0) + l.lineTotalMinor;
  const meaningfulCategories = Object.keys(byCategory).filter((c) => c !== "other");
  // comparable ⇒ COMPLETE AND ≥1 complete line AND ≥1 non-"other" category (an only-"other" bundle has no real scope).
  const comparable = status === "COMPLETE" && completeCount > 0 && meaningfulCategories.length > 0;
  if (status === "COMPLETE" && completeCount > 0 && meaningfulCategories.length === 0) flags.push({ ref: "quote", code: "ALL_UNCLASSIFIED", detail: "all lines are 'other' — no comparable category scope" });

  const canonical: any = {
    model: "renovation-quote/1",
    quoteId: raw.quoteId,
    contractor: typeof raw.contractor === "string" ? raw.contractor : null,
    currency,
    source: isObj(raw.source) ? { origin: raw.source.origin || null, receivedAt: raw.source.receivedAt || null, documentRef: raw.source.documentRef || null } : { origin: null, receivedAt: null, documentRef: null },
    lines, byCategory,
    totalHtMinor, totalVatMinor, totalTtcMinor: totalHtMinor == null || totalVatMinor == null ? null : totalHtMinor + totalVatMinor,
    status, flags,
    comparable,
    declared: isObj(raw.declared) ? { note: "declared by the contractor; NOT verified or computed by this tool", values: raw.declared } : null,
    certificationStatus: "NOT_CERTIFIED — normalization/comparison only; no eligibility, energy-saving or compliance verdict is computed",
  };
  canonical.integrityDigest = prov.contentDigest(canonical);
  return { ok: true, quote: canonical };
}

/**
 * compareQuotes(rawQuotes[]): normalize each, then compare ONLY the comparable ones. Returns category coverage, per-quote
 * totals, a cheapest verdict ONLY when ≥2 comparable quotes share the SAME scope (category set), and an explicit
 * notComparable list (with reasons) for excluded quotes. Fail-closed: incomplete/inconsistent/no-scope quotes never rank.
 */
function compareQuotes(rawQuotes: any): any {
  if (!Array.isArray(rawQuotes) || rawQuotes.length === 0) return { ok: false, code: "INVALID_INPUT", reason: "a non-empty array of raw quotes is required" };
  const normalized = rawQuotes.map((q: any) => normalizeQuote(q));
  const bad = normalized.filter((n: any) => !n.ok);
  const good = normalized.filter((n: any) => n.ok).map((n: any) => n.quote);
  const comparable = good.filter((q: any) => q.comparable);
  const notComparable = [
    ...bad.map((b: any) => ({ quoteId: null, reason: `${b.code}: ${b.reason}` })),
    ...good.filter((q: any) => !q.comparable).map((q: any) => ({ quoteId: q.quoteId, status: q.status, reason: q.flags.map((f: any) => f.code).join(",") || "not comparable", flags: q.flags })),
  ];

  // scope = sorted set of categories a comparable quote covers.
  const scopeOf = (q: any) => Object.keys(q.byCategory).sort().join("+");
  const scopes = Array.from(new Set(comparable.map(scopeOf)));
  const sameScope = comparable.length >= 2 && scopes.length === 1;

  let cheapest: any = null, ranking: any[] = [];
  if (sameScope) {
    ranking = comparable.map((q: any) => ({ quoteId: q.quoteId, contractor: q.contractor, totalHtMinor: q.totalHtMinor, totalTtcMinor: q.totalTtcMinor })).sort((a: any, b: any) => a.totalHtMinor - b.totalHtMinor);
    cheapest = { quoteId: ranking[0].quoteId, totalHtMinor: ranking[0].totalHtMinor, basis: "lowest total HT among comparable quotes sharing the same scope" };
  }

  // per-category comparison (available for comparable quotes, even if scopes differ).
  const categories = Array.from(new Set(comparable.flatMap((q: any) => Object.keys(q.byCategory)))).sort();
  const byCategory: any = {};
  for (const c of categories) byCategory[c] = comparable.filter((q: any) => q.byCategory[c] != null).map((q: any) => ({ quoteId: q.quoteId, htMinor: q.byCategory[c] }));

  return {
    ok: true,
    result: {
      model: "renovation-quote-comparison/1",
      comparableCount: comparable.length,
      scopes,
      sameScope,
      cheapest,                    // null unless ≥2 comparable quotes share one scope
      ranking,                     // empty unless sameScope
      byCategory,                  // per-category HT across comparable quotes
      notComparable,               // excluded quotes with reasons (fail-closed)
      verdict: cheapest ? "COMPARED" : (comparable.length >= 2 ? "SCOPE_MISMATCH" : "INSUFFICIENT_COMPARABLE_QUOTES"),
      certificationStatus: "NOT_CERTIFIED — price normalization/comparison only; no eligibility/energy/compliance verdict is computed",
      limitations: [
        "prices are the client-supplied figures (recomputed and cross-checked in exact BigInt); NO price is invented",
        "energy savings, subsidy eligibility (MaPrimeRénov'/CEE) and regulatory compliance are NOT computed or asserted — declared values pass through labelled 'declared, unverified'",
        "incomplete/inconsistent/no-line/only-'other' quotes are EXCLUDED from ranking (never silently corrected or ranked)",
        "a 'cheapest' verdict is emitted ONLY when ≥2 comparable quotes cover the SAME category scope; differing scopes ⇒ SCOPE_MISMATCH (per-category comparison only)",
        "category classification is keyword/whole-token based; an unrecognised label ⇒ 'other' (flagged), and an only-'other' quote is not comparable",
        "normalization/comparison is NOT a certification or a conformity assessment",
      ],
    },
  };
}

export { normalizeQuote, compareQuotes, classifyCategory, CATEGORIES, KNOWN_UNITS };
module.exports = { normalizeQuote, compareQuotes, classifyCategory, CATEGORIES, KNOWN_UNITS };

if (require.main === module) {
  const demo = compareQuotes([
    { quoteId: "A", contractor: "Alpha", lines: [{ label: "Isolation murs ITE", unit: "m2", quantityMilli: 100000, unitPriceMinor: 12000, lineTotalMinor: 1200000, vatRateBps: 550 }] },
    { quoteId: "B", contractor: "Beta", lines: [{ label: "Isolation murs", unit: "m2", quantityMilli: 100000, unitPriceMinor: 11000, lineTotalMinor: 1100000, vatRateBps: 550 }] },
  ]);
  process.stdout.write(JSON.stringify({ verdict: demo.result.verdict, cheapest: demo.result.cheapest, scopes: demo.result.scopes }, null, 2) + "\n");
}
