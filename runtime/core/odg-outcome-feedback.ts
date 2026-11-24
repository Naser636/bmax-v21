#!/usr/bin/env node
"use strict";
/*
 * V17.6 (owner CTO directive « V176 : DÉBLOCAGE FINAL », 2026-11-24, item 3) — OUTCOME FEEDBACK ON SCORES (OFB-1).
 * Owner quote (verbatim): « Rétroaction des résultats sur les scores : j'autorise désormais son développement et son
 * activation contrôlée. Utiliser uniquement des résultats mesurés et attribuables, conserver l'historique des scores, rendre
 * les changements traçables et réversibles. Ne jamais transformer une hypothèse ou une simulation en preuve réelle. »
 * Owner record (path): docs/odg/V176_OWNER_DIRECTIVE_DEBLOCAGE_FINAL.json.
 *
 * PURE + deterministic. NOT a second scorer: the score is still mission-priority-selector.scoreExplained; this module only
 *   (1) ADMITS measured + attributable closure grades (OFB-ADM-1) and refuses everything else (PROBE / simulation / fixture /
 *       hypothesis / un-inspected / unbound / NOT_MEASURED grade / no selection-time prediction) — refusals are reported;
 *   (2) computes a per-criterion ATTRIBUTION adjustment (OFB-CAL-2; replaces the rejected base-rate rule OFB-CAL-1 of #994's
 *       first head): a criterion is adjusted ONLY when its selection-time favourability VARIES across the admitted items AND its
 *       Spearman rank correlation ρ with the realized grade utility (odg-rank-correlation.spearman, tie-correct) is MEASURED
 *       with |ρ| ≥ RHO_MIN over n ≥ MIN_N items; multiplier = 1 + CAP·ρ (sign = direction, magnitude ≤ CAP); anything else ⇒
 *       multiplier 1 with reason NOT_ATTRIBUTABLE (constant values / no measured association / below min n), reported;
 *   (3) states whether the layer is ACTIVE (OFB-ACT-1): OFF by default; ON only through a committed activation record that
 *       quotes the owner verbatim and is bound to the sha256 of the very adjustments it activates; any mismatch ⇒ OFF;
 *   (4) hands the selector the multipliers ONLY when active (selectorOptions) — the base score is kept next to the adjusted
 *       one in every breakdown (baseContribution, multiplier) and every change is recorded in an append-only history.
 * ROLLBACK (OFB-RB-1): set `active: false` in the activation record (one flag, one record) ⇒ the selector receives no
 * multipliers ⇒ the strategic register is byte-identical to the base register (tested).
 * HONESTY: a multiplier needs a measured, signed rank association over a handful of graded items; it is an ORDER association,
 * not causation or significance, and they never change a criterion's status (NOT_MEASURED stays NOT_MEASURED: the
 * multiplier only scales MEASURED contributions). Constants were declared by the technical provider (Claude Code) before
 * the first computation; ODG applies them mechanically; the owner may replace them.
 *
 * REUSE: odg-outcome-learning.GRADE_UTILITY + favourability (same report-only mapping), odg-authorization-scope.canon (sha
 * binding). Dual export.
 */
const crypto = require("crypto");
const OL = require("./odg-outcome-learning.js");
const RC = require("./odg-rank-correlation.js");
const AS = require("./odg-authorization-scope.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function isNum(v: any): boolean { return typeof v === "number" && Number.isFinite(v); }
function r4(n: number): number { return Number(n.toFixed(4)); }
function sha256(s: string): string { return crypto.createHash("sha256").update(s).digest("hex"); }
function deepFreeze(o: any): any { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(o[k]); } return o; }

const FEEDBACK_VERSION = "OFB-1";
const MIN_N = 5;     // minimum admitted observations of a criterion before any adjustment (declared before the first run)
const CAP = 0.2;     // multiplier ∈ [1 − CAP, 1 + CAP] (declared before the first run)
const RHO_MIN = 0.5; // minimum |Spearman ρ| for an association to count as attributable (OFB-CAL-2, declared before its first run)
const OWNER_RECORD = "docs/odg/V176_OWNER_DIRECTIVE_DEBLOCAGE_FINAL.json";
const OWNER_QUOTE = "Rétroaction des résultats sur les scores : j'autorise désormais son développement et son activation contrôlée. Utiliser uniquement des résultats mesurés et attribuables, conserver l'historique des scores, rendre les changements traçables et réversibles. Ne jamais transformer une hypothèse ou une simulation en preuve réelle.";
const ACTIVATION_REL = "docs/odg/V176_OUTCOME_FEEDBACK_ACTIVATION.json";
const LAYER_REL = "docs/odg/evidence/V176_OUTCOME_FEEDBACK.json";
const HISTORY_REL = "docs/odg/evidence/V176_OUTCOME_FEEDBACK_HISTORY.jsonl";
const ACTIVATION_SCHEMA = "odg-outcome-feedback-activation/1";
const LAYER_SCHEMA = "ODG_V176_OUTCOME_FEEDBACK/1";
const VALIDATION_SCHEMA = "odg-criteria-validation/1";
const GRADED = Object.freeze(["PASS", "PARTIAL", "FAIL"]);
/* words that mark a record as NOT a real measured result; matched on identity fields only (path, schema, label, kind, basis) */
const NON_REAL_RE = /PROBE|SIMULAT|FIXTURE|HYPOTHES|SYNTHETIC|MOCK|DRY[-_ ]?RUN|PREDICT/i;
const SID = /^[A-Za-z0-9._:-]{8,128}$/;

const RULES = deepFreeze({
  "OFB-ADM-1": "an outcome is ADMITTED iff (a) the register item is CLOSE-1 closed with grade PASS|PARTIAL|FAIL (CLOSED_NOT_MEASURED ⇒ refused); (b) its criteria-validation record has schema odg-criteria-validation/1, names the item, grades it with the SAME grade, and is bound to the closure's contract sha256 AND experiment sha256; (c) the record carries an independent inspection ACCEPT (experimentInspection.verdict ACCEPT, distinct opaque inspectorSessionId / authorSessionId); (d) neither the validation nor the experiment record is a PROBE / simulation / fixture / hypothesis / synthetic / mock / dry-run / prediction (identity fields path, schema, label, kind, basis; or a true simulated/probe/fixture/hypothesis flag); (e) a selection-time prediction is attributable (register criteria read from committed git history, with a source pointer). Anything else is REFUSED with its reason and never used",
  "OFB-PRED-1": "the prediction of an admitted item is the register's criteria AT SELECTION TIME — odg-v175-outcome-learning gatherSelection over the committed history of V164_STRATEGIC_REGISTER.json up to the experiment's run head (the same rule the V17.5 outcome-learning record uses); favourability = value (HIGHER_IS_BETTER) or 1 − value (LOWER_IS_BETTER), only for MEASURED criteria",
  "OFB-CAL-2": `per criterion c: obs = admitted items where c was MEASURED at selection time, x = favourability (value, or 1 − value when LOWER_IS_BETTER), y = realized utility PASS=1 / PARTIAL=0.5 / FAIL=0 (odg-outcome-learning.GRADE_UTILITY). Adjusted ONLY IF (i) n ≥ ${MIN_N}, (ii) x is not constant (non-zero variance), (iii) ρ = odg-rank-correlation.spearman(x, y) is defined (y not constant) and (iv) |ρ| ≥ ${RHO_MIN}; then multiplier = round4(1 + ${CAP}·ρ) ∈ [${1 - CAP}, ${1 + CAP}] (ρ > 0: higher predicted favourability preceded better grades ⇒ the criterion's contributions are raised; ρ < 0 ⇒ lowered). Otherwise multiplier 1, status NOT_ATTRIBUTABLE with the failing condition. Supersedes OFB-CAL-1 (base-rate level shift = mean favourability − mean utility), REJECTED at inspection because it adjusted criteria whose values carry no information about the grade. ρ over n ≈ 5 is an ORDER association on these items, not causation and not significance`,
  "OFB-APPLY-1": "when ACTIVE, mission-priority-selector.scoreExplained multiplies each MEASURED criterion contribution by its multiplier (absent ⇒ 1); NOT_MEASURED criteria still contribute 0 and their full weight to uncertainty (never imputed); every breakdown row keeps baseContribution + multiplier and every ranked row keeps baseEvidenceScore + scoreDelta; thresholds, weights, criteria values, statuses, eligibility and the secondary rules are unchanged",
  "OFB-ACT-1": `OFF by default. ACTIVE iff the committed activation record (${ACTIVATION_REL}) has schema ${ACTIVATION_SCHEMA}, active === true, feedbackVersion ${FEEDBACK_VERSION}, the owner quote VERBATIM, ownerRecord ${OWNER_RECORD} (when that file is present on the tree it must contain the quote, else OFF), and adjustmentsSha256 equal to sha256(canon(adjustments)) of the layer being applied; any other state ⇒ OFF with its reason`,
  "OFB-RB-1": "rollback = set active:false in the activation record (and append a DEACTIVATE history entry): the selector then receives no multipliers and the strategic register is byte-identical to the base register; a new set of adjustments (e.g. a new graded item) is NEVER applied until a new activation record binds its sha",
  "OFB-HIST-1": `${HISTORY_REL} is append-only JSON lines, hash-chained (prevSha256 = sha256 of the previous line); every ACTIVATE / DEACTIVATE appends the adjustments sha, the multipliers, the base and adjusted score of every ranked item and the strategic + actionable decisions before/after; earlier lines are never rewritten`,
});

/* nonRealMarker(rec, path) — the first identity field that marks a record as not a real measured result, or null. */
function nonRealMarker(rec: any, p: any): string | null {
  if (typeof p === "string" && NON_REAL_RE.test(p)) return `path ${p}`;
  if (!isObj(rec)) return null;
  for (const k of ["schema", "label", "kind", "basis"]) if (typeof rec[k] === "string" && NON_REAL_RE.test(rec[k])) return `${k} "${rec[k]}"`;
  for (const k of ["simulated", "simulation", "probe", "fixture", "hypothesis", "synthetic"]) if (rec[k] === true) return `${k}: true`;
  return null;
}

/*
 * admitOutcome(o) — o: { id, item (register item), validation:{path,data}|null, experiment:{path,data}|null,
 *   prediction:{ basis, criteria:{name:{status,value,direction}}, source }|null } → { admitted, reason, grade?, utility? }.
 */
function admitOutcome(o: any): any {
  const no = (reason: string) => ({ id: o && o.id, admitted: false, reason });
  if (!isObj(o) || typeof o.id !== "string") return no("malformed outcome");
  // (d) first: a probe / simulation / fixture / hypothesis is refused whatever else it carries
  const v0 = isObj(o.validation) ? o.validation : null, e0 = isObj(o.experiment) ? o.experiment : null;
  for (const [what, rec] of [["validation", v0], ["experiment", e0]] as any) { const m = rec ? nonRealMarker(rec.data, rec.path) : null; if (m) return no(`${what} record is not a real measured result (${m}) — a probe / simulation / fixture / hypothesis is never admitted`); }
  const it = o.item;
  if (!isObj(it)) return no("no register item");
  const cl = isObj(it.closure) ? it.closure : null;
  if (!cl || cl.closed !== true || cl.rule !== "CLOSE-1") return no(`not closed by CLOSE-1 (status ${it.status}) — no measured closure grade`);
  if (!GRADED.includes(String(cl.grade))) return no(`closure grade ${cl.grade} is not a measured grade (PASS|PARTIAL|FAIL)`);
  const v = isObj(o.validation) ? o.validation : null, vd = v && isObj(v.data) ? v.data : null;
  if (!vd) return no("criteria-validation record absent");
  const e = isObj(o.experiment) ? o.experiment : null, ed = e && isObj(e.data) ? e.data : null;
  if (vd.schema !== VALIDATION_SCHEMA) return no(`validation schema ${vd.schema} ≠ ${VALIDATION_SCHEMA}`);
  if (vd.scenario !== o.id) return no(`validation names ${vd.scenario}, not ${o.id}`);
  if (vd.scenarioGrade !== cl.grade) return no(`validation grade ${vd.scenarioGrade} ≠ closure grade ${cl.grade}`);
  if (vd.contractSha256 !== cl.contractSha256) return no("validation not bound to the closure's contract sha256");
  if (!isObj(vd.experimentEvidence) || vd.experimentEvidence.experimentSha256 !== cl.experimentSha256) return no("validation not bound to the closure's experiment sha256");
  if (!ed) return no("experiment record absent");
  const ins = vd.experimentInspection;
  if (!isObj(ins) || ins.verdict !== "ACCEPT") return no(`no independent inspection ACCEPT (${isObj(ins) ? ins.verdict : "absent"})`);
  if (!SID.test(String(ins.inspectorSessionId || "")) || !SID.test(String(ins.authorSessionId || "")) || ins.inspectorSessionId === ins.authorSessionId) return no("inspection lacks distinct opaque inspector/author session ids (not independent)");
  const pr = isObj(o.prediction) ? o.prediction : null;
  if (!pr || !isObj(pr.criteria) || pr.basis === "NOT_MEASURED" || !arr(pr.source).length) return no(`no attributable selection-time prediction (${pr ? pr.source || pr.basis : "absent"})`);
  return { id: o.id, admitted: true, reason: "OFB-ADM-1 (a)–(e) hold", grade: cl.grade, utility: OL.GRADE_UTILITY[cl.grade] };
}

/*
 * computeAdjustments(outcomes, criteria) — outcomes: admitOutcome inputs; criteria: [{name, direction}] (the register's
 * CRITERIA). Returns { admitted, refused, perCriterion, multipliers, adjustmentsSha256 }. Deterministic (sorted by id).
 */
function computeAdjustments(outcomesIn: any, criteriaIn: any): any {
  const outcomes = arr(outcomesIn).filter(isObj).slice().sort((a: any, b: any) => String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
  const verdicts = outcomes.map((o: any) => ({ o, v: admitOutcome(o) }));
  const admitted = verdicts.filter((x: any) => x.v.admitted);
  const refused = verdicts.filter((x: any) => !x.v.admitted).map((x: any) => ({ id: x.v.id, reason: x.v.reason, validation: x.o && x.o.validation ? x.o.validation.path || null : null }));
  const criteria = arr(criteriaIn).filter((c: any) => isObj(c) && typeof c.name === "string").map((c: any) => ({ name: c.name, direction: c.direction === "LOWER_IS_BETTER" ? "LOWER_IS_BETTER" : "HIGHER_IS_BETTER" })).sort((a: any, b: any) => a.name < b.name ? -1 : 1);
  const perCriterion = criteria.map((c: any) => {
    const obs = admitted.map(({ o, v }: any) => {
      const pc = o.prediction.criteria[c.name];
      if (!isObj(pc) || pc.status !== "MEASURED" || !isNum(pc.value)) return null;
      return { item: o.id, predictedValue: pc.value, favourability: OL.favourability(pc.value, c.direction), grade: v.grade, utility: v.utility };
    }).filter(Boolean) as any[];
    const n = obs.length;
    const notMeasuredOn = admitted.filter(({ o }: any) => !(isObj(o.prediction.criteria[c.name]) && o.prediction.criteria[c.name].status === "MEASURED")).map(({ o }: any) => o.id);
    const xs = obs.map((x) => x.favourability), ys = obs.map((x) => x.utility);
    const common = { criterion: c.name, direction: c.direction, n, minN: MIN_N, rhoMin: RHO_MIN, meanFavourability: n ? r4(xs.reduce((a, b) => a + b, 0) / n) : null, meanUtility: n ? r4(ys.reduce((a, b) => a + b, 0) / n) : null, observations: obs, notMeasuredOn, rule: "OFB-CAL-2" };
    const na = (why: string, reading: string, rho: any = null) => ({ ...common, status: "NOT_ATTRIBUTABLE", why, multiplier: 1, spearman: rho, reading });
    if (n === 0) return na("NO_MEASURED_PREDICTION", "never MEASURED at selection time on an admitted item ⇒ no attribution, ×1");
    if (n < MIN_N) return na("BELOW_MIN_N", `${n} observation(s) < MIN_N ${MIN_N} ⇒ ×1 (reported, not applied)`);
    if (xs.every((x) => x === xs[0])) return na("CONSTANT_VALUES", `selection-time favourability is ${xs[0]} on all ${n} items ⇒ it carries no information about the grade ⇒ ×1`);
    const sp = RC.spearman(xs, ys);
    const rho = sp && sp.ok ? sp.rho : null;
    if (rho === null) return na("NO_MEASURED_ASSOCIATION", `Spearman ρ undefined (${sp && sp.note ? sp.note : "not computable"}) ⇒ ×1`, sp);
    if (Math.abs(rho) < RHO_MIN) return na("NO_MEASURED_ASSOCIATION", `Spearman ρ = ${rho} (|ρ| < ${RHO_MIN}) between predicted favourability and realized utility on these ${n} items ⇒ no attributable association ⇒ ×1`, sp);
    const m = r4(1 + CAP * rho);
    return { ...common, status: "ADJUSTED", why: "ATTRIBUTED", multiplier: m, spearman: sp, reading: `Spearman ρ = ${rho} (n=${n}): ${rho > 0 ? "higher" : "lower"} predicted favourability preceded better grades ⇒ contributions ×${m}` };
  });
  const multipliers: any = {};
  for (const pc of perCriterion) if (pc.status === "ADJUSTED") multipliers[pc.criterion] = pc.multiplier;
  const adjustments = { feedbackVersion: FEEDBACK_VERSION, calibrationRule: "OFB-CAL-2", minN: MIN_N, cap: CAP, rhoMin: RHO_MIN, admitted: admitted.map(({ o, v }: any) => ({ id: o.id, grade: v.grade, utility: v.utility, validation: o.validation.path, experiment: o.experiment.path, closureRule: "CLOSE-1", predictionSource: o.prediction.source, predictionBasis: o.prediction.basis })), multipliers };
  return deepFreeze({ admitted: adjustments.admitted, refused, perCriterion, multipliers, adjustmentsSha256: sha256(AS.canon(adjustments)), adjustmentsCanonical: adjustments });
}

/* adjustmentsShaOf(layer) — recompute the bound sha from a layer's canonical adjustments block (null when malformed). */
function adjustmentsShaOf(layer: any): string | null { return isObj(layer) && isObj(layer.adjustmentsCanonical) ? sha256(AS.canon(layer.adjustmentsCanonical)) : null; }

/*
 * activationState(activation, layer, ownerRecordText) — OFB-ACT-1. activation: parsed activation record or null; layer:
 * { adjustmentsSha256, adjustmentsCanonical } (computed or committed); ownerRecordText: the owner record's text or null
 * (absent on this tree). → { active, reason, ownerRecordStatus, boundSha256 }.
 */
function activationState(activation: any, layer: any, ownerRecordText: any): any {
  const off = (reason: string, extra: any = {}) => deepFreeze({ active: false, reason, ...extra });
  if (!isObj(activation)) return off("no activation record ⇒ OFF (default)");
  if (activation.schema !== ACTIVATION_SCHEMA) return off(`activation schema ${activation.schema} ≠ ${ACTIVATION_SCHEMA}`);
  if (activation.feedbackVersion !== FEEDBACK_VERSION) return off(`activation feedbackVersion ${activation.feedbackVersion} ≠ ${FEEDBACK_VERSION}`);
  const od = isObj(activation.ownerDirective) ? activation.ownerDirective : {};
  if (od.quote !== OWNER_QUOTE) return off("activation record does not carry the owner quote verbatim");
  if (od.record !== OWNER_RECORD) return off(`activation cites ${od.record}, not ${OWNER_RECORD}`);
  let ownerRecordStatus: string;
  if (typeof ownerRecordText === "string") {
    if (!ownerRecordText.includes(OWNER_QUOTE)) return off(`owner record ${OWNER_RECORD} is present but does not contain the quote ⇒ OFF`, { ownerRecordStatus: "PRESENT_QUOTE_MISMATCH" });
    ownerRecordStatus = "PRESENT_QUOTE_MATCH";
  } else ownerRecordStatus = "ABSENT_ON_THIS_TREE (cited by path; activation rests on the verbatim quote transcribed in the activation record)";
  if (activation.active !== true) return off("activation record active:false ⇒ OFF (rollback, OFB-RB-1)", { ownerRecordStatus });
  const layerSha = adjustmentsShaOf(layer);
  if (!layerSha || !isObj(layer) || layer.adjustmentsSha256 !== layerSha) return off("feedback layer malformed or its adjustmentsSha256 does not match its own adjustments", { ownerRecordStatus });
  if (activation.adjustmentsSha256 !== layerSha) return off(`activation bound to adjustments ${String(activation.adjustmentsSha256).slice(0, 12)}… but the layer's adjustments are ${layerSha.slice(0, 12)}… ⇒ OFF until a new activation binds them (OFB-RB-1)`, { ownerRecordStatus });
  return deepFreeze({ active: true, reason: `ACTIVE — activation record bound to adjustments ${layerSha.slice(0, 12)}…, owner quote verbatim`, ownerRecordStatus, boundSha256: layerSha });
}

/* selectorOptions(base, feedback) — base selector options, plus scoreMultipliers ONLY when feedback.state.active. */
function selectorOptions(base: any, feedback: any): any {
  const b = isObj(base) ? base : {};
  if (!isObj(feedback) || !isObj(feedback.state) || feedback.state.active !== true || !isObj(feedback.multipliers)) return b;
  if (!Object.values(feedback.multipliers).some((m: any) => m !== 1)) return b;   // active but no criterion attributable ⇒ base (byte-identical)
  return { ...b, scoreMultipliers: feedback.multipliers, scoreAdjustmentProvenance: { rule: "OFB-APPLY-1", feedbackVersion: FEEDBACK_VERSION, adjustmentsSha256: feedback.state.boundSha256, activationRecord: ACTIVATION_REL, layerRecord: LAYER_REL, history: HISTORY_REL } };
}

/* scoreTable(baseDecision, adjustedDecision) — per ranked item: base, adjusted, delta (history of scores). */
function scoreTable(baseD: any, adjD: any): any[] {
  const adj = new Map(arr(adjD && adjD.ranking).map((r: any) => [r.id, r]));
  return arr(baseD && baseD.ranking).map((r: any) => { const a: any = adj.get(r.id); const as = a ? a.evidenceScore : null; return { id: r.id, baseScore: r.evidenceScore, adjustedScore: as, delta: as === null ? null : r4(as - r.evidenceScore), uncertainty: r.uncertainty }; }).sort((x: any, y: any) => x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
}

/* decisionSummary(d) — the comparable part of a selector decision. */
function decisionSummary(d: any): any {
  if (!isObj(d)) return null;
  const top = arr(d.ranking).filter((r: any) => r.autoSelectable).slice(0, 3).map((r: any) => ({ id: r.id, evidenceScore: r.evidenceScore, uncertainty: r.uncertainty }));
  return { decision: d.decision, selected: d.selected ? d.selected.id : null, proposed: d.proposed ? d.proposed.id : null, tiedSet: arr(d.tiedSet), resolvedBy: d.resolvedBy || null, top3AutoSelectable: top };
}

/* historyEntry(prevLine, fields) — the next hash-chained OFB-HIST-1 line (JSON text without trailing newline). */
function historyEntry(prevLine: string | null, seq: number, fields: any): string {
  return JSON.stringify({ seq, prevSha256: prevLine ? sha256(prevLine) : null, ...fields });
}
/* verifyHistory(text) — OFB-HIST-1 chain check → { ok, entries, reason }. */
function verifyHistory(text: any): any {
  const lines = String(typeof text === "string" ? text : "").split("\n").filter((l) => l.trim());
  const entries: any[] = [];
  let prev: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    let e: any; try { e = JSON.parse(lines[i]); } catch { return { ok: false, entries, reason: `line ${i + 1} is not JSON` }; }
    if (e.seq !== i + 1) return { ok: false, entries, reason: `line ${i + 1} seq ${e.seq} ≠ ${i + 1}` };
    if (e.prevSha256 !== (prev ? sha256(prev) : null)) return { ok: false, entries, reason: `line ${i + 1} prevSha256 does not chain to line ${i}` };
    if (e.action !== "ACTIVATE" && e.action !== "DEACTIVATE") return { ok: false, entries, reason: `line ${i + 1} action ${e.action} unknown` };
    entries.push(e); prev = lines[i];
  }
  return { ok: true, entries, reason: `${entries.length} chained entr${entries.length === 1 ? "y" : "ies"}` };
}

const OUTCOME_FEEDBACK_CONTRACT = deepFreeze({
  id: "V176-OUTCOME-FEEDBACK", version: FEEDBACK_VERSION, source: `owner CTO directive « V176 : DÉBLOCAGE FINAL » item 3 (${OWNER_RECORD})`,
  composes: ["mission-priority-selector.scoreExplained (scoreMultipliers option — the SAME scorer)", "odg-outcome-learning.GRADE_UTILITY/favourability", "odg-v175-outcome-learning.gatherSelection (selection-time prediction)", "odg-strategic-register CLOSE-1 closures"],
  invariants: [
    "only CLOSE-1 grades backed by an independently-inspected, sha-bound criteria-validation record are admitted; PROBE / simulation / fixture / hypothesis records are refused and listed",
    `a criterion is adjusted only when its selection-time values vary AND |Spearman ρ| with the realized utility ≥ ${RHO_MIN} over n ≥ ${MIN_N} (OFB-CAL-2); else ×1 NOT_ATTRIBUTABLE; every multiplier ∈ [${1 - CAP}, ${1 + CAP}]`,
    "the adjusted evidence score and upper bound are clamped to [0, 1]; no adjustment qualifying ⇒ empty multipliers ⇒ register byte-identical to the base",
    "OFF by default; ON only through a committed activation record quoting the owner and bound to the adjustments sha",
    "base score kept beside the adjusted score; NOT_MEASURED never imputed; statuses / criteria values / thresholds unchanged",
    "rollback (active:false) ⇒ strategic register byte-identical to the base register; history append-only and hash-chained",
  ],
});

module.exports = { FEEDBACK_VERSION, MIN_N, CAP, RHO_MIN, OWNER_RECORD, OWNER_QUOTE, ACTIVATION_REL, LAYER_REL, HISTORY_REL, ACTIVATION_SCHEMA, LAYER_SCHEMA, RULES, NON_REAL_RE, nonRealMarker, admitOutcome, computeAdjustments, adjustmentsShaOf, activationState, selectorOptions, scoreTable, decisionSummary, historyEntry, verifyHistory, sha256, OUTCOME_FEEDBACK_CONTRACT };
if (require.main === module) { process.stdout.write(JSON.stringify(OUTCOME_FEEDBACK_CONTRACT, null, 2) + "\n"); }
export {};
