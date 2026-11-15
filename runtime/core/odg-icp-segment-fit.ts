#!/usr/bin/env node
"use strict";
/*
 * V206 (post-V205) §3 — Speed Marketing: ICP SEGMENT definition + explainable OFFER↔SEGMENT FIT. PURE, deterministic,
 * MODEL-ONLY. Fills the one gap in the existing Speed-Marketing chain: commercial-offer-builder requires an opaque
 * opp.segment string and enterprise-qualification scores a prospect, but NOTHING defines an ICP segment with auditable
 * criteria and scores how well a built offer fits it. This is NOT a new commercial engine / CRM / pipeline — it is the
 * missing segmentation/fit layer that feeds odg-jetspeed-funnel-economics (segmentFit) and buildOffer (opp.segment).
 *
 * HONESTY: a fit score is a HYPOTHESIS, never a validated demand, a qualified client or a sale; segment ≠ real customer;
 * score ≠ authorization. Fail-closed: an un-built offer or an over-budget price ⇒ NO_FIT; a missing criterion ⇒ that
 * dimension is UNDETERMINED (never fabricated). Deterministic; no external call; nothing is sent/committed. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function num(v: any): number | null { return typeof v === "number" && isFinite(v) ? v : null; }
function toks(s: any): string[] { return String(s || "").toLowerCase().split(/[^a-z0-9àâäéèêëïîôöùûüç]+/i).filter(Boolean); }

/* defineSegment(spec) -> validated ICP segment | {ok:false}. criteria are explicit + auditable. */
function defineSegment(spec: any): any {
  const s = isObj(spec) ? spec : {};
  const problems: string[] = [];
  if (typeof s.id !== "string" || !s.id.trim()) problems.push("segment id required");
  if (typeof s.sector !== "string" || !s.sector.trim()) problems.push("sector required");
  if (arr(s.needs).length === 0) problems.push("needs[] required (what the segment must solve)");
  const budget = arr(s.budgetBand).length === 2 && s.budgetBand.every((x: any) => num(x) !== null) ? s.budgetBand.map(Number) : null;
  if (problems.length) return Object.freeze({ ok: false, problems: Object.freeze(problems) });
  return Object.freeze({
    ok: true,
    segment: Object.freeze({
      id: s.id, sector: s.sector, needs: Object.freeze(arr(s.needs).map(String)),
      budgetBand: budget ? Object.freeze(budget) : null,   // null ⇒ budget dimension UNDETERMINED
      urgency: ["LOW", "MEDIUM", "HIGH"].includes(s.urgency) ? s.urgency : "UNKNOWN",
      requiredCapabilities: Object.freeze(arr(s.requiredCapabilities).map(String)),
      decisionMaker: typeof s.decisionMaker === "string" ? s.decisionMaker : null,
    }),
  });
}

const WEIGHTS = Object.freeze({ needAlignment: 30, maturity: 25, budgetFit: 25, urgency: 10, capabilityCoverage: 10 });

/* scoreOfferSegmentFit(offer, segment) -> explainable fit. offer: { id, built, problem, priceLow, priceHigh,
 * capabilities[] }. Fail-closed on hard disqualifiers. Returns {fitScore 0-100, band, breakdown, disqualifiers,
 * undetermined, explanation, modelOnly}. */
function scoreOfferSegmentFit(offer: any, segment: any): any {
  const o = isObj(offer) ? offer : {};
  const seg = isObj(segment) ? segment : {};
  if (!seg.id || arr(seg.needs).length === 0) return Object.freeze({ ok: false, reason: "invalid segment (define it via defineSegment first)" });

  const disqualifiers: string[] = [];
  const undetermined: string[] = [];
  const breakdown: any[] = [];
  let score = 0;

  // 1. need alignment (offer.problem ↔ segment.needs token overlap)
  const needToks = new Set(arr(seg.needs).flatMap((n: any) => toks(n)));
  const problemToks = toks(o.problem);
  const overlap = problemToks.filter((t) => needToks.has(t));
  const needPts = needToks.size > 0 && problemToks.length > 0 ? Math.round(WEIGHTS.needAlignment * Math.min(1, overlap.length / Math.max(1, Math.min(3, needToks.size)))) : 0;
  if (!o.problem) undetermined.push("needAlignment (offer.problem absent)");
  score += needPts; breakdown.push({ dim: "needAlignment", points: needPts, max: WEIGHTS.needAlignment, matched: overlap.slice(0, 5) });

  // 2. maturity — HARD gate: an un-built offer cannot fit (deny-by-default)
  const built = o.built === true;
  const matPts = built ? WEIGHTS.maturity : 0;
  if (!built) disqualifiers.push("offer not built+validated — cannot be offered (NO_FIT)");
  score += matPts; breakdown.push({ dim: "maturity", points: matPts, max: WEIGHTS.maturity, built });

  // 3. budget fit — price band vs segment budget band; above budget ⇒ disqualify
  const pl = num(o.priceLow), ph = num(o.priceHigh);
  if (!seg.budgetBand) { undetermined.push("budgetFit (segment.budgetBand undeclared)"); breakdown.push({ dim: "budgetFit", points: 0, max: WEIGHTS.budgetFit, note: "UNDETERMINED" }); }
  else if (pl === null || ph === null) { undetermined.push("budgetFit (offer price band absent)"); breakdown.push({ dim: "budgetFit", points: 0, max: WEIGHTS.budgetFit, note: "UNDETERMINED" }); }
  else {
    const [bMin, bMax] = seg.budgetBand;
    if (pl > bMax) { disqualifiers.push(`offer price floor ${pl} exceeds segment budget max ${bMax}`); breakdown.push({ dim: "budgetFit", points: 0, max: WEIGHTS.budgetFit, note: "over budget" }); }
    else { const within = ph <= bMax ? 1 : Math.max(0, (bMax - pl) / Math.max(1, ph - pl)); const bPts = Math.round(WEIGHTS.budgetFit * within); score += bPts; breakdown.push({ dim: "budgetFit", points: bPts, max: WEIGHTS.budgetFit }); }
  }

  // 4. urgency
  const urgPts = seg.urgency === "HIGH" ? WEIGHTS.urgency : seg.urgency === "MEDIUM" ? Math.round(WEIGHTS.urgency * 0.5) : 0;
  if (seg.urgency === "UNKNOWN") undetermined.push("urgency (segment.urgency unknown)");
  score += urgPts; breakdown.push({ dim: "urgency", points: urgPts, max: WEIGHTS.urgency, urgency: seg.urgency });

  // 5. capability coverage (offer capabilities ↔ segment.requiredCapabilities)
  const reqCaps = arr(seg.requiredCapabilities).map((c: any) => String(c).toLowerCase());
  const offCaps = new Set(arr(o.capabilities).map((c: any) => String(c).toLowerCase()));
  const covered = reqCaps.filter((c) => offCaps.has(c));
  const capPts = reqCaps.length === 0 ? 0 : Math.round(WEIGHTS.capabilityCoverage * (covered.length / reqCaps.length));
  if (reqCaps.length === 0) undetermined.push("capabilityCoverage (no required capabilities declared)");
  score += capPts; breakdown.push({ dim: "capabilityCoverage", points: capPts, max: WEIGHTS.capabilityCoverage, covered, required: reqCaps.length });

  const disqualified = disqualifiers.length > 0;
  const fitScore = disqualified ? 0 : score;
  const band = disqualified ? "NO_FIT" : fitScore >= 70 ? "STRONG" : fitScore >= 45 ? "MODERATE" : fitScore >= 20 ? "WEAK" : "NO_FIT";

  return Object.freeze({
    ok: true, modelOnly: true, offerId: o.id || null, segmentId: seg.id,
    fitScore, band, breakdown: Object.freeze(breakdown),
    disqualifiers: Object.freeze(disqualifiers), undetermined: Object.freeze(undetermined),
    explanation: `${band} (${fitScore}/100) — ${disqualified ? "hard disqualifier: " + disqualifiers[0] : "weighted: need/maturity/budget/urgency/capability"}${undetermined.length ? "; UNDETERMINED: " + undetermined.length + " dim(s)" : ""}`,
    honesty: "a fit score is a HYPOTHESIS, not validated demand / a qualified client / a sale; segment ≠ real customer; score ≠ authorization. MODEL-ONLY; nothing sent or committed.",
  });
}

const ICP_SEGMENT_FIT_CONTRACT = Object.freeze({
  id: "V206-ICP-SEGMENT-FIT",
  purpose: "§3 — define ICP segments + explainable offer↔segment fit, filling the Speed-Marketing segmentation gap; composes existing offer/qualification/economics",
  invariants: Object.freeze([
    "NOT a new commercial engine/CRM/pipeline — the missing segmentation/fit layer feeding buildOffer + jetspeed-funnel-economics",
    "fail-closed: an un-built offer or an over-budget price ⇒ NO_FIT (hard disqualifier)",
    "a missing criterion ⇒ that dimension is UNDETERMINED, never fabricated; score is explainable (per-dimension breakdown)",
    "MODEL-ONLY: a fit score is a HYPOTHESIS, never validated demand / qualified client / sale; score ≠ authorization",
    "deterministic; no external call; nothing sent/committed",
  ]),
});

module.exports = { defineSegment, scoreOfferSegmentFit, WEIGHTS, ICP_SEGMENT_FIT_CONTRACT };
export {};
