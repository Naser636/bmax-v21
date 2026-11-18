#!/usr/bin/env node
"use strict";
/* V319 §7 — tests for odg-btp-client-intake (multilingual pre-contractual estimate core). PURE, deterministic. */
const I = require("./odg-btp-client-intake.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

const sourced = (qty: number, sell: number, cost?: number) => ({ ref: "L", label: "Béton C25/30", qty, unit: "m3", sellUnitPriceMinor: sell, costUnitPriceMinor: cost, priceSource: "tarif-fournisseur-2026" });

function main(): void {
  // 1. four mandatory locales resolve
  const fr = I.intakeEstimate({ chantierId: "C1", localeCode: "fr-FR", lineItems: [sourced(10, 12000, 9000)] });
  const ar = I.intakeEstimate({ chantierId: "C1", localeCode: "ar-AE", lineItems: [sourced(10, 12000, 9000)] });
  const en = I.intakeEstimate({ chantierId: "C1", localeCode: "en-GB", lineItems: [sourced(10, 12000, 9000)] });
  const es = I.intakeEstimate({ chantierId: "C1", localeCode: "es-ES", lineItems: [sourced(10, 12000, 9000)] });
  check("FR/AR/EN/ES all resolve ok", fr.ok && ar.ok && en.ok && es.ok);
  check("unsupported locale ⇒ fail-closed", I.intakeEstimate({ chantierId: "C1", localeCode: "zz-ZZ", lineItems: [sourced(1, 1, 1)] }).code === "UNSUPPORTED_LOCALE");

  // 2. Arabic is RTL; French is LTR
  check("ar-AE ⇒ rtl + dir=rtl", ar.locale.rtl === true && ar.locale.dir === "rtl");
  check("fr-FR ⇒ dir=ltr", fr.locale.dir === "ltr");

  // 3. fixed labels differ by language (not left in one language)
  check("labels localized per language (fr≠ar≠en≠es)", fr.labels.estimate !== en.labels.estimate && ar.labels.estimate !== en.labels.estimate && es.labels.estimate !== en.labels.estimate && fr.labels.estimate === "Devis estimatif");

  // 4. complete priced lines ⇒ COMPLETE, selling = Σ qty×sell, finance from the real engine, selling matches budgetRevise
  check("complete ⇒ status COMPLETE + selling = 10×12000 = 120000", fr.estimate.status === "COMPLETE" && fr.estimate.sellingMinor === 120000);
  check("finance comes from chantier-profitability and SELLING matches (budgetReviseMinor === sellingMinor)", !!fr.finance && fr.finance.budgetReviseMinor === 120000);

  // 5. SELLING ≠ COST ≠ NET — distinct fields, not conflated
  check("SELLING≠COST≠NET: selling(120000) ≠ cost(90000); finance keeps separate cost/margin fields", fr.estimate.sellingMinor === 120000 && fr.estimate.costMinor === 90000 && fr.estimate.sellingMinor !== fr.estimate.costMinor && typeof fr.finance.margeBruteConstateeMinor === "number" && fr.finance.margeBruteConstateeMinor !== fr.estimate.sellingMinor);

  // 6. FAIL-CLOSED — missing priceSource ⇒ INCOMPLETE (price present but UNSOURCED is still withheld = no fabricated price)
  const noSrc = I.intakeEstimate({ chantierId: "C1", localeCode: "fr-FR", lineItems: [{ ref: "L", qty: 5, sellUnitPriceMinor: 10000 /* no priceSource */ }] });
  check("missing priceSource ⇒ INCOMPLETE, no total, human-confirm, line.missing=priceSource", noSrc.estimate.status === "INCOMPLETE" && noSrc.estimate.sellingMinor === null && noSrc.finance === null && noSrc.requiresHumanConfirmation === true && noSrc.lines[0].missing === "priceSource");

  // 7. missing price value ⇒ INCOMPLETE line.missing=sellUnitPriceMinor
  const noPrice = I.intakeEstimate({ chantierId: "C1", localeCode: "fr-FR", lineItems: [{ ref: "L", qty: 5, priceSource: "x" }] });
  check("missing price value ⇒ INCOMPLETE, line.missing=sellUnitPriceMinor", noPrice.estimate.status === "INCOMPLETE" && noPrice.lines[0].missing === "sellUnitPriceMinor");

  // 8. a partially-sourced basket ⇒ whole estimate withheld (one bad line taints the total)
  const mixed = I.intakeEstimate({ chantierId: "C1", localeCode: "en-GB", lineItems: [sourced(2, 5000, 4000), { ref: "L2", qty: 3 /* unpriced */ }] });
  check("one unsourced line ⇒ whole estimate INCOMPLETE (withheld)", mixed.estimate.status === "INCOMPLETE" && mixed.estimate.sellingMinor === null);

  // 8b. overflow guard — a caller-sourced but unsafe-integer product is NOT totalled as certain (fail-closed)
  const overflow = I.intakeEstimate({ chantierId: "C1", localeCode: "fr-FR", lineItems: [{ ref: "L", qty: Number.MAX_SAFE_INTEGER, sellUnitPriceMinor: 1000, priceSource: "x" }] });
  check("unsafe-integer product ⇒ INCOMPLETE (overflow withheld, not an imprecise total)", overflow.estimate.status === "INCOMPLETE" && overflow.estimate.sellingMinor === null && overflow.lines[0].missing === "overflow");

  // 9. money display is a non-empty ICU string containing a digit (ICU-version-safe)
  check("localized money display present (ICU)", typeof fr.estimate.sellingDisplay === "string" && /\d/.test(fr.estimate.sellingDisplay) && fr.lines[0].sellingDisplay.length > 0);

  // 10. input guards
  check("no chantierId ⇒ NO_CHANTIER_ID", I.intakeEstimate({ localeCode: "fr-FR", lineItems: [sourced(1, 1, 1)] }).code === "NO_CHANTIER_ID");
  check("no line items ⇒ NO_LINE_ITEMS", I.intakeEstimate({ chantierId: "C1", localeCode: "fr-FR", lineItems: [] }).code === "NO_LINE_ITEMS");

  // 11. always requires human confirmation before commitment (no auto-commit)
  check("requiresHumanConfirmation ALWAYS true (complete AND incomplete)", fr.requiresHumanConfirmation === true && noSrc.requiresHumanConfirmation === true);

  // 12. deterministic + frozen
  const again = I.intakeEstimate({ chantierId: "C1", localeCode: "fr-FR", lineItems: [sourced(10, 12000, 9000)] });
  check("deterministic (same input ⇒ same selling + finance)", again.estimate.sellingMinor === fr.estimate.sellingMinor && again.finance.budgetReviseMinor === fr.finance.budgetReviseMinor);
  check("frozen output", Object.isFrozen(fr) && Object.isFrozen(fr.estimate) && Object.isFrozen(fr.lines));

  // 13. contract invariants present
  check("contract: reuses existing engines, fail-closed, SELLING≠COST≠NET, human-confirm", I.BTP_CLIENT_INTAKE_CONTRACT.invariants.some((s: string) => /FAIL-CLOSED/.test(s)) && I.BTP_CLIENT_INTAKE_CONTRACT.invariants.some((s: string) => /SELLING ≠ COST ≠ NET/.test(s)) && I.BTP_CLIENT_INTAKE_CONTRACT.reuses.length === 2);

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-btp-client-intake (§7: FR/AR-RTL/EN/ES locales; fail-closed on unsourced prices [no fabricated price]; SELLING≠COST≠NET via chantier-profitability; human-confirm always; deterministic, composes existing engines)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
