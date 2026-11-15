#!/usr/bin/env node
"use strict";
/*
 * IMP-P5-CNCF-RATING (V189-A contract, owner-authorized block) — P5 Platform: a self-rating against the CNCF Platform
 * Engineering Maturity Model's 5 aspects, each scored 1..4 ONLY from supplied evidence + a stated method. PURE,
 * deterministic. Fail-closed: an aspect with no evidence ⇒ level 1 (Provisional) with a GAP note — never inflated.
 * No infrastructure is provisioned; this is a measurement-only self-rating, not an external assessment.
 *
 * Acceptance (contract): 5 aspects rated with method + evidence; no infra provisioning introduced.
 */

// CNCF Platform Engineering Maturity Model — 5 aspects × levels (1 Provisional, 2 Operational, 3 Scalable, 4 Optimizing).
const ASPECTS = Object.freeze(["Investment", "Adoption", "Interfaces", "Operations", "Measurement"]);
const LEVELS = Object.freeze({ 1: "Provisional", 2: "Operational", 3: "Scalable", 4: "Optimizing" });

function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

/* rate({evidence}) -> per-aspect self-rating. evidence: { <aspect>: {level:1..4, note} }. A level is accepted ONLY if
 * 1..4 AND a non-empty note (the method/evidence) is supplied; otherwise the aspect is level 1 with a GAP. */
function rate(input: any): any {
  const i = input && typeof input === "object" ? input : {};
  const ev = i.evidence && typeof i.evidence === "object" ? i.evidence : {};
  const ratings = ASPECTS.map((a) => {
    const e = ev[a] && typeof ev[a] === "object" ? ev[a] : null;
    const lvl = e && Number.isInteger(e.level) && e.level >= 1 && e.level <= 4 ? e.level : null;
    const note = e && typeof e.note === "string" && e.note.trim() ? e.note.trim() : null;
    if (lvl !== null && note) return Object.freeze({ aspect: a, level: lvl, label: (LEVELS as any)[lvl], evidence: note, status: "RATED" });
    return Object.freeze({ aspect: a, level: 1, label: (LEVELS as any)[1], evidence: null, status: "GAP", reason: !e ? "no evidence supplied" : !note ? "level supplied without method/evidence note ⇒ not accepted" : "invalid level" });
  });
  const ratedCount = ratings.filter((r: any) => r.status === "RATED").length;
  const overall = ratings.reduce((s: number, r: any) => s + r.level, 0) / ASPECTS.length;
  return Object.freeze({
    metier: "P5", aspects: Object.freeze(ratings), ratedCount,
    overallLevel: Number(overall.toFixed(2)),
    method: "each aspect accepted at a level ONLY with a supplied method/evidence note; missing/invalid ⇒ level 1 (Provisional) + GAP. A self-rating is NOT an external assessment; no infrastructure is provisioned.",
    honesty: "measurement-only self-rating; an aspect without evidence is Provisional (level 1), never inflated; no infra provisioning; not an external/CNCF certification.",
  });
}

const CNCF_PLATFORM_MATURITY_CONTRACT = Object.freeze({
  id: "IMP-P5-CNCF-RATING",
  purpose: "P5 — CNCF platform-engineering maturity self-rating (5 aspects) with method + evidence; no infra provisioning",
  invariants: Object.freeze([
    "5 aspects, each rated 1..4 ONLY with a supplied method/evidence note; missing ⇒ level 1 + GAP (never inflated)",
    "no infrastructure provisioned — measurement-only self-rating, NOT an external assessment/certification",
    "deterministic; read-only; no new engine",
  ]),
});

module.exports = { ASPECTS, LEVELS, rate, CNCF_PLATFORM_MATURITY_CONTRACT };
export {};
