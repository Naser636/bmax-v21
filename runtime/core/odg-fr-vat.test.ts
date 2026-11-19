#!/usr/bin/env node
"use strict";
/* Tests for odg-fr-vat (French TVA computation + autoliquidation). PURE. Integer minor-unit, hand-verified. */
const V = require("./odg-fr-vat.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  // computeVat at the FR BTP rates (net 1000.00€ = 100000 centimes)
  check("20% of 100000 ⇒ vat 20000, gross 120000", (() => { const r = V.computeVat(100000, 2000); return r.vatMinor === 20000 && r.grossMinor === 120000; })());
  check("10% ⇒ vat 10000, gross 110000", V.computeVat(100000, 1000).vatMinor === 10000);
  check("5.5% ⇒ vat 5500, gross 105500", (() => { const r = V.computeVat(100000, 550); return r.vatMinor === 5500 && r.grossMinor === 105500; })());
  check("2.1% ⇒ vat 2100", V.computeVat(100000, 210).vatMinor === 2100);
  check("0% ⇒ vat 0, gross = net", (() => { const r = V.computeVat(100000, 0); return r.vatMinor === 0 && r.grossMinor === 100000; })());

  // rounding to nearest centime: 333·20% = 66.6 ⇒ 67; 331·20% = 66.2 ⇒ 66
  check("rounding: 333 @20% ⇒ 67 (round up)", V.computeVat(333, 2000).vatMinor === 67);
  check("rounding: 331 @20% ⇒ 66 (round down)", V.computeVat(331, 2000).vatMinor === 66);

  // RATES_FR_BTP reference catalog present
  check("RATES_FR_BTP: STANDARD 2000, INTERMEDIATE 1000, REDUCED 550", V.RATES_FR_BTP.STANDARD === 2000 && V.RATES_FR_BTP.INTERMEDIATE === 1000 && V.RATES_FR_BTP.REDUCED === 550);

  // computeVat note disclaims rate classification
  check("computeVat note disclaims legal rate choice", /does NOT decide which rate legally applies/.test(V.computeVat(100000, 2000).note));

  // vatBreakdown: per-rate on aggregated base
  const bd = V.vatBreakdown([{ netMinor: 100000, rateBps: 2000 }, { netMinor: 50000, rateBps: 550 }, { netMinor: 30000, rateBps: 2000 }]);
  check("breakdown: 5.5% base 50000 vat 2750; 20% base 130000 vat 26000", bd.ok === true && bd.byRate.length === 2 &&
    bd.byRate[0].rateBps === 550 && bd.byRate[0].baseMinor === 50000 && bd.byRate[0].vatMinor === 2750 &&
    bd.byRate[1].rateBps === 2000 && bd.byRate[1].baseMinor === 130000 && bd.byRate[1].vatMinor === 26000);
  check("breakdown totals: net 180000, vat 28750, gross 208750", bd.totals.netMinor === 180000 && bd.totals.vatMinor === 28750 && bd.totals.grossMinor === 208750);
  check("breakdown per-rate-on-aggregated-base note", /per rate on the aggregated base/.test(bd.note));

  // autoliquidation (reverse-charge): HT only on invoice, VAT NOT waived — due by client
  const rc = V.reverseChargeInvoice(200000, 2000);
  check("reverse-charge: invoice VAT 0, invoice total = net (HT only)", rc.invoiceVatMinor === 0 && rc.invoiceTotalMinor === 200000);
  check("reverse-charge: VAT due by CLIENT = 40000 (NOT waived)", rc.vatDueByClientMinor === 40000);
  check("reverse-charge: mandatory legal mention present", /Autoliquidation/.test(rc.mention) && /283-2 nonies/.test(rc.mention));
  check("reverse-charge note: NOT an exemption, DUE by client", /NOT an exemption/.test(rc.note) && /DUE/.test(rc.note) && /CLIENT/.test(rc.note));

  // fail-closed
  check("negative net ⇒ BAD_NET", V.computeVat(-1, 2000).code === "BAD_NET");
  check("float net ⇒ BAD_NET", V.computeVat(100.5, 2000).code === "BAD_NET");
  check("rate > 10000 ⇒ BAD_RATE", V.computeVat(100000, 10001).code === "BAD_RATE");
  check("negative rate ⇒ BAD_RATE", V.computeVat(100000, -1).code === "BAD_RATE");
  check("overflow (huge net·rate) ⇒ OVERFLOW", V.computeVat(9000000000000, 2000).code === "OVERFLOW");
  check("breakdown empty ⇒ NO_LINES", V.vatBreakdown([]).code === "NO_LINES");
  check("breakdown bad line ⇒ BAD_NET", V.vatBreakdown([{ netMinor: -5, rateBps: 2000 }]).code === "BAD_NET");

  // honesty + determinism + frozen + contract
  check("deterministic", JSON.stringify(V.vatBreakdown([{ netMinor: 100000, rateBps: 2000 }, { netMinor: 50000, rateBps: 550 }, { netMinor: 30000, rateBps: 2000 }])) === JSON.stringify(bd));
  check("frozen", Object.isFrozen(bd) && Object.isFrozen(bd.byRate) && Object.isFrozen(rc));
  check("contract: declared-rate-not-classifier, autoliquidation-not-exemption, integer-minor, fail-closed",
    V.FR_VAT_CONTRACT.invariants.some((s: string) => /does NOT decide which rate legally applies/.test(s)) &&
    V.FR_VAT_CONTRACT.invariants.some((s: string) => /NOT a VAT exemption/.test(s)) &&
    V.FR_VAT_CONTRACT.invariants.some((s: string) => /exact integer minor-unit/.test(s)) &&
    V.FR_VAT_CONTRACT.invariants.some((s: string) => /fail-closed/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-fr-vat (computeVat 20/10/5.5/2.1/0% exact [round-to-centime 333@20%⇒67]; vatBreakdown per-rate-on-aggregated-base [5.5%+20% ⇒ vat 28750]; reverseChargeInvoice autoliquidation = HT-only invoice + VAT DUE by client [not exemption] + legal mention; declared-rate-NOT-classifier; negative/float/overflow fail-closed; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
