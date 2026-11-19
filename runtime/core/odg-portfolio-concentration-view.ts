#!/usr/bin/env node
"use strict";
/*
 * PORTFOLIO-CONCENTRATION VIEW — backs commercial-portfolio's crude maxShare heuristic with the real concentration
 * indices. PURE, deterministic, fail-closed. MODIFIES NEITHER module.
 *
 *  - commercial-portfolio.projectPortfolio : consolidates revenue tracks and flags concentration with a single-point
 *    heuristic (concentrationRisk = maxShare>60% ⇒ HIGH / >40% ⇒ MEDIUM / else LOW) — a declared threshold, not a measure.
 *  - odg-concentration-index.concentration : the standard indices (HHI, Gini, effective-N, CRk) over a distribution.
 *
 * This runs the portfolio, takes each track's cashed-within-horizon as the distribution, and reports the crude flag
 * ALONGSIDE the proper indices — so "is the portfolio dangerously concentrated?" gets a reproducible number (HHI /
 * Gini / effective-N = "as concentrated as this many equal tracks") instead of just a 60% threshold. The crude flag is
 * kept VERBATIM (not overridden) — this composes, it does not replace.
 *
 * Honesty:
 *  - the indices describe DISTRIBUTION SHAPE, NOT a risk verdict (inherited from concentration-index); the crude flag
 *    stays a declared heuristic — both are shown, neither is dressed up as a decision;
 *  - all-zero cash (nothing to concentrate) ⇒ index NOT_MEASURED (surfaced from concentration-index's ZERO_TOTAL),
 *    never a fabricated 0; no tracks ⇒ NO_DATA;
 *  - cashed figures are the portfolio's HYPOTHESIS projections (not realized revenue) — carried, not re-computed here.
 *  No network/clock/randomness.
 */

const CP = require("./commercial-portfolio.js");
const CI = require("./odg-concentration-index.js");

function freeze(o: any): any { return Object.freeze(o); }

/**
 * portfolioConcentration(tracks) -> { ok, trackCount, crude, index, cr, alignment, note }.
 * tracks: the same [{ label, ...projectMonthly params }] commercial-portfolio takes. Fail-closed: no tracks ⇒ NO_DATA;
 * all-zero cash ⇒ index NOT_MEASURED. The crude flag is the portfolio's own concentrationRisk, kept verbatim.
 */
function portfolioConcentration(tracks: any): any {
  const port = CP.projectPortfolio(tracks);
  const crude = freeze({ maxSharePct: port.concentrationMaxSharePct, risk: port.concentrationRisk });
  if (port.trackCount === 0) {
    return freeze({ ok: true, trackCount: 0, crude, index: freeze({ measured: false, reason: "no tracks — NO_DATA" }),
      cr: null, alignment: null, note: "no tracks supplied; nothing to concentrate (NO_DATA) — nothing fabricated." });
  }
  const cashed = port.trackShares.map((t: any) => (typeof t.cashed === "number" && Number.isFinite(t.cashed) && t.cashed >= 0 ? t.cashed : 0));
  const conc = CI.concentration(cashed);
  if (conc.ok !== true) {
    return freeze({ ok: true, trackCount: port.trackCount, crude,
      index: freeze({ measured: false, reason: conc.code || "UNMEASURABLE", detail: conc.detail || null }),
      cr: null, alignment: null,
      note: "concentration index NOT_MEASURED (e.g. all-zero projected cash ⇒ ZERO_TOTAL) — crude flag shown, index not fabricated." });
  }
  const cr1 = CI.concentrationRatio(cashed, 1);
  const index = freeze({ measured: true, hhi: conc.hhi, hhiPoints: conc.hhiPoints, normalizedHHI: conc.normalizedHHI,
    gini: conc.gini, effectiveN: conc.effectiveN, top1Share: conc.top1Share });

  // factual cross-reference: does the crude flag line up with the index? (effectiveN ≈ "how many equal tracks")
  // HIGH crude ⇔ effectiveN small (few dominant tracks); LOW crude ⇔ effectiveN near trackCount. Descriptive only.
  const aligned = (crude.risk === "HIGH" && conc.effectiveN < port.trackCount * 0.6) ||
                  (crude.risk === "LOW" && conc.effectiveN >= port.trackCount * 0.75) ||
                  (crude.risk === "MEDIUM" && conc.effectiveN >= port.trackCount * 0.5 && conc.effectiveN < port.trackCount * 0.85);
  const alignment = freeze({ crudeRisk: crude.risk, effectiveN: conc.effectiveN, trackCount: port.trackCount, consistent: aligned,
    note: "effective-N = numbers-equivalent (as concentrated as this many EQUAL tracks); compared descriptively to the crude threshold band — NOT a new risk verdict" });

  return freeze({ ok: true, trackCount: port.trackCount, crude, index, cr: cr1, alignment,
    note: "crude maxShare flag (declared heuristic) shown ALONGSIDE the proper concentration indices (HHI/Gini/effective-N, DISTRIBUTION SHAPE not a risk verdict); composes commercial-portfolio + concentration-index, modifies neither; cashed = HYPOTHESIS projections, not realized revenue." });
}

const PORTFOLIO_CONCENTRATION_CONTRACT = Object.freeze({
  id: "PORTFOLIO-CONCENTRATION-VIEW",
  purpose: "back commercial-portfolio's crude maxShare>60% heuristic with real concentration indices (HHI/Gini/effective-N/CR1)",
  reuses: Object.freeze(["commercial-portfolio.projectPortfolio", "odg-concentration-index.concentration/concentrationRatio"]),
  invariants: Object.freeze([
    "composes BOTH modules and MODIFIES NEITHER — the crude flag is kept VERBATIM, not overridden",
    "indices describe DISTRIBUTION SHAPE, NOT a risk verdict; the crude flag stays a declared heuristic (both shown)",
    "all-zero cash ⇒ index NOT_MEASURED (ZERO_TOTAL surfaced), never a fabricated 0; no tracks ⇒ NO_DATA",
    "cashed = the portfolio's HYPOTHESIS projections (carried, not realized revenue, not re-computed)",
    "alignment is a DESCRIPTIVE consistency note (crude band vs effective-N), not a new verdict",
    "PURE + deterministic; no network/clock/randomness",
  ]),
});

module.exports = { portfolioConcentration, PORTFOLIO_CONCENTRATION_CONTRACT };
export {};
