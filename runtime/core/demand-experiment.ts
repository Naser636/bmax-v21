#!/usr/bin/env node
/**
 * demand-experiment — the realizable, NO-OUTREACH decomposition of `p01-demand-validation`. It provides (a) a FROZEN,
 * pre-registered experiment protocol (so the success threshold and method cannot be moved post-hoc), and (b) a
 * FAIL-CLOSED willingness-to-pay (WTP) signal VALIDATOR + tally, so that WHEN the owner runs the lawful experiment,
 * each candidate signal is admitted only if it is a genuine, verifiable, lawful, non-fabricated WTP signal.
 *
 * It executes NO outreach and fabricates NO prospects/responses. With zero real signals (reality now) the verdict is
 * DEMAND_NOT_VALIDATED — identical to demand-evidence, but now backed by a rigorous admission rule rather than a count.
 * Reuses demand-evidence.VALIDATING_CLASSES (single source of truth for which classes can validate demand).
 */
"use strict";

const DE = require("./demand-evidence.js");

const VALIDATING_CLASSES: string[] = DE.VALIDATING_CLASSES;
const SUCCESS_THRESHOLD = 5;   // matches demand-evidence pre-registered success threshold (≥5)
const FAILURE_THRESHOLD = 2;   // <2 qualified signals (or free-DIY preference) ⇒ hypothesis refuted

// FROZEN pre-registration: method, instrument, thresholds, stopping rule, lawful basis. Declared BEFORE any data so
// the experiment is credible and the bar cannot drift. Changing this object is a visible, reviewable act.
const PROTOCOL = Object.freeze({
  id: "p01-wtp-experiment-v1",
  offerId: "code-health-check-v1",
  hypothesis: "≥5 qualified prospects in the target segment express concrete willingness-to-pay at the hypothesised price, rather than preferring the free DIY native checkers wired into CI",
  method: "lawful, owner-gated outreach and/or landing-page experiment; each respondent gives an explicit, recorded WTP signal with a price point and a lawful basis (consent / documented legitimate interest)",
  instrument: "a fixed offer description + price prompt; the SAME instrument for every prospect (no leading, no post-hoc edits)",
  sampleFrame: "small-to-mid software teams using JS/TS/Python with CI (the demand-evidence dossier segment)",
  thresholds: { success: SUCCESS_THRESHOLD, failure: FAILURE_THRESHOLD, unit: "verified WTP signals" },
  stoppingRule: "stop at a pre-set max contacts OR when success threshold reached; do NOT keep sampling to manufacture a positive",
  lawfulness: "GDPR/CNIL-respecting: lawful basis recorded per contact; opt-out honoured; no dark patterns; B2B prospection rules followed",
  honesty: "no fabricated prospects/responses; a signal counts ONLY if it passes validateSignal; desk research can NEVER substitute for a real signal",
  status: "NOT_EXECUTED — owner authorization required before any external contact",
});

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function nonEmptyStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

// Reject obviously-synthetic markers defensively (keeps the experiment from being gamed with placeholder data).
const SYNTHETIC_RE = /^(example|test|fake|dummy|placeholder|sample|lorem|xxx)\b/i;

/**
 * validateSignal(signal): fail-closed admission. A WTP signal is ADMISSIBLE only if every required field is present,
 * the class is a validating class, a positive price is stated, a lawful basis is recorded, and nothing is flagged or
 * detectably synthetic. Returns { valid, reasons[] }.
 */
function validateSignal(signal: any): any {
  const reasons: string[] = [];
  if (!isObj(signal)) return { valid: false, reasons: ["signal is not an object"] };
  if (!VALIDATING_CLASSES.includes(signal.class)) reasons.push(`class '${signal.class}' is not a validating class (${VALIDATING_CLASSES.join("|")})`);
  if (!nonEmptyStr(signal.prospectId)) reasons.push("missing prospectId (who)");
  if (!nonEmptyStr(signal.source)) reasons.push("missing verifiable source/reference");
  if (!nonEmptyStr(signal.capturedAt)) reasons.push("missing capturedAt timestamp");
  if (!(typeof signal.priceEur === "number" && signal.priceEur > 0)) reasons.push("missing positive priceEur (stated willingness-to-pay)");
  if (!nonEmptyStr(signal.lawfulBasis)) reasons.push("missing lawfulBasis (consent / documented legitimate interest)");
  if (signal.simulated === true || signal.fabricated === true) reasons.push("signal explicitly flagged simulated/fabricated");
  if (nonEmptyStr(signal.prospectId) && SYNTHETIC_RE.test(signal.prospectId)) reasons.push("prospectId looks synthetic (placeholder)");
  if (nonEmptyStr(signal.source) && SYNTHETIC_RE.test(signal.source)) reasons.push("source looks synthetic (placeholder)");
  return { valid: reasons.length === 0, reasons };
}

/** tallySignals(signals): split into valid/invalid with per-signal reasons. */
function tallySignals(signals: any): any {
  const list = Array.isArray(signals) ? signals : [];
  const valid: any[] = []; const invalid: any[] = [];
  for (const s of list) { const v = validateSignal(s); (v.valid ? valid : invalid).push({ signal: s, reasons: v.reasons }); }
  return { total: list.length, validCount: valid.length, invalidCount: invalid.length, valid, invalid };
}

/**
 * assessExperiment(signals): fail-closed verdict over REAL submitted signals. DEMAND_VALIDATED only if validCount ≥
 * SUCCESS_THRESHOLD. With no/insufficient valid signals ⇒ DEMAND_NOT_VALIDATED. Never fabricates signals.
 */
function assessExperiment(signals: any = []): any {
  const t = tallySignals(signals);
  if (t.validCount >= SUCCESS_THRESHOLD) {
    return { verdict: "DEMAND_VALIDATED", validCount: t.validCount, threshold: SUCCESS_THRESHOLD, tally: t, protocol: PROTOCOL.id };
  }
  return {
    verdict: "DEMAND_NOT_VALIDATED",
    validCount: t.validCount,
    threshold: SUCCESS_THRESHOLD,
    refuted: t.validCount < FAILURE_THRESHOLD,
    missing: `need ≥${SUCCESS_THRESHOLD} verified WTP signals; have ${t.validCount}`,
    note: t.total === 0
      ? "no signals submitted — the owner-gated lawful experiment has NOT been executed; verdict stays NOT_VALIDATED (no fabricated prospects/responses)"
      : "submitted signals did not meet the admission bar and/or the success threshold; verdict stays NOT_VALIDATED",
    tally: t,
    protocol: PROTOCOL.id,
  };
}

export { PROTOCOL, VALIDATING_CLASSES, SUCCESS_THRESHOLD, FAILURE_THRESHOLD, validateSignal, tallySignals, assessExperiment };
module.exports = { PROTOCOL, VALIDATING_CLASSES, SUCCESS_THRESHOLD, FAILURE_THRESHOLD, validateSignal, tallySignals, assessExperiment };

if (require.main === module) {
  // reality now: zero real signals ⇒ DEMAND_NOT_VALIDATED.
  process.stdout.write(JSON.stringify({ protocol: PROTOCOL, liveAssessment: assessExperiment([]) }, null, 2) + "\n");
}
