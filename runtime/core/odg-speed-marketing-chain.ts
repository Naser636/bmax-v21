#!/usr/bin/env node
"use strict";
/*
 * V209 (Directive-3 §2) — SPEED-MARKETING E2E CHAIN connector. PURE, deterministic, MODEL-ONLY. Composes the EXISTING
 * modules into the one end-to-end path the directive asks to prove:
 *
 *   defineSegment (ICP) → scoreOfferSegmentFit (V206) → [gate on band] → funnelMetrics (V204 JetSpeed)
 *
 * It is NOT a second commercial pipeline/CRM: it only wires odg-icp-segment-fit + odg-jetspeed-funnel-economics and
 * propagates their honesty. Fail-closed: an invalid segment stops at the segment stage; a NO_FIT offer (un-built /
 * over-budget / weak) STOPS before any economics are modelled (we never model acquisition economics for an offer that
 * does not fit its segment). UNDETERMINED from either stage is propagated. A result is NEVER a qualified client or a sale.
 */

const FIT = require("./odg-icp-segment-fit.js");
const FUNNEL = require("./odg-jetspeed-funnel-economics.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/* assessChain(input) -> end-to-end result. input = { segmentSpec, offer, funnel }. */
function assessChain(input: any): any {
  const i = isObj(input) ? input : {};

  // 1. define the ICP segment (fail-closed if invalid)
  const segR = FIT.defineSegment(i.segmentSpec);
  if (!segR.ok) return Object.freeze({ ok: false, stage: "segment", verdict: "INVALID_SEGMENT", problems: segR.problems, honesty: honest() });

  // 2. score offer ↔ segment fit (V206)
  const fit = FIT.scoreOfferSegmentFit(i.offer, segR.segment);
  if (!fit.ok) return Object.freeze({ ok: false, stage: "fit", verdict: "INVALID_FIT_INPUT", honesty: honest() });

  // 3. gate: a NO_FIT offer STOPS — do not model economics for an offer that does not fit its segment
  if (fit.band === "NO_FIT") return Object.freeze({ ok: true, stage: "fit", proceed: false, fit: Object.freeze({ band: fit.band, fitScore: fit.fitScore, disqualifiers: fit.disqualifiers }), economics: null, verdict: "STOPPED_NO_FIT", undetermined: fit.undetermined, honesty: honest() });

  // 4. model the funnel economics (V204, MODEL-ONLY) for a fitting offer
  const econ = FUNNEL.funnelMetrics(i.funnel);
  const undetermined = Object.freeze([...(fit.undetermined || [])]);
  // chain verdict: both must be positive to be "model-promising" — still MODEL-ONLY, never a client.
  const verdict = (fit.band === "STRONG" && econ.ok && econ.verdict === "HEALTHY") ? "MODEL_PROMISING"
    : (econ.ok && econ.verdict === "NOT_VIABLE") ? "MODEL_NOT_VIABLE"
      : "MODEL_NEEDS_REVIEW";

  return Object.freeze({
    ok: true, stage: "complete", proceed: true,
    fit: Object.freeze({ band: fit.band, fitScore: fit.fitScore, breakdown: fit.breakdown }),
    economics: Object.freeze({ verdict: econ.verdict, cac: econ.economics ? econ.economics.cac : null, ltvCacRatio: econ.economics ? econ.economics.ltvCacRatio : null, flags: econ.flags }),
    verdict, undetermined, honesty: honest(),
  });
}
function honest(): string { return "MODEL-ONLY end-to-end chain composing defineSegment → scoreOfferSegmentFit → funnelMetrics; a NO_FIT offer is STOPPED before economics; UNDETERMINED is propagated; a result is a HYPOTHESIS — never a qualified client, a sale, or realized revenue; no second commercial pipeline."; }

const SPEED_MARKETING_CHAIN_CONTRACT = Object.freeze({
  id: "V209-SPEED-MARKETING-CHAIN",
  purpose: "§2 — prove the ICP→offer-fit→funnel-economics chain end-to-end by composing the existing modules; no 2nd pipeline",
  invariants: Object.freeze([
    "composes odg-icp-segment-fit + odg-jetspeed-funnel-economics — NOT a second commercial pipeline/CRM",
    "fail-closed: invalid segment stops at segment; a NO_FIT offer STOPS before any economics are modelled",
    "UNDETERMINED is propagated from either stage; a result is MODEL-ONLY — never a qualified client / sale / realized revenue",
    "deterministic; read-only; no new engine",
  ]),
});

module.exports = { assessChain, SPEED_MARKETING_CHAIN_CONTRACT };
export {};
