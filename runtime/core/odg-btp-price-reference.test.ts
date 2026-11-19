#!/usr/bin/env node
"use strict";
/*
 * Tests for odg-btp-price-reference (supplier/price reference catalog, D06). PURE.
 * Proves the FULL loop against real modules: catalog → priceLineItems → odg-btp-supplier-commitment.buildCommitment (DRAFT)
 * → chantier-profitability.computeChantier (engagements). No mocks.
 */
const P = require("./odg-btp-price-reference.js");
const SC = require("./odg-btp-supplier-commitment.js");
const CH = require("./chantier-profitability.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function entries(): any[] { return [
  { itemRef: "CIM-42.5", label: "Ciment CEM II 42.5", unit: "sac", supplier: "MatPro", unitPriceMinor: 650, priceSource: "devis MatPro #F-12", validFrom: "2026-01-01", validUntil: "2026-12-31" },
  { itemRef: "CIM-42.5", label: "Ciment CEM II 42.5", unit: "sac", supplier: "BTP-Dist", unitPriceMinor: 700, priceSource: "tarif BTP-Dist 2026", validFrom: "2026-01-01" },
  { itemRef: "SABLE-0/4", label: "Sable 0/4", unit: "m3", supplier: "MatPro", unitPriceMinor: 3500, priceSource: "devis MatPro #F-12", validFrom: "2026-01-01", validUntil: "2026-06-30" }, // expires mid-year
]; }

function main(): void {
  // --- build catalog: valid entries accepted, provenance-less rejected ---
  const cat = P.buildCatalog(entries(), { currency: "EUR" });
  check("catalog builds, 3 entries accepted", cat.ok === true && cat.entries.length === 3 && cat.rejected.length === 0);
  const withBad = P.buildCatalog([...entries(), { itemRef: "X", unit: "u", supplier: "S", unitPriceMinor: 100, validFrom: "2026-01-01" /* no priceSource */ }], {});
  check("entry without priceSource is REJECTED (never stored)", withBad.entries.length === 3 && withBad.rejected.some((r: any) => /provenance/.test(r.reason)));
  check("entry with validUntil<validFrom rejected", P.buildCatalog([{ itemRef: "Y", unit: "u", supplier: "S", unitPriceMinor: 1, priceSource: "s", validFrom: "2026-06-01", validUntil: "2026-01-01" }], {}).rejected.length === 1);
  check("foreign currency rejected (no implicit FX)", P.buildCatalog([{ itemRef: "Z", unit: "u", supplier: "S", unitPriceMinor: 1, priceSource: "s", validFrom: "2026-01-01", currency: "USD" }], { currency: "EUR" }).rejected.length === 1);
  check("empty ⇒ NO_ENTRIES", P.buildCatalog([], {}).code === "NO_ENTRIES");

  // --- lookup: cheapest-first candidates + non-binding suggestion ---
  const lk = P.lookup(cat, { itemRef: "CIM-42.5", asOfDate: "2026-03-15" });
  check("lookup CIM-42.5 ⇒ 2 candidates, cheapest MatPro@650", lk.found === true && lk.candidates.length === 2 && lk.cheapest.supplier === "MatPro" && lk.cheapest.unitPriceMinor === 650);
  check("suggestion flagged NON-binding (REFERENCE ≠ ENGAGEMENT)", lk.suggestion.binding === false);
  check("supplier filter narrows candidates", P.lookup(cat, { itemRef: "CIM-42.5", asOfDate: "2026-03-15", supplier: "BTP-Dist" }).candidates.length === 1);

  // --- validity window: a price out of window is NO_REFERENCE, never stale ---
  check("SABLE valid in March", P.lookup(cat, { itemRef: "SABLE-0/4", asOfDate: "2026-03-15" }).found === true);
  check("SABLE after expiry (Aug) ⇒ NO_REFERENCE (fail-closed, not stale)", P.lookup(cat, { itemRef: "SABLE-0/4", asOfDate: "2026-08-15" }).code === "NO_REFERENCE");
  check("unknown item ⇒ NO_REFERENCE", P.lookup(cat, { itemRef: "NOPE", asOfDate: "2026-03-15" }).code === "NO_REFERENCE");
  check("bad asOfDate ⇒ BAD_ASOF_DATE", P.lookup(cat, { itemRef: "CIM-42.5", asOfDate: "15/03/2026" }).code === "BAD_ASOF_DATE");

  // --- priceLineItems: resolve to sourced lines (cheapest), unresolved flagged ---
  const pl = P.priceLineItems(cat, [{ ref: "A", itemRef: "CIM-42.5", qty: 100 }, { ref: "B", itemRef: "SABLE-0/4", qty: 10 }, { ref: "C", itemRef: "NOPE", qty: 5 }], "2026-03-15", {});
  check("priced 2 lines (cheapest), 1 unresolved (no reference)", pl.lineItems.length === 2 && pl.unresolved.length === 1 && pl.unresolved[0].itemRef === "NOPE");
  check("each priced line carries unitPriceMinor + priceSource (provenance)", pl.lineItems.every((l: any) => Number.isSafeInteger(l.unitPriceMinor) && typeof l.priceSource === "string"));
  check("cheapest selected for CIM (MatPro 650, not BTP-Dist 700)", pl.lineItems.find((l: any) => l.ref === "A").unitPriceMinor === 650);
  const plPref = P.priceLineItems(cat, [{ ref: "A", itemRef: "CIM-42.5", qty: 100 }], "2026-03-15", { preferSupplier: "BTP-Dist" });
  check("preferSupplier routes to BTP-Dist @700", plPref.lineItems[0].unitPriceMinor === 700 && plPref.lineItems[0].supplier === "BTP-Dist");

  // --- FULL LOOP: priced lines feed buildCommitment ⇒ DRAFT; unpriced ⇒ NOT_ENGAGEABLE ---
  const commit = SC.buildCommitment({ id: "BC-1", chantierId: "CH-9", kind: "PURCHASE_ORDER", supplier: "MatPro", lineItems: pl.lineItems });
  check("sourced lines ⇒ commitment DRAFT, gross = 100*650 + 10*3500 = 100000", commit.status === "DRAFT" && commit.grossMinor === 100000);
  const feed = SC.toChantierCommitment(commit);
  const chant = CH.computeChantier({ id: "CH-9", commitments: [feed.commitment], expenses: [], clientInvoices: [] });
  check("full loop reaches canonical engine: engagementsNonFacturesMinor === 100000", chant.ok === true && chant.finance.engagementsNonFacturesMinor === 100000);
  // a request including an unresolved item ⇒ if those lines were passed raw, commitment is NOT_ENGAGEABLE (fail-closed)
  const withUnpriced = SC.buildCommitment({ id: "BC-2", chantierId: "CH-9", kind: "PURCHASE_ORDER", supplier: "MatPro", lineItems: [...pl.lineItems, { ref: "C", qty: 5 /* no sourced price */ }] });
  check("mixing an unsourced line ⇒ commitment NOT_ENGAGEABLE (price never invented)", withUnpriced.status === "NOT_ENGAGEABLE");

  // --- frozen + determinism + contract ---
  check("frozen output", Object.isFrozen(cat) && Object.isFrozen(cat.entries) && Object.isFrozen(lk) && Object.isFrozen(pl));
  check("deterministic", JSON.stringify(P.lookup(cat, { itemRef: "CIM-42.5", asOfDate: "2026-03-15" })) === JSON.stringify(lk));
  check("contract: provenance mandatory, reference≠engagement, no stale price, feeds commitment",
    P.PRICE_REFERENCE_CONTRACT.invariants.some((s: string) => /MANDATORY priceSource/.test(s)) &&
    P.PRICE_REFERENCE_CONTRACT.invariants.some((s: string) => /REFERENCE ≠ ENGAGEMENT/.test(s)) &&
    P.PRICE_REFERENCE_CONTRACT.invariants.some((s: string) => /excludes STALE/.test(s)) &&
    P.PRICE_REFERENCE_CONTRACT.invariants.some((s: string) => /feeds the commitment/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-btp-price-reference (D06 supplier/price reference catalog; provenance mandatory or REJECTED; validity-window excludes stale ⇒ NO_REFERENCE; cheapest=non-binding suggestion; REFERENCE≠ENGAGEMENT; FULL LOOP catalog→priceLineItems→buildCommitment DRAFT→computeChantier verified against real modules; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
