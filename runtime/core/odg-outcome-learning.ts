#!/usr/bin/env node
"use strict";
/*
 * V17.5 (owner CTO directive 2026-11-24, PRIORITY 4 « Apprentissage par les résultats ») — OUTCOME LEARNING. PURE,
 * deterministic, READ-ONLY: compares what ODG PREDICTED when an item was selected (the strategic register's criterion
 * values / evidenceScore / uncertainty at selection time + the contract's pre-registered hypothesis) with the grade that was
 * REALIZED (experiment outcome by the pre-registered rule, then the independent VALIDATE_CRITERIA grade), and derives
 * per-criterion calibration, selection-error and bias findings.
 *
 * HONESTY (the point of this module):
 *   - n is tiny (4 closed/graded items). Every finding is a HYPOTHESIS carrying its n and its supporting items — never a
 *     proven effect. No p-value, no "significant", no generalisation beyond the cited items.
 *   - evidenceScore is a weighted SUM of normalised criteria, NOT a probability of PASS ⇒ no Brier/ECE is computed on it
 *     (that would invent a probabilistic meaning the selector never declared). Only ORDER association (Spearman, reused
 *     from odg-rank-correlation) and group means are reported, both flagged report-only.
 *   - NOT_MEASURED criteria stay NOT_MEASURED (they are counted, never imputed); a pending validation stays PENDING (the
 *     experiment outcome is reported separately and never presented as the validated grade).
 *   - This record is NOT fed into the selector: weights, criteria, thresholds and register scoring are unchanged. A future,
 *     separately-inspected change may consume it (`feedsScoring: false`).
 *
 * REUSE: odg-rank-correlation.spearman (order association), odg-native-outcome-calibration.calibrateFromBuildOutcomes
 * (survivorship-guarded calibration quality of the realized PASS rate — DEGRADED below 20 observations). No second
 * selector, no second calibration engine.
 */

const RC = require("./odg-rank-correlation.js");
const NOC = require("./odg-native-outcome-calibration.js");

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function isNum(v: any): boolean { return typeof v === "number" && Number.isFinite(v); }
function r4(n: number): number { return Number(n.toFixed(4)); }

/* The closed / graded items this record learns from, with their committed evidence (source pointers, not values). */
const EV = "docs/odg/evidence";
const CLOSED_MISSIONS = freeze([
  freeze({ id: "G", experiment: `${EV}/V166_G_EXPERIMENT.json`, validation: `${EV}/V166_G_CRITERIA_VALIDATION.json`, trace: null }),
  freeze({ id: "H", experiment: `${EV}/V168_H_EXPERIMENT.json`, validation: `${EV}/V168_H_CRITERIA_VALIDATION.json`, trace: `${EV}/V168_H_GO_EXECUTE_TRACE.jsonl` }),
  freeze({ id: "G2", experiment: `${EV}/V172_G2_EXPERIMENT.json`, validation: `${EV}/V172_G2_CRITERIA_VALIDATION.json`, trace: `${EV}/V174_G2_GO_EXECUTE_TRACE.jsonl` }),
  freeze({ id: "J2", experiment: `${EV}/V172_J2_EXPERIMENT.json`, validation: `${EV}/V172_J2_CRITERIA_VALIDATION.json`, trace: `${EV}/V175_J2_GO_EXECUTE_TRACE.jsonl` }),
]);

/* Declared, report-only constants (provider-declared before the first run of the bin; not selector parameters). */
const GRADE_UTILITY: Record<string, number> = freeze({ PASS: 1, PARTIAL: 0.5, FAIL: 0 }); // NOT_MEASURED / PENDING ⇒ no utility
const FAVOURABLE_HIGH = 0.75; // favourability = value (HIGHER_IS_BETTER) or 1 − value (LOWER_IS_BETTER); ≥ 0.75 ⇒ "predicted high"
const MIN_SUPPORT = 2; // a criterion pattern needs ≥ 2 supporting items to be stated as a hypothesis

function favourability(value: any, direction: any): number | null {
  if (!isNum(value)) return null;
  return direction === "LOWER_IS_BETTER" ? r4(1 - value) : r4(value);
}

/* realizedOf(m) — the grade used for learning: the validated grade when the VALIDATE_CRITERIA record exists and is bound
 * to the experiment; otherwise the experiment outcome, explicitly marked as NOT yet validated. */
function realizedOf(m: any): any {
  const r = isObj(m.realized) ? m.realized : {};
  if (typeof r.validatedGrade === "string" && r.validationBound === true) return { grade: r.validatedGrade, basis: "VALIDATED (VALIDATE_CRITERIA record bound to the experiment sha)", validated: true };
  if (typeof r.experimentOutcome === "string") return { grade: r.experimentOutcome, basis: r.validatedGrade == null ? "EXPERIMENT_OUTCOME_ONLY — VALIDATE_CRITERIA PENDING (pre-registered rule grade, not the independent validation)" : "EXPERIMENT_OUTCOME_ONLY — validation record present but NOT bound to this experiment", validated: false };
  return { grade: "NOT_MEASURED", basis: "no committed outcome", validated: false };
}

/**
 * learnFromOutcomes(missions) — missions: [{ id, selection:{ basis, registerCommit, decision, rank, rankN, evidenceScore,
 *   uncertainty, upperBound, uncertaintyMax, criteria:{name:{status,value,rule,direction}}, atRunHead:{commit, decision,
 *   selected, itemEvidenceScore, itemUncertainty, itemRank} , source }, contract:{ sha256, bound, question, passRule,
 *   hypothesis, refutedIf, parent, parentStatus, source }, realized:{ experimentOutcome, validatedGrade, validationBound,
 *   lesson, source }, dispatch:{ by, goSelect, goStrategic, dispatched, ownerRecord, source } }]
 * -> frozen learning record (deterministic: same input ⇒ byte-identical JSON).
 */
function learnFromOutcomes(missionsIn: any): any {
  const missions = arr(missionsIn).filter(isObj).slice().sort((a: any, b: any) => String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
  const rows = missions.map((m: any) => {
    const s = isObj(m.selection) ? m.selection : {};
    const rz = realizedOf(m);
    const util = Object.prototype.hasOwnProperty.call(GRADE_UTILITY, rz.grade) ? GRADE_UTILITY[rz.grade] : null;
    const crit = isObj(s.criteria) ? s.criteria : {};
    const names = Object.keys(crit).sort();
    const measured = names.filter((n) => crit[n] && crit[n].status === "MEASURED");
    const c = isObj(m.contract) ? m.contract : {};
    let hypothesisVerdict = "NOT_PASS_RULE_MET";
    if (rz.grade === "PASS") hypothesisVerdict = "PASS_RULE_MET";
    else if (rz.grade === "NOT_MEASURED") hypothesisVerdict = "NOT_MEASURED";
    return {
      id: m.id,
      predicted: {
        selectionBasis: s.basis || "NOT_MEASURED", registerCommit: s.registerCommit || null, registerDecision: s.decision || null,
        evidenceScore: isNum(s.evidenceScore) ? s.evidenceScore : null, uncertainty: isNum(s.uncertainty) ? s.uncertainty : null,
        upperBound: isNum(s.upperBound) ? s.upperBound : null, rank: isNum(s.rank) ? s.rank : null, rankN: isNum(s.rankN) ? s.rankN : null,
        uncertaintyMax: isNum(s.uncertaintyMax) ? s.uncertaintyMax : null,
        criteriaMeasured: measured.length, criteriaNotMeasured: names.length - measured.length,
        criteria: names.map((n) => ({ criterion: n, status: crit[n].status, value: crit[n].status === "MEASURED" ? crit[n].value : null, rule: crit[n].rule || null, direction: crit[n].direction || null, favourability: crit[n].status === "MEASURED" ? favourability(crit[n].value, crit[n].direction) : null })),
        atRunHead: s.atRunHead || null,
        source: s.source || null,
      },
      preRegistered: { contractSha256: c.sha256 || null, contractBoundToExperiment: c.bound === true, question: c.question || null, passRule: c.passRule || null, hypothesis: c.hypothesis || null, refutedIf: c.refutedIf || null, parent: c.parent || null, parentStatus: c.parentStatus || null, verdict: hypothesisVerdict, source: c.source || null },
      realized: { grade: rz.grade, gradeBasis: rz.basis, validated: rz.validated, experimentOutcome: (m.realized || {}).experimentOutcome || null, validatedGrade: (m.realized || {}).validatedGrade || null, utility: util, utilityMapping: "report-only PASS=1 / PARTIAL=0.5 / FAIL=0 (provider-declared; not a selector quantity)", lesson: (m.realized || {}).lesson || null, source: (m.realized || {}).source || null },
      dispatch: m.dispatch || null,
    };
  });

  // per-criterion calibration
  const critNames = Array.from(new Set(rows.flatMap((r: any) => r.predicted.criteria.map((c: any) => c.criterion)))).sort() as string[];
  const perCriterion = critNames.map((name) => {
    const obs = rows.map((r: any) => { const c = r.predicted.criteria.find((x: any) => x.criterion === name); return c ? { mission: r.id, status: c.status, value: c.value, favourability: c.favourability, realized: r.realized.grade } : null; }).filter(Boolean) as any[];
    const meas = obs.filter((o) => o.status === "MEASURED");
    const high = meas.filter((o) => isNum(o.favourability) && o.favourability >= FAVOURABLE_HIGH);
    const highNonPass = high.filter((o) => o.realized !== "PASS" && o.realized !== "NOT_MEASURED").map((o) => o.mission);
    const highPass = high.filter((o) => o.realized === "PASS").map((o) => o.mission);
    const byOutcome: any = {};
    for (const g of ["PASS", "PARTIAL", "FAIL"]) { const xs = meas.filter((o) => o.realized === g && isNum(o.favourability)).map((o) => o.favourability); byOutcome[g] = xs.length ? { n: xs.length, meanFavourability: r4(xs.reduce((a: number, b: number) => a + b, 0) / xs.length) } : { n: 0, meanFavourability: null }; }
    let reading: string;
    if (!meas.length) reading = `NOT_MEASURED on all ${obs.length} items — no calibration possible for this criterion`;
    else if (highNonPass.length >= MIN_SUPPORT && !highPass.length) reading = `HYPOTHESIS (n=${high.length}): predicted-high on ${high.length} item(s) [${high.map((o) => o.mission).join(", ")}], all realized non-PASS ⇒ this criterion did not anticipate success on these items`;
    else if (high.length) reading = `predicted-high on ${high.length} item(s) [${high.map((o) => o.mission).join(", ")}]; realized ${high.map((o) => `${o.mission}=${o.realized}`).join(", ")} — below the ${MIN_SUPPORT}-item support for a hypothesis`;
    else reading = `measured on ${meas.length} item(s), never predicted-high (favourability < ${FAVOURABLE_HIGH})`;
    return { criterion: name, observations: obs, measured: meas.length, notMeasured: obs.length - meas.length, predictedHigh: high.map((o) => o.mission), predictedHighThenNonPass: highNonPass, predictedHighThenPass: highPass, meanFavourabilityByRealized: byOutcome, reading };
  });

  // score vs realized (order association; report-only)
  const scored = rows.filter((r: any) => isNum(r.predicted.evidenceScore) && isNum(r.realized.utility));
  const sp = RC.spearman(scored.map((r: any) => r.predicted.evidenceScore), scored.map((r: any) => r.realized.utility));
  const spU = RC.spearman(scored.filter((r: any) => isNum(r.predicted.uncertainty)).map((r: any) => r.predicted.uncertainty), scored.filter((r: any) => isNum(r.predicted.uncertainty)).map((r: any) => r.realized.utility));
  const groupMean = (basis: string) => { const xs = rows.filter((r: any) => r.predicted.selectionBasis === basis && isNum(r.realized.utility)); return { n: xs.length, items: xs.map((r: any) => r.id), meanUtility: xs.length ? r4(xs.reduce((a: number, r: any) => a + r.realized.utility, 0) / xs.length) : null, meanEvidenceScore: xs.length ? r4(xs.reduce((a: number, r: any) => a + (r.predicted.evidenceScore || 0), 0) / xs.length) : null }; };
  const groups = { REGISTER_SELECTED: groupMean("REGISTER_SELECTED"), NOT_REGISTER_SELECTED: groupMean("NOT_REGISTER_SELECTED") };

  // realized PASS-rate calibration quality (reuse: survivorship-guarded calibrated P)
  const outcomes = rows.filter((r: any) => ["PASS", "PARTIAL", "FAIL"].includes(r.realized.grade)).map((r: any) => ({ type: "graded-mission", outcome: r.realized.grade === "PASS" ? "SUCCESS" : "FAILURE", independentlyVerified: r.realized.validated === true, at: null, missionId: r.id }));
  const passRateCal = NOC.calibrateFromBuildOutcomes(outcomes);

  // findings (deterministic rules; every one a HYPOTHESIS with n + support)
  const findings: any[] = [];
  const graded = rows.filter((r: any) => r.realized.utility !== null);
  const pass = graded.filter((r: any) => r.realized.grade === "PASS");
  findings.push({ id: "OL-1", kind: "CALIBRATION", status: "HYPOTHESIS", n: graded.length, support: graded.map((r: any) => `${r.id}=${r.realized.grade}`),
    statement: `${pass.length}/${graded.length} graded items reached PASS by their pre-registered rule (${graded.filter((r: any) => r.realized.validated).length} validated, ${graded.filter((r: any) => !r.realized.validated).length} experiment-outcome only); the selector produced no probability of PASS for any of them, so this rate cannot be compared to a predicted rate — only to the ordering below` });
  const drift = rows.filter((r: any) => r.predicted.selectionBasis === "REGISTER_SELECTED" && r.predicted.atRunHead && r.predicted.atRunHead.selected !== r.id);
  if (drift.length) findings.push({ id: "OL-2", kind: "SELECTION_ERROR", status: "HYPOTHESIS", n: rows.filter((r: any) => r.predicted.selectionBasis === "REGISTER_SELECTED").length, support: drift.map((r: any) => `${r.id}: selected at ${r.predicted.registerCommit}; at run head ${r.predicted.atRunHead.commit} the register decided ${r.predicted.atRunHead.decision} (${r.predicted.atRunHead.selected || "no selection"})`),
    statement: `selection drift: ${drift.length} register-selected item(s) were no longer the register's selection when executed — the run executed an earlier selection, not the current one` });
  const notReg = rows.filter((r: any) => r.predicted.selectionBasis === "NOT_REGISTER_SELECTED");
  if (notReg.length) findings.push({ id: "OL-3", kind: "SELECTION_ERROR", status: "HYPOTHESIS", n: rows.length, support: notReg.map((r: any) => `${r.id}: evidenceScore ${r.predicted.evidenceScore}, uncertainty ${r.predicted.uncertainty} (max ${r.predicted.uncertaintyMax}), rank ${r.predicted.rank}/${r.predicted.rankN}; dispatched via ${(r.dispatch || {}).ownerRecord || "owner decision"}`),
    statement: `${notReg.length}/${rows.length} executed items were never the register's selection (owner order/selection over a register choice that was not actionable) — the register's own pick was not what ran` });
  const goRuns = rows.filter((r: any) => r.dispatch && r.dispatch.by === "ODG_GO");
  const goMismatch = goRuns.filter((r: any) => r.dispatch.goStrategic !== r.id);
  const byOwner = goRuns.filter((r: any) => typeof r.dispatch.actionableResolvedBy === "string" && /OWNER/.test(r.dispatch.actionableResolvedBy));
  if (goRuns.length) findings.push({ id: "OL-4", kind: "SELECTION_ERROR", status: "HYPOTHESIS", n: goRuns.length, support: goRuns.map((r: any) => `${r.id}: GO strategic SELECT = ${r.dispatch.goStrategicDecision}${r.dispatch.goStrategic ? ` ${r.dispatch.goStrategic}` : ""}; actionable = ${r.dispatch.goActionable}${r.dispatch.actionableResolvedBy ? ` (resolved by ${r.dispatch.actionableResolvedBy})` : " (GO actionable rule)"}; dispatched ${r.dispatch.dispatched}`),
    statement: `in ${goMismatch.length}/${goRuns.length} GO-dispatched runs the strategic selection was not the dispatched mission; the dispatched mission was the ACTIONABLE selection, resolved by an owner decision in ${byOwner.length}/${goRuns.length} — what ran was decided by actionability + owner order, not by the evidence score` });
  if (sp.ok) findings.push({ id: "OL-5", kind: "BIAS", status: "HYPOTHESIS", n: sp.n, support: scored.map((r: any) => `${r.id}: score ${r.predicted.evidenceScore} → ${r.realized.grade}`),
    statement: `evidenceScore vs realized utility: Spearman ρ = ${sp.rho === null ? "UNDEFINED" : sp.rho} (${sp.strength}, n=${sp.n}); register-selected mean utility ${groups.REGISTER_SELECTED.meanUtility} (mean score ${groups.REGISTER_SELECTED.meanEvidenceScore}) vs not-register-selected ${groups.NOT_REGISTER_SELECTED.meanUtility} (mean score ${groups.NOT_REGISTER_SELECTED.meanEvidenceScore}) — ${groups.REGISTER_SELECTED.meanUtility !== null && groups.REGISTER_SELECTED.meanUtility === groups.NOT_REGISTER_SELECTED.meanUtility ? `a ${groups.NOT_REGISTER_SELECTED.meanEvidenceScore ? r4((groups.REGISTER_SELECTED.meanEvidenceScore || 0) / groups.NOT_REGISTER_SELECTED.meanEvidenceScore) + "×" : "different"} mean score was followed by the SAME mean realized utility: on these items the score did not separate outcomes` : "the score order and the realized order are compared above; n is too small to call it a separation"}` });
  for (const pc of perCriterion) if (pc.predictedHighThenNonPass.length >= MIN_SUPPORT && !pc.predictedHighThenPass.length)
    findings.push({ id: `OL-6-${pc.criterion}`, kind: "BIAS", status: "HYPOTHESIS", n: pc.predictedHigh.length, support: pc.predictedHighThenNonPass, statement: `criterion ${pc.criterion}: ${pc.reading}` });
  const nmShare = rows.filter((r: any) => isNum(r.predicted.uncertainty));
  if (nmShare.length) { const atCap = nmShare.filter((r: any) => isNum(r.predicted.uncertaintyMax) && r.predicted.uncertainty >= r.predicted.uncertaintyMax);
    findings.push({ id: "OL-7", kind: "BIAS", status: "HYPOTHESIS", n: nmShare.length, support: nmShare.map((r: any) => `${r.id}: uncertainty ${r.predicted.uncertainty}, ${r.predicted.criteriaNotMeasured}/${r.predicted.criteriaMeasured + r.predicted.criteriaNotMeasured} criteria NOT_MEASURED`),
      statement: `${atCap.length}/${nmShare.length} executed items had uncertainty at or above the selector's uncertaintyMax at selection time — most of the predicted benefit was unmeasured, so the prediction was weak by construction (the unmeasured share, not the measured values, dominates)` }); }
  const children = rows.filter((r: any) => r.preRegistered.parent);
  if (children.length) findings.push({ id: "OL-8", kind: "SELECTION_ERROR", status: "HYPOTHESIS", n: children.length, support: children.map((r: any) => `${r.id} (parent ${r.preRegistered.parent}, parent status ${r.preRegistered.parentStatus || "NOT_MEASURED"}) → ${r.realized.grade}`),
    statement: `${children.filter((r: any) => r.realized.grade !== "PASS").length}/${children.length} re-attempts of a non-PASS parent also ended non-PASS — a re-attempt did not carry a measured reason to expect a different outcome` });

  return freeze({
    schema: "ODG_V175_OUTCOME_LEARNING/1",
    feedsScoring: false,
    feedsScoringNote: "NOT fed into the selector — weights, criteria, thresholds and register scoring are unchanged; consumption needs a separate, independently-inspected change",
    constants: { gradeUtility: GRADE_UTILITY, favourableHigh: FAVOURABLE_HIGH, minSupport: MIN_SUPPORT, note: "provider-declared, report-only; not selector parameters" },
    n: rows.length,
    items: rows,
    perCriterion,
    scoreVsOutcome: { evidenceScoreSpearman: sp, uncertaintySpearman: spU, groups, note: "evidenceScore is a weighted sum, NOT a probability ⇒ no Brier/ECE; ORDER association only, n tiny ⇒ report-only" },
    passRateCalibration: { reused: "odg-native-outcome-calibration.calibrateFromBuildOutcomes", quality: passRateCal.quality, observations: passRateCal.observations, successes: passRateCal.successes, failures: passRateCal.failures, pForPlanner: passRateCal.pForPlanner },
    findings,
    honesty: [
      `n = ${rows.length}: every finding is a HYPOTHESIS with its supporting items, never a proven effect`,
      "NOT_MEASURED criteria are counted, never imputed; a PENDING validation is never presented as the validated grade",
      "evidenceScore is not a probability; no calibration metric that assumes one is computed",
      "this record does not change selection; it only reports",
    ],
  });
}

const OUTCOME_LEARNING_CONTRACT = freeze({ module: "odg-outcome-learning", pure: true, feedsScoring: false, reuses: ["odg-rank-correlation.spearman", "odg-native-outcome-calibration.calibrateFromBuildOutcomes"] });

module.exports = { learnFromOutcomes, realizedOf, favourability, CLOSED_MISSIONS, GRADE_UTILITY, FAVOURABLE_HIGH, MIN_SUPPORT, OUTCOME_LEARNING_CONTRACT };
export {};
