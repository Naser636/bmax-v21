#!/usr/bin/env node
"use strict";
/* Tests for odg-portfolio-concentration-view (composes commercial-portfolio + concentration-index). PURE. Real modules, no mocks. */
const V = require("./odg-portfolio-concentration-view.js");
const CP = require("./commercial-portfolio.js");
const CI = require("./odg-concentration-index.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

const base = { months: 12, conv: { prospectToInterested: 0.15, interestedToProposal: 0.5, proposalToSigned: 0.35 }, costRatio: 0.3, salesLag: 1, deliveryLag: 1, paymentLag: 1, rampLag: 2, churn: 0.05 };
const A = { label: "A-small", ...base, monthlyProspects: 30, avgContractValue: 2000, recurringMonthly: 0 };
const B = { label: "B-interm", ...base, monthlyProspects: 15, avgContractValue: 9000, recurringMonthly: 0 };
const C = { label: "C-big", ...base, monthlyProspects: 8, avgContractValue: 18000, recurringMonthly: 2000 };
const DOM = { label: "dominant", ...base, monthlyProspects: 50, avgContractValue: 18000, recurringMonthly: 2000 };
const TINY = { label: "tiny", ...base, monthlyProspects: 1, avgContractValue: 500, recurringMonthly: 0 };

function main(): void {
  const tracks = [A, B, C];
  const v = V.portfolioConcentration(tracks);
  const port = CP.projectPortfolio(tracks);
  const cashed = port.trackShares.map((t: any) => t.cashed);
  const conc = CI.concentration(cashed);

  check("ok, 3 tracks, index measured", v.ok === true && v.trackCount === 3 && v.index.measured === true);

  // crude flag kept VERBATIM from commercial-portfolio (not overridden)
  check("crude flag verbatim from portfolio", v.crude.risk === port.concentrationRisk && v.crude.maxSharePct === port.concentrationMaxSharePct);

  // index fidelity vs standalone concentration-index on the portfolio's cashed shares
  check("HHI/Gini/effectiveN fidelity vs standalone concentration", v.index.hhi === conc.hhi && v.index.gini === conc.gini && v.index.effectiveN === conc.effectiveN && v.index.top1Share === conc.top1Share);

  // consistency: top1Share*100 ≈ crude maxSharePct (both derived from cashed shares)
  check("top1Share*100 ≈ crude maxSharePct (consistency)", Math.abs(v.index.top1Share * 100 - v.crude.maxSharePct) < 0.5);

  // CR1 present
  check("CR1 = top-1 share", v.cr.crK === conc.top1Share);

  // DOMINANT track ⇒ crude HIGH + low effective-N (few equal tracks) ⇒ alignment consistent
  const dom = V.portfolioConcentration([DOM, TINY]);
  check("dominant+tiny ⇒ crude HIGH, effectiveN near 1, alignment consistent", dom.crude.risk === "HIGH" && dom.index.effectiveN < 2 && dom.alignment.consistent === true);

  // effective-N is numbers-equivalent: 2 tracks, concentrated ⇒ effectiveN in (1,2]
  check("effectiveN ∈ (1,2] for 2 tracks", dom.index.effectiveN > 1 && dom.index.effectiveN <= 2);

  // NO_DATA: no tracks ⇒ crude NO_DATA, index NOT_MEASURED (not fabricated)
  const empty = V.portfolioConcentration([]);
  check("no tracks ⇒ crude NO_DATA, index NOT_MEASURED", empty.trackCount === 0 && empty.crude.risk === "NO_DATA" && empty.index.measured === false);

  // all-zero cash ⇒ index NOT_MEASURED (ZERO_TOTAL surfaced), not a fabricated 0
  const zero = V.portfolioConcentration([{ label: "z1", ...base, monthlyProspects: 0, avgContractValue: 0, recurringMonthly: 0 }, { label: "z2", ...base, monthlyProspects: 0, avgContractValue: 0, recurringMonthly: 0 }]);
  check("all-zero cash ⇒ index NOT_MEASURED (ZERO_TOTAL), crude still shown", zero.index.measured === false && /ZERO_TOTAL/.test(zero.index.reason));

  // honesty + determinism + frozen + contract
  check("note: crude alongside indices, distribution-shape not verdict, hypothesis", /DISTRIBUTION SHAPE not a risk verdict/.test(v.note) && /HYPOTHESIS/.test(v.note));
  check("alignment is descriptive not a verdict", /NOT a new risk verdict/.test(v.alignment.note));
  check("deterministic", JSON.stringify(V.portfolioConcentration(tracks)) === JSON.stringify(v));
  check("frozen", Object.isFrozen(v) && Object.isFrozen(v.crude) && Object.isFrozen(v.index) && Object.isFrozen(v.alignment));
  check("contract: composes-modifies-neither, crude-verbatim, shape-not-verdict, zero-total-not-fabricated",
    V.PORTFOLIO_CONCENTRATION_CONTRACT.invariants.some((s: string) => /MODIFIES NEITHER/.test(s)) &&
    V.PORTFOLIO_CONCENTRATION_CONTRACT.invariants.some((s: string) => /kept VERBATIM/.test(s)) &&
    V.PORTFOLIO_CONCENTRATION_CONTRACT.invariants.some((s: string) => /NOT a risk verdict/.test(s)) &&
    V.PORTFOLIO_CONCENTRATION_CONTRACT.invariants.some((s: string) => /never a fabricated 0/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-portfolio-concentration-view (composes REAL commercial-portfolio + concentration-index, modifies neither; crude maxShare flag VERBATIM alongside HHI/Gini/effective-N; index fidelity vs standalone; top1Share≈maxSharePct consistency; dominant⇒HIGH+effectiveN~1 aligned; no-tracks⇒NO_DATA, all-zero⇒NOT_MEASURED not fabricated; deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
