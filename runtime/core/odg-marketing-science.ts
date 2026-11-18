#!/usr/bin/env node
"use strict";
/*
 * V319 Addendum §6.14 — MARKETING SCIENCE (the one MISSING Speed-Marketing capability per the §2 reconciliation).
 * PURE, deterministic, fail-closed. Encodes the DISCIPLINE the directive demands (refs: Google Meridian, Meta Robyn):
 *   - attribution is DESCRIPTIVE, NEVER causal (first/last/linear credit, always tagged DESCRIPTIVE_NOT_CAUSAL);
 *   - the only CAUSAL estimate is INCREMENTALITY from a real control group, reported WITH uncertainty (95% CI);
 *   - budget allocation is EVIDENCE-GATED: a channel is funded only on proven incrementality + acceptable CAC;
 *     a channel with no experimental evidence is HELD (never funded on attribution/clicks); no evidence ⇒ UNMEASURED.
 * No network/clock/randomness. Extends odg-jetspeed-funnel-economics / odg-economic-model (COST side) — no new engine.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function isNonNegInt(v: any): boolean { return typeof v === "number" && Number.isSafeInteger(v) && v >= 0; }
function isPosInt(v: any): boolean { return isNonNegInt(v) && v > 0; }
function freeze(o: any): any { return Object.freeze(o); }
const Z95 = 1.96; // constant; no randomness

/**
 * attribute(journeys, model) -> per-channel credit. model: "first" | "last" | "linear".
 * ALWAYS tagged DESCRIPTIVE_NOT_CAUSAL — attribution does not establish causality.
 * journeys = [{ converted?:boolean, touches:[channel,...] }] (a converting journey's touchpoints).
 */
function attribute(journeys: any, model: string): any {
  const js = Array.isArray(journeys) ? journeys.filter((j: any) => isObj(j) && Array.isArray(j.touches) && j.touches.length) : [];
  const m = model === "first" || model === "last" || model === "linear" ? model : null;
  if (!m) return freeze({ ok: false, code: "BAD_MODEL", detail: "model must be first|last|linear" });
  const credit: Record<string, number> = {};
  let converting = 0;
  for (const j of js) {
    if (j.converted === false) continue; // credit only converting journeys
    converting++;
    const t = j.touches.filter(isStr);
    if (!t.length) continue;
    if (m === "first") credit[t[0]] = (credit[t[0]] || 0) + 1;
    else if (m === "last") credit[t[t.length - 1]] = (credit[t[t.length - 1]] || 0) + 1;
    else for (const ch of t) credit[ch] = (credit[ch] || 0) + 1 / t.length; // linear: equal split
  }
  return freeze({ ok: true, model: m, converting, credit: freeze(credit),
    verdict: "DESCRIPTIVE_NOT_CAUSAL",
    caveat: "attribution assigns credit by touch position; it does NOT prove any channel CAUSED the conversion — use incrementality for causal claims" });
}

/**
 * incrementality({ treated:{conversions,n}, control:{conversions,n} }) -> causal lift WITH 95% CI.
 * Fail-closed: a real control group is REQUIRED (no control ⇒ NO_CONTROL, no causal claim).
 */
function incrementality(input: any): any {
  const i = isObj(input) ? input : {};
  const t = isObj(i.treated) ? i.treated : null;
  const c = isObj(i.control) ? i.control : null;
  if (!c || !isPosInt(c.n)) return freeze({ ok: false, code: "NO_CONTROL", detail: "a causal incrementality estimate REQUIRES a control group (control.n > 0)" });
  if (!t || !isPosInt(t.n)) return freeze({ ok: false, code: "NO_TREATED", detail: "treated.n > 0 required" });
  if (!isNonNegInt(t.conversions) || !isNonNegInt(c.conversions) || t.conversions > t.n || c.conversions > c.n) return freeze({ ok: false, code: "BAD_COUNTS" });
  const p1 = t.conversions / t.n, p0 = c.conversions / c.n;
  const absLift = p1 - p0;
  const se = Math.sqrt((p1 * (1 - p1)) / t.n + (p0 * (1 - p0)) / c.n);
  const lo = absLift - Z95 * se, hi = absLift + Z95 * se;
  const significant = lo > 0 || hi < 0; // CI excludes 0
  return freeze({ ok: true,
    treatedRate: p1, controlRate: p0, absoluteLiftRate: absLift,
    relativeLift: p0 > 0 ? absLift / p0 : null,
    standardError: se, ci95: freeze([lo, hi]), significant,
    verdict: significant ? "CAUSAL_LIFT_DETECTED" : "NO_SIGNIFICANT_LIFT",
    caveat: "lift is causal ONLY under a valid randomized/holdout control; report the CI, never a point estimate as certainty" });
}

/**
 * allocationGuidance(channels) -> per-channel funding guidance, EVIDENCE-GATED.
 * channels = [{ channel, incrementality?:(result of incrementality()), cac?:{ incrementalMinor }, maxAcceptableCacMinor? }]
 * FUND only when incrementality is significant AND incremental CAC ≤ threshold; otherwise HOLD; no evidence ⇒ UNMEASURED.
 */
function allocationGuidance(channels: any): any {
  const list = Array.isArray(channels) ? channels.filter(isObj) : [];
  if (!list.length) return freeze({ ok: false, code: "NO_CHANNELS" });
  let anyEvidence = false;
  const rows = list.map((ch: any) => {
    const name = isStr(ch.channel) ? ch.channel : "(unnamed)";
    const inc = isObj(ch.incrementality) && ch.incrementality.ok === true ? ch.incrementality : null;
    if (!inc) return freeze({ channel: name, decision: "UNMEASURED", reason: "no incrementality evidence — not funded on attribution/clicks", funded: false });
    anyEvidence = true;
    if (!inc.significant) return freeze({ channel: name, decision: "HOLD", reason: "incrementality CI includes 0 (no proven causal lift)", funded: false });
    const cac = isObj(ch.cac) && isNonNegInt(ch.cac.incrementalMinor) ? ch.cac.incrementalMinor : null;
    const cap = isNonNegInt(ch.maxAcceptableCacMinor) ? ch.maxAcceptableCacMinor : null;
    if (cac === null || cap === null) return freeze({ channel: name, decision: "HOLD", reason: "proven lift but incremental CAC / threshold not supplied — cannot judge profitability", funded: false });
    const fund = cac <= cap;
    return freeze({ channel: name, decision: fund ? "FUND" : "HOLD", reason: fund ? `proven lift + incremental CAC ${cac} ≤ threshold ${cap}` : `proven lift but incremental CAC ${cac} > threshold ${cap} (unprofitable)`, funded: fund, incrementalCacMinor: cac });
  });
  return freeze({ ok: true, anyEvidence, rows: freeze(rows),
    verdict: anyEvidence ? "EVIDENCE_BASED" : "UNMEASURED",
    caveat: "funding follows PROVEN incrementality + profitability, never last-click attribution; unmeasured channels are held, not funded" });
}

const MARKETING_SCIENCE_CONTRACT = Object.freeze({
  id: "V319-ADDENDUM-MARKETING-SCIENCE",
  purpose: "§6.14 — the MISSING marketing-science discipline: descriptive attribution (non-causal), incrementality-with-uncertainty, evidence-gated budget allocation",
  reuses: Object.freeze(["odg-jetspeed-funnel-economics (funnel)", "odg-economic-model (COST SSOT for CAC)"]),
  invariants: Object.freeze([
    "attribution is ALWAYS tagged DESCRIPTIVE_NOT_CAUSAL — it never proves a channel caused a conversion",
    "the only causal estimate is incrementality from a REAL control group; no control ⇒ NO_CONTROL (fail-closed)",
    "incrementality ALWAYS reports a 95% CI + significance (CI-excludes-0); never a bare point estimate as certainty",
    "budget allocation is EVIDENCE-GATED: FUND only on significant lift + acceptable incremental CAC; no evidence ⇒ UNMEASURED/HOLD, never funded on attribution/clicks",
    "PURE + deterministic (constant Z=1.96); no network/clock/randomness; builds no parallel finance engine",
  ]),
});

module.exports = { attribute, incrementality, allocationGuidance, MARKETING_SCIENCE_CONTRACT };
export {};
