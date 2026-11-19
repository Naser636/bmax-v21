#!/usr/bin/env node
"use strict";
/*
 * P3 SECURITY — CVSS v3.1 BASE SCORE calculator. PURE, deterministic, fail-closed.
 *
 * THE GAP (reconciled): the P3 stack has a dependency-trust gate, a security reference scan (qualitative HIGH/MEDIUM
 * heuristics), and cra-remediation-engine which CONSUMES a `cvss` field as INPUT (its header explicitly says it "never
 * fabricates a CVE, a CVSS score"). NOTHING computes a CVSS score from a vector. This adds exactly the standard, fully-
 * specified algorithm — FIRST.org CVSS v3.1 Base metric group — so a supplied vector yields a reproducible base score +
 * severity that can feed severity gating / remediation. It composes; it builds no second security engine.
 *
 * Scope & honesty:
 *  - computes the BASE score ONLY from a SUPPLIED vector — it does NOT fetch CVEs, invent a vector, or compute
 *    Temporal/Environmental scores (out of scope; a base score is not a temporal/environmental score);
 *  - the Roundup follows the v3.1 specification EXACTLY (integer-domain, not naive toFixed) — the detail CVSS libraries
 *    most often get wrong;
 *  - v3.1 ONLY — a non-3.1 version string is REFUSED (v3.0 uses a different roundup; we do not silently mis-score it);
 *  - a score is a severity RATING of the supplied vector — NOT a claim that a given system is actually vulnerable
 *    (presence of the vulnerability is a separate fact the caller owns). No network/clock/randomness.
 */

// FIRST.org CVSS v3.1 base metric weights.
const AV = Object.freeze({ N: 0.85, A: 0.62, L: 0.55, P: 0.2 });
const AC = Object.freeze({ L: 0.77, H: 0.44 });
const UI = Object.freeze({ N: 0.85, R: 0.62 });
const PR_U = Object.freeze({ N: 0.85, L: 0.62, H: 0.27 }); // Scope Unchanged
const PR_C = Object.freeze({ N: 0.85, L: 0.68, H: 0.5 });  // Scope Changed
const CIA = Object.freeze({ H: 0.56, L: 0.22, N: 0 });
const METRICS = Object.freeze({ AV: Object.keys(AV), AC: Object.keys(AC), PR: ["N", "L", "H"], UI: Object.keys(UI), S: ["U", "C"], C: Object.keys(CIA), I: Object.keys(CIA), A: Object.keys(CIA) });
const ORDER = Object.freeze(["AV", "AC", "PR", "UI", "S", "C", "I", "A"]);

function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function freeze(o: any): any { return Object.freeze(o); }

/** CVSS v3.1 Roundup — EXACT per spec (integer domain avoids binary-float drift). */
function roundup(input: number): number {
  const intInput = Math.round(input * 100000);
  if (intInput % 10000 === 0) return intInput / 100000;
  return (Math.floor(intInput / 10000) + 1) / 10;
}

/** CVSS v3.1 qualitative severity rating. */
function severityOf(score: number): string {
  if (score === 0) return "NONE";
  if (score <= 3.9) return "LOW";
  if (score <= 6.9) return "MEDIUM";
  if (score <= 8.9) return "HIGH";
  return "CRITICAL";
}

/** parseVector("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H") -> { ok, metrics } | { ok:false, code }. v3.1 only; all 8 base metrics required. */
function parseVector(vector: any): any {
  if (!isStr(vector)) return freeze({ ok: false, code: "NO_VECTOR" });
  const parts = vector.trim().split("/").filter((p: string) => p.length);
  const map: Record<string, string> = {};
  for (const p of parts) { const i = p.indexOf(":"); if (i < 0) return freeze({ ok: false, code: "BAD_TOKEN", detail: `'${p}' is not KEY:VALUE` }); map[p.slice(0, i)] = p.slice(i + 1); }
  if (map.CVSS === undefined) return freeze({ ok: false, code: "NO_VERSION", detail: "vector must begin with CVSS:3.1" });
  if (map.CVSS !== "3.1") return freeze({ ok: false, code: "UNSUPPORTED_VERSION", detail: `only CVSS v3.1 is supported (got ${map.CVSS}) — v3.0 uses a different roundup and is refused rather than mis-scored` });
  const metrics: Record<string, string> = {};
  for (const k of ORDER) {
    if (map[k] === undefined) return freeze({ ok: false, code: "MISSING_METRIC", detail: `base metric ${k} is required` });
    if ((METRICS as any)[k].indexOf(map[k]) < 0) return freeze({ ok: false, code: "BAD_METRIC_VALUE", detail: `${k}:${map[k]} invalid — allowed ${(METRICS as any)[k].join("|")}` });
    metrics[k] = map[k];
  }
  return freeze({ ok: true, metrics: freeze(metrics) });
}

/**
 * baseScore(vector) -> frozen { ok, baseScore, severity, scope, impactSubScore, impact, exploitability, metrics, vector }.
 * Fail-closed: a malformed/incomplete vector or non-3.1 version is refused (no partial/fabricated score).
 */
function baseScore(vector: any): any {
  const p = parseVector(vector);
  if (p.ok !== true) return p;
  const m = p.metrics;
  const scopeChanged = m.S === "C";
  const prWeight = (scopeChanged ? (PR_C as any) : (PR_U as any))[m.PR];
  const iss = 1 - (1 - (CIA as any)[m.C]) * (1 - (CIA as any)[m.I]) * (1 - (CIA as any)[m.A]); // Impact Sub-Score
  const impact = scopeChanged ? 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15) : 6.42 * iss;
  const exploitability = 8.22 * (AV as any)[m.AV] * (AC as any)[m.AC] * prWeight * (UI as any)[m.UI];
  let base: number;
  if (impact <= 0) base = 0;
  else base = roundup(Math.min((scopeChanged ? 1.08 : 1) * (impact + exploitability), 10));
  return freeze({ ok: true, baseScore: base, severity: severityOf(base), scope: scopeChanged ? "CHANGED" : "UNCHANGED",
    impactSubScore: Number(iss.toFixed(4)), impact: Number(Math.max(0, impact).toFixed(4)), exploitability: Number(exploitability.toFixed(4)),
    metrics: m, vector: vector.trim(),
    note: "CVSS v3.1 BASE score from the supplied vector — NOT a Temporal/Environmental score, and NOT a claim the system is actually vulnerable (that is a separate fact). Roundup per the v3.1 spec." });
}

const CVSS_SCORE_CONTRACT = Object.freeze({
  id: "P3-CVSS-SCORE",
  purpose: "P3 security: FIRST.org CVSS v3.1 BASE score from a supplied vector — fills the gap (cra-remediation consumes a cvss value as input but nothing computed one)",
  reuses: Object.freeze(["feeds cra-remediation-engine (which CONSUMES a cvss field) and severity gating — composes, no second security engine"]),
  invariants: Object.freeze([
    "computes the BASE score ONLY from a SUPPLIED vector — no CVE fetch, no invented vector, no Temporal/Environmental scoring",
    "Roundup follows the CVSS v3.1 spec EXACTLY (integer domain) — not naive decimal rounding",
    "v3.1 ONLY — a non-3.1 version is REFUSED (v3.0 differs) rather than silently mis-scored",
    "fail-closed: malformed/incomplete vector ⇒ typed refusal (no partial/fabricated score)",
    "a score is a severity RATING of the vector — NOT a claim the system is actually vulnerable",
    "PURE + deterministic; no network/clock/randomness",
  ]),
});

module.exports = { parseVector, baseScore, severityOf, roundup, CVSS_SCORE_CONTRACT };
export {};
