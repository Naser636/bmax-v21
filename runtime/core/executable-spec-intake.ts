#!/usr/bin/env node
/**
 * executable-spec-intake — turn a client's executable acceptance spec (Gherkin: Feature/Scenario/Given/When/
 * Then) into explicit, named acceptance CRITERIA and evaluate them with mechanical-acceptance's own
 * deny-by-default precedence. Gojko Adzic's "specification by example / executable specifications" made an
 * ODG intake step (CAPABILITY_GAP_REGISTER_V1.md G-03, P2; monetizes the D05 evaluation-integrity audit).
 *
 * ADDITIVE / NON-INVASIVE: does NOT modify mechanical-acceptance — it REUSES its exported `VERDICT` and
 * `PRECEDENCE` (REJECT > BLOCKED > UNKNOWN > ACCEPT) so a parsed client spec is judged by the SAME fact-based,
 * deny-by-default doctrine, without inventing a parallel vocabulary. (mechanical-acceptance's own KNOWN_CHECKS
 * set is fixed/internal; client criteria are evaluated here against supplied observations, not smuggled into
 * that fixed set.)
 *
 * HONESTY / FAIL-CLOSED (parsing a spec NEVER satisfies it):
 *   - no Feature / no Scenario ⇒ PARSE_ERROR; a Scenario with no Then ⇒ it contributes no criterion, and a
 *     spec that yields zero criteria ⇒ NO_CRITERIA (you cannot accept against nothing).
 *   - every extracted criterion starts UNOBSERVED; an unobserved criterion evaluates to UNKNOWN
 *     (deny-by-default) — NEVER auto-ACCEPT.
 *   - a criterion observed false ⇒ REJECT; overall ACCEPT requires >=1 criterion AND every criterion
 *     observed true (no missing, no false) — mirroring mechanical-acceptance exactly.
 *
 * PURE (no fs/network/clock/spawn). NO new primitive. Dual export (ESM + CJS).
 */
"use strict";

const MA: any = require("./mechanical-acceptance.js");
const VERDICT = MA.VERDICT;          // { ACCEPT, REJECT, BLOCKED, UNKNOWN }
const PRECEDENCE = MA.PRECEDENCE;    // [REJECT, BLOCKED, UNKNOWN, ACCEPT]

const SCHEMA = "odg.executable-spec-intake.v1";
const STEP = /^(Given|When|Then|And|But)\b\s*(.*)$/i;

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

// Minimal, dependency-free Gherkin parse. Fail-closed on no Feature / no Scenario.
function parseGherkin(text: any): any {
  if (typeof text !== "string" || !text.trim()) return { ok: false, code: "PARSE_ERROR", reason: "spec text (non-empty string) required" };
  const lines = text.split(/\r?\n/);
  let feature: string | null = null;
  const scenarios: any[] = [];
  let cur: any = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const mF = /^Feature:\s*(.*)$/i.exec(line);
    if (mF) { feature = mF[1].trim(); continue; }
    const mS = /^Scenario(?:\s+Outline)?:\s*(.*)$/i.exec(line);
    if (mS) { cur = { name: mS[1].trim(), steps: [] }; scenarios.push(cur); continue; }
    const mStep = STEP.exec(line);
    if (mStep && cur) { cur.steps.push({ keyword: mStep[1].replace(/^\w/, (c) => c.toUpperCase()), text: mStep[2].trim() }); continue; }
    // lines like Examples:, |tables|, free text, or steps before any Scenario are ignored (not fabricated into criteria)
  }
  if (feature === null) return { ok: false, code: "PARSE_ERROR", reason: "no Feature: line found" };
  if (scenarios.length === 0) return { ok: false, code: "PARSE_ERROR", reason: "no Scenario found" };
  return { ok: true, feature, scenarios };
}

// Extract named acceptance criteria: each Then (and an And/But continuing a Then block) is an assertion.
// A Given/When resets the "in-Then" state so an And after a When is NOT treated as an acceptance assertion.
function extractCriteria(parsed: any): any {
  if (!parsed || parsed.ok !== true) return { ok: false, code: parsed && parsed.code ? parsed.code : "PARSE_ERROR", reason: parsed && parsed.reason ? parsed.reason : "unparsed spec" };
  const criteria: any[] = [];
  parsed.scenarios.forEach((sc: any, si: number) => {
    let inThen = false; let ti = 0;
    for (const st of sc.steps) {
      const kw = st.keyword.toLowerCase();
      if (kw === "given" || kw === "when") { inThen = false; continue; }
      if (kw === "then") { inThen = true; ti++; criteria.push({ id: `s${si + 1}-then${ti}`, scenario: sc.name, text: st.text }); continue; }
      if ((kw === "and" || kw === "but") && inThen) { ti++; criteria.push({ id: `s${si + 1}-then${ti}`, scenario: sc.name, text: st.text }); }
    }
  });
  if (criteria.length === 0) return { ok: false, code: "NO_CRITERIA", reason: "spec yields no Then assertions — nothing to accept against" };
  return { ok: true, feature: parsed.feature, count: criteria.length, criteria };
}

// Convenience: text -> criteria (fail-closed throughout).
function intake(text: any): any {
  const p = parseGherkin(text);
  if (!p.ok) return p;
  return extractCriteria(p);
}

// Evaluate criteria against supplied observations with mechanical-acceptance's deny-by-default precedence.
// observations: { [criterionId]: boolean | { result: boolean } }. Missing/undefined ⇒ UNKNOWN (deny-by-default).
function evaluateCriteria(criteria: any, observations: any): any {
  if (!Array.isArray(criteria) || criteria.length === 0) return { ok: false, verdict: VERDICT.UNKNOWN, reason: "no criteria to evaluate" };
  const obs = isObj(observations) ? observations : {};
  const per: any[] = [];
  const counts: any = { accept: 0, reject: 0, unknown: 0 };
  for (const c of criteria) {
    const raw = obs[c.id];
    const result = isObj(raw) ? raw.result : raw;
    let verdict: string;
    if (result === true) { verdict = VERDICT.ACCEPT; counts.accept++; }
    else if (result === false) { verdict = VERDICT.REJECT; counts.reject++; }
    else { verdict = VERDICT.UNKNOWN; counts.unknown++; } // missing / non-boolean ⇒ deny-by-default
    per.push({ id: c.id, scenario: c.scenario, text: c.text, verdict });
  }
  // overall by precedence: any REJECT ⇒ REJECT; else any UNKNOWN ⇒ UNKNOWN; else (all ACCEPT) ⇒ ACCEPT.
  let overall: string;
  if (counts.reject > 0) overall = VERDICT.REJECT;
  else if (counts.unknown > 0) overall = VERDICT.UNKNOWN;
  else overall = VERDICT.ACCEPT; // every criterion observed true (counts.accept === criteria.length)
  return {
    ok: true,
    schema: SCHEMA,
    overall,
    counts,
    criteria: per,
    precedence: PRECEDENCE,
    note: overall === VERDICT.ACCEPT
      ? "Every criterion was observed true. ACCEPT reflects the supplied observations; it is only as sound as the evidence behind each observation."
      : overall === VERDICT.UNKNOWN
      ? "At least one criterion is unobserved (deny-by-default UNKNOWN) — the spec is NOT accepted. Supply a real observation for every criterion."
      : "At least one criterion was observed false ⇒ REJECT.",
  };
}

export { parseGherkin, extractCriteria, intake, evaluateCriteria, SCHEMA };
module.exports = { parseGherkin, extractCriteria, intake, evaluateCriteria, SCHEMA };

if (require.main === module) {
  const spec = "Feature: invoice export\n  Scenario: round-trip\n    Given a valid CII invoice\n    When it is exported and re-parsed\n    Then the totals are preserved\n    And the schema still validates\n";
  const ix = intake(spec);
  const ev = evaluateCriteria(ix.criteria, { "s1-then1": true }); // second criterion unobserved ⇒ UNKNOWN overall
  process.stdout.write(JSON.stringify({ count: ix.count, overall: ev.overall, counts: ev.counts }, null, 2) + "\n");
}
