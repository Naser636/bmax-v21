#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves PRODUCT D8 FIRST VERTICAL: renovation-quote normalization + comparison onto a
// versioned canonical model, with EXACT integer-minor arithmetic, provenance, and fail-closed missing/inconsistent data.
// Synthetic fixtures only (illustrative integers — no real or fabricated prices). Proves: provided totals are VERIFIED
// not invented; incomplete/inconsistent quotes are EXCLUDED from ranking; 'cheapest' only when scopes match; no energy
// saving / eligibility / compliance is ever computed; always NOT_CERTIFIED.
"use strict";
const assert = require("assert");
const Q = require("./renovation-quote-normalize.js");
const prov = require("./evidence-provenance.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const line = (o) => Object.assign({ unit: "m2", quantityMilli: 100000, unitPriceMinor: 12000, lineTotalMinor: 1200000, vatRateBps: 550 }, o);

// (1) COMPLETE quote: totals recomputed, VAT computed, canonical model + integrity digest.
{
  const r = Q.normalizeQuote({ quoteId: "A", contractor: "Alpha", lines: [line({ label: "Isolation murs ITE" })] });
  const q = r.quote;
  ok("COMPLETE quote: status COMPLETE, totalHt=sum, vat 5.5% computed, versioned model + digest",
     q.status === "COMPLETE" && q.comparable === true && q.totalHtMinor === 1200000 && q.totalVatMinor === 66000 && q.totalTtcMinor === 1266000 && q.model === "renovation-quote/1" && typeof q.integrityDigest === "string" && q.lines[0].category === "insulation-walls");
}
// (2) LINE_TOTAL_MISMATCH: provided total ≠ quantity×unitPrice ⇒ INCONSISTENT, NOT auto-corrected.
{
  const r = Q.normalizeQuote({ quoteId: "A", lines: [line({ lineTotalMinor: 999999 })] });
  ok("line total ≠ quantity×unitPrice ⇒ INCONSISTENT + LINE_TOTAL_MISMATCH flag (not corrected)",
     r.quote.status === "INCONSISTENT" && r.quote.comparable === false && r.quote.flags.some((f) => f.code === "LINE_TOTAL_MISMATCH"));
}
// (3) INCOMPLETE: missing unitPriceMinor ⇒ INCOMPLETE, line not complete, not comparable.
{
  const r = Q.normalizeQuote({ quoteId: "A", lines: [line({ unitPriceMinor: undefined })] });
  ok("missing unitPriceMinor ⇒ INCOMPLETE (fail-closed, line.complete=false, comparable=false)",
     r.quote.status === "INCOMPLETE" && r.quote.comparable === false && r.quote.lines[0].complete === false && r.quote.flags.some((f) => f.code === "INCOMPLETE"));
}
// (4) UNKNOWN_UNIT flagged.
{
  const r = Q.normalizeQuote({ quoteId: "A", lines: [line({ unit: "sqft" })] });
  ok("unknown unit ⇒ UNKNOWN_UNIT flag", r.quote.flags.some((f) => f.code === "UNKNOWN_UNIT"));
}
// (5) UNCLASSIFIED_CATEGORY ⇒ 'other', flagged (never dropped).
{
  const r = Q.normalizeQuote({ quoteId: "A", lines: [line({ label: "prestation diverse xyz" })] });
  ok("unrecognised label ⇒ category 'other' + UNCLASSIFIED_CATEGORY flag (line kept)",
     r.quote.lines[0].category === "other" && r.quote.flags.some((f) => f.code === "UNCLASSIFIED_CATEGORY"));
}
// (6) QUOTE_TOTAL_MISMATCH: provided quote total ≠ sum ⇒ INCONSISTENT.
{
  const r = Q.normalizeQuote({ quoteId: "A", totalHtMinor: 5, lines: [line({ label: "Isolation murs" })] });
  ok("provided quote total ≠ sum of lines ⇒ INCONSISTENT + QUOTE_TOTAL_MISMATCH", r.quote.status === "INCONSISTENT" && r.quote.flags.some((f) => f.code === "QUOTE_TOTAL_MISMATCH"));
}
// (7) compareQuotes same scope ⇒ COMPARED, cheapest = lowest HT.
{
  const r = Q.compareQuotes([
    { quoteId: "A", contractor: "Alpha", lines: [line({ label: "Isolation murs", lineTotalMinor: 1200000 })] },
    { quoteId: "B", contractor: "Beta", lines: [line({ label: "Isolation murs", unitPriceMinor: 11000, lineTotalMinor: 1100000 })] },
  ]);
  ok("two comparable same-scope quotes ⇒ COMPARED, cheapest = B (lowest HT)",
     r.result.verdict === "COMPARED" && r.result.cheapest.quoteId === "B" && r.result.ranking[0].quoteId === "B" && r.result.ranking.length === 2);
}
// (8) scope mismatch ⇒ SCOPE_MISMATCH, no cheapest (fail-closed — won't rank across different scopes).
{
  const r = Q.compareQuotes([
    { quoteId: "A", lines: [line({ label: "Isolation murs" })] },
    { quoteId: "C", lines: [line({ label: "Pompe a chaleur", unitPriceMinor: 900000, lineTotalMinor: 90000000 })] },
  ]);
  ok("differing scopes ⇒ SCOPE_MISMATCH, cheapest null (no cross-scope ranking)", r.result.verdict === "SCOPE_MISMATCH" && r.result.cheapest === null);
}
// (9) an INCOMPLETE quote is EXCLUDED from ranking (fail-closed) — leaves <2 comparable ⇒ INSUFFICIENT.
{
  const r = Q.compareQuotes([
    { quoteId: "A", lines: [line({ label: "Isolation murs" })] },
    { quoteId: "BAD", lines: [line({ label: "Isolation murs", unitPriceMinor: undefined })] },   // incomplete
  ]);
  ok("incomplete quote excluded from ranking ⇒ INSUFFICIENT_COMPARABLE_QUOTES, listed in notComparable",
     r.result.verdict === "INSUFFICIENT_COMPARABLE_QUOTES" && r.result.cheapest === null && r.result.notComparable.some((n) => n.quoteId === "BAD"));
}
// (10) declared values pass through labelled, NEVER computed; result carries no eligibility/energy field.
{
  const r = Q.normalizeQuote({ quoteId: "A", declared: { maPrimeRenovEligible: true, estimatedKwhSaved: 5000 }, lines: [line({ label: "Isolation murs" })] });
  const res = Q.compareQuotes([{ quoteId: "A", lines: [line({ label: "Isolation murs" })] }, { quoteId: "B", lines: [line({ label: "Isolation murs", unitPriceMinor: 11000, lineTotalMinor: 1100000 })] }]).result;
  // structural: declared stays labelled+unverified; the comparison verdict is price-only (cheapest keys are quoteId/totalHtMinor/basis) with NO computed eligibility/energy field.
  // meaningful: declared stays labelled+unverified; the comparison verdict carries ONLY price fields (quoteId/total/basis)
  // and the result keys contain no eligibility/energy/saving key at all (would be fabrication if present).
  const hasFabricatedKey = JSON.stringify(Object.keys(res)).match(/eligib|energy|saving|kwh|prime|subsid/i);
  ok("declared subsidy/energy pass through labelled 'not verified'; comparison verdict is price-only (no fabricated eligibility/energy key)",
     r.quote.declared && /NOT verified or computed/.test(r.quote.declared.note) && r.quote.declared.values.maPrimeRenovEligible === true && r.quote.declared.values.estimatedKwhSaved === 5000
     && Object.keys(res.cheapest).sort().join(",") === "basis,quoteId,totalHtMinor" && !hasFabricatedKey);
}
// (11) fail-closed input.
{
  ok("empty array ⇒ INVALID_INPUT", Q.compareQuotes([]).code === "INVALID_INPUT" && Q.normalizeQuote({}).code === "INVALID_INPUT");
}
// (12) integrity digest tamper-detect.
{
  const q = Q.normalizeQuote({ quoteId: "A", lines: [line({ label: "Isolation murs" })] }).quote;
  const copy = { ...q }; delete copy.integrityDigest;
  const tampered = { ...q, totalHtMinor: 1 };
  const tcopy = { ...tampered }; delete tcopy.integrityDigest;
  ok("integrity digest recomputes to match, and a mutated quote no longer matches",
     prov.contentDigest(copy) === q.integrityDigest && prov.contentDigest(tcopy) !== q.integrityDigest);
}
// (13) always NOT_CERTIFIED.
{
  const q = Q.normalizeQuote({ quoteId: "A", lines: [line({ label: "Isolation murs" })] }).quote;
  ok("certificationStatus NOT_CERTIFIED (normalization/comparison ≠ eligibility/compliance verdict)", /NOT_CERTIFIED/.test(q.certificationStatus));
}

// (14) AUDIT D1: whole-token classification — substring false-positives are gone.
{
  const n = (label) => Q.normalizeQuote({ quoteId: "x", lines: [line({ label })] }).quote.lines[0].category;
  ok("whole-token classify: 'Isolation' bare, 'panneau solaire', 'espace vert' ⇒ 'other' (no substring mis-bucket)",
     n("Isolation") === "other" && n("panneau solaire") === "other" && n("espace vert") === "other" && n("Isolation murs ITE") === "insulation-walls" && n("Pompe à chaleur") === "heating");
}
// (15) AUDIT D2: a zero-line quote is INCOMPLETE and NEVER ranked (no €0 'cheapest').
{
  const single = Q.normalizeQuote({ quoteId: "E", lines: [] }).quote;
  const cmp = Q.compareQuotes([{ quoteId: "E1", lines: [] }, { quoteId: "E2", lines: [] }]).result;
  ok("zero-line quote ⇒ INCOMPLETE, not comparable, NEVER a €0 cheapest (fail-closed)",
     single.status === "INCOMPLETE" && single.comparable === false && single.flags.some((f) => f.code === "EMPTY") && cmp.cheapest === null && cmp.verdict === "INSUFFICIENT_COMPARABLE_QUOTES");
}
// (16) AUDIT D3: EXACT BigInt arithmetic near 2^53 — the CORRECT total passes, a WRONG one is flagged (not masked).
{
  const qm = 34693, up = 108167404585738;   // product > 2^53 (float would misround)
  // exact quantity×unitPrice/1000 (half-up) computed in BigInt reference:
  const exact = Number((BigInt(qm) * BigInt(up) + 500n) / 1000n);
  const good = Q.normalizeQuote({ quoteId: "big", lines: [{ label: "Isolation murs", unit: "forfait", quantityMilli: qm, unitPriceMinor: up, lineTotalMinor: exact }] }).quote;
  const bad = Q.normalizeQuote({ quoteId: "big", lines: [{ label: "Isolation murs", unit: "forfait", quantityMilli: qm, unitPriceMinor: up, lineTotalMinor: exact + 1 }] }).quote;
  ok("BigInt-exact: correct near-2^53 total not flagged; wrong total ⇒ LINE_TOTAL_MISMATCH (not silently accepted)",
     !good.flags.some((f) => f.code === "LINE_TOTAL_MISMATCH") && bad.flags.some((f) => f.code === "LINE_TOTAL_MISMATCH") && bad.status === "INCONSISTENT");
}
// (17) AUDIT LOW: an only-'other' quote is NOT comparable (unclassified bundles don't rank against each other).
{
  const cmp = Q.compareQuotes([
    { quoteId: "O1", lines: [line({ label: "prestation diverse" })] },
    { quoteId: "O2", lines: [line({ label: "divers travaux", unitPriceMinor: 11000, lineTotalMinor: 1100000 })] },
  ]).result;
  ok("two only-'other' quotes ⇒ not comparable ⇒ INSUFFICIENT_COMPARABLE_QUOTES (no cheapest)",
     cmp.verdict === "INSUFFICIENT_COMPARABLE_QUOTES" && cmp.cheapest === null && cmp.comparableCount === 0);
}

console.log(`\nRENOVATION-QUOTE-NORMALIZE suite — ${pass} assertions passed. (canonical model v1; exact integer-minor totals VERIFIED not invented; INCOMPLETE/INCONSISTENT excluded from ranking; cheapest only on matching scope; no energy/eligibility/compliance computed; NOT_CERTIFIED)`);
