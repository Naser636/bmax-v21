#!/usr/bin/env node
"use strict";
/*
 * V216 §5 — OPPORTUNITY × €5M-NET BRIDGE. PURE, READ-ONLY, deterministic, fail-closed COMPOSITION.
 *
 * The €5M-net economics and the opportunity ranking ALREADY EXIST and are tested; this builds NO new economic model and
 * NO new ranker. It COMPOSES three existing modules into ONE comparison so a reader can see, per opportunity, BOTH its
 * FIT rank AND whether a 3-person-capped trajectory to the €5M-net target is reachable IN THE MODEL — two DISTINCT axes
 * that must never be conflated:
 *   - opportunity-axis-router.rankByFit  (fit = evidence/feasibility/deadline; magnitude deliberately NOT dominant)
 *   - odg-three-person-economic-model.searchFor5M  (per-opportunity €5M-net reachability under the 3-person cap + tax)
 *   - odg-economic-model.targetConditions  (aggregate blended revenue REQUIRED for €5M net — the portfolio lens)
 *
 * HARD HONESTY: every number is a MODEL CONDITION under stated hypotheses, NEVER a forecast, result or guarantee. €5M is
 * a TARGET. Real demand / volume is UNVALIDATED and OWNER_GATED (no selling, no campaign, €0 clients). CA ≠ marge ≠
 * contribution ≠ net. A high FIT does NOT imply €5M-reachable, and €5M-reachable does NOT imply a real client — both are
 * reported separately. No second engine, radar, pipeline, register or dashboard. Dual export.
 */

const OAR = require("./opportunity-axis-router.js");       // rankByFit
const TPM = require("./odg-three-person-economic-model.js"); // searchFor5M (3-person cap, per-jurisdiction tax)
const ECON = require("./odg-economic-model.js");            // targetConditions (aggregate €5M revenue-required)

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
const TARGET_DEFAULT = 5000000;

/* compare(opts) — opts.opportunities: [{ id, name, ...fitFields, econ? }], opts.targetNet (default €5M).
 * fitFields = grade/feasible/deadlineDays/budgetEur/scamFlags (consumed by rankByFit). econ = scaleAtVolume-compatible
 * profile (consumed by searchFor5M). An opportunity with no econ profile is reported NO_ECON_PROFILE (never fabricated). */
function compare(opts: any): any {
  const o = isObj(opts) ? opts : {};
  const targetNet = Number.isFinite(o.targetNet) ? o.targetNet : TARGET_DEFAULT;
  const opportunities = Array.isArray(o.opportunities) ? o.opportunities : [];

  // AXIS 1 — fit ranking (reused; no re-implementation).
  const ranked = OAR.rankByFit(opportunities);

  // AXIS 2 — per-opportunity €5M-net reachability (reused; the 3-person cap + tax live INSIDE searchFor5M).
  const rows = ranked.map((opp: any, i: number) => {
    const hasEcon = isObj(opp.econ);
    const reach = hasEcon ? TPM.searchFor5M(opp.econ, targetNet) : null;
    const path = reach && reach.leastStretchPath;
    return Object.freeze({
      id: opp.id != null ? opp.id : "opp-" + i,
      name: typeof opp.name === "string" ? opp.name : null,
      fitRank: i + 1,
      fitScore: opp.fit ? opp.fit.fitScore : null,
      // €5M-net MODEL reachability (NOT a forecast):
      fiveMReachableInModel: hasEcon ? reach.reachable : null,
      leastStretchRevenue: path ? path.recurringRevenue : null,          // annual recurring revenue of the least-stretch path
      leastStretchCustomers: path ? path.customers : null,               // UNVALIDATED demand (OWNER_GATED)
      leastStretchLevers: path ? path.levers : null,                     // price×/automation/cac/jurisdiction
      note: hasEcon ? reach.conclusion : "NO_ECON_PROFILE — no €5M path modelled (econ profile absent; not fabricated)",
    });
  });

  // DIVERGENCE — fit rank and €5M-reachability are DISTINCT; surface where they disagree (top-fit but not €5M-reachable, etc.).
  const topFit = rows.length ? rows[0] : null;
  const anyReachable = rows.some((r: any) => r.fiveMReachableInModel === true);
  const topFitNotReachable = !!(topFit && topFit.fiveMReachableInModel === false);

  // AGGREGATE — portfolio blended revenue REQUIRED for €5M net (reused). targetConditions is FIXED at €5M, so only valid
  // when targetNet is the €5M target; otherwise N/A (we do NOT retune it — honesty over convenience).
  const aggregate = targetNet === TARGET_DEFAULT
    ? Object.freeze({ lens: "blended-métiers corporate model (odg-economic-model.targetConditions)", conditions: ECON.targetConditions() })
    : Object.freeze({ lens: "N/A", note: "aggregate targetConditions is fixed at €5M net; a different targetNet is only applied per-opportunity (searchFor5M), not retuned here" });

  return Object.freeze({
    targetNet,
    count: rows.length,
    comparison: Object.freeze(rows),                 // ranked by FIT (axis 1)
    summary: Object.freeze({
      anyFiveMReachableInModel: anyReachable,
      topFitIsFiveMReachable: topFit ? topFit.fiveMReachableInModel : null,
      divergence: topFitNotReachable
        ? "the HIGHEST-FIT opportunity is NOT €5M-reachable in the model — fit and €5M-reachability diverge; do not pick on fit alone"
        : "no top-fit/€5M divergence detected in this set",
    }),
    aggregate,
    honesty: "MODEL conditions only — not forecasts, results or guarantees. €5M is a TARGET; demand/volume UNVALIDATED and OWNER_GATED; €0 real clients. FIT ≠ €5M-reachable ≠ real client. CA ≠ marge ≠ contribution ≠ net. Composes 3 existing modules; no new economics.",
  });
}

const OPPORTUNITY_5M_BRIDGE_CONTRACT = Object.freeze({
  id: "V216-OPPORTUNITY-5M-BRIDGE",
  purpose: "§5 — one read-only comparison joining opportunity FIT rank × €5M-net MODEL reachability; no new engine",
  invariants: Object.freeze([
    "COMPOSES rankByFit + searchFor5M + targetConditions — builds NO second economic model/ranker",
    "FIT rank and €5M-reachability are DISTINCT axes, reported separately; divergence surfaced; never conflated",
    "every number is a MODEL condition under stated hypotheses — never a forecast/result/guarantee; €5M is a TARGET",
    "demand/volume UNVALIDATED + OWNER_GATED; €0 clients; no selling/campaign; NO_ECON_PROFILE never fabricated",
    "aggregate targetConditions used ONLY at the €5M target (not retuned); deterministic; read-only; dual export",
  ]),
});

module.exports = { compare, OPPORTUNITY_5M_BRIDGE_CONTRACT };
export {};
