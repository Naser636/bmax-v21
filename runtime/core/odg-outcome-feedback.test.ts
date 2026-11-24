#!/usr/bin/env node
"use strict";
/* Tests for odg-outcome-feedback (V17.6 OFB-1, owner « V176 : DÉBLOCAGE FINAL » item 3): only measured + attributable
 * closure grades admitted (PROBE / simulated / hypothesis / un-inspected refused), min-n gate, cap, determinism, activation
 * OFF by default + bound to the adjustments sha, the selector consumes multipliers ONLY when active (base kept, NOT_MEASURED
 * never imputed), hash-chained append-only history, and — on the real repo — the committed layer reproduces and a rollback
 * (feedback OFF) yields the byte-identical base register. History-dependent part needs a full clone. */
const fs = require("fs");
const os = require("os");
const path = require("path");
const OFB = require("./odg-outcome-feedback.js");
const SEL = require("./mission-priority-selector.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

const CRIT = [{ name: "a", direction: "HIGHER_IS_BETTER" }, { name: "cost", direction: "LOWER_IS_BETTER" }, { name: "rare", direction: "HIGHER_IS_BETTER" }];
const SIDS = { inspectorSessionId: "inspector-0001", authorSessionId: "author-000001" };
function outcome(id: string, grade: string, pred: any, over: any = {}): any {
  const closure = { closed: true, rule: "CLOSE-1", grade, contractSha256: `c-${id}`, experimentSha256: `e-${id}` };
  const validation = { schema: "odg-criteria-validation/1", scenario: id, scenarioGrade: grade, contractSha256: `c-${id}`, experimentEvidence: { experimentSha256: `e-${id}` }, experimentInspection: { verdict: "ACCEPT", ...SIDS } };
  const criteria: any = {};
  for (const k of Object.keys(pred)) criteria[k] = pred[k] === null ? { status: "NOT_MEASURED", value: null } : { status: "MEASURED", value: pred[k] };
  const o: any = { id, item: { id, status: `CLOSED_${grade}`, closure }, validation: { path: `docs/odg/evidence/V1_${id}_CRITERIA_VALIDATION.json`, data: validation }, experiment: { path: `docs/odg/evidence/V1_${id}_EXPERIMENT.json`, data: { schema: "odg-scenario-experiment/1", run: { head: "x" } } }, prediction: { basis: "REGISTER_SELECTED", criteria, source: [`git show abc:reg#${id}`] } };
  if (over.validation) Object.assign(o.validation.data, over.validation);
  if (over.validationPath) o.validation.path = over.validationPath;
  if (over.experiment) Object.assign(o.experiment.data, over.experiment);
  if (over.closure) Object.assign(o.item.closure, over.closure);
  if (over.prediction !== undefined) o.prediction = over.prediction;
  return o;
}
const five = () => [
  outcome("A", "PASS", { a: 0.5, cost: 0.2, rare: 1 }),
  outcome("B", "FAIL", { a: 0.5, cost: 0.9, rare: null }),
  outcome("C", "PARTIAL", { a: 0.5, cost: 0.9, rare: null }),
  outcome("D", "FAIL", { a: 0.5, cost: 0.9, rare: 1 }),
  outcome("E", "FAIL", { a: 0.5, cost: 0.9, rare: null }),
];

function main(): void {
  // --- admission (OFB-ADM-1) ---
  const probe = outcome("P", "PASS", { a: 1 }, { validationPath: "docs/odg/evidence/V175_NB2_PROBE_1.json" });
  check("a PROBE record (path) is REFUSED, never admitted", OFB.admitOutcome(probe).admitted === false && /not a real measured result/.test(OFB.admitOutcome(probe).reason));
  const probeLabel = outcome("P2", "PASS", { a: 1 }, { experiment: { label: "PROBE (provider-run feasibility probe)" } });
  check("an experiment labelled PROBE is REFUSED", OFB.admitOutcome(probeLabel).admitted === false);
  check("a simulated:true record is REFUSED", OFB.admitOutcome(outcome("S", "PASS", { a: 1 }, { experiment: { simulated: true } })).admitted === false);
  check("a hypothesis schema record is REFUSED", OFB.admitOutcome(outcome("Hy", "PASS", { a: 1 }, { validation: { schema: "odg-hypothesis/1" } })).admitted === false);
  check("a fixture-path record is REFUSED", OFB.admitOutcome(outcome("F", "PASS", { a: 1 }, { validationPath: "runtime/core/__fixtures__/x.json" })).admitted === false);
  check("inspection verdict REJECT ⇒ REFUSED", OFB.admitOutcome(outcome("R", "PASS", { a: 1 }, { validation: { experimentInspection: { verdict: "REJECT", ...SIDS } } })).admitted === false);
  check("same inspector/author session ⇒ REFUSED (not independent)", OFB.admitOutcome(outcome("R2", "PASS", { a: 1 }, { validation: { experimentInspection: { verdict: "ACCEPT", inspectorSessionId: "same-session-1", authorSessionId: "same-session-1" } } })).admitted === false);
  check("validation grade ≠ closure grade ⇒ REFUSED (never upgraded)", OFB.admitOutcome(outcome("U", "FAIL", { a: 1 }, { validation: { scenarioGrade: "PASS" } })).admitted === false);
  check("closure grade NOT_MEASURED ⇒ REFUSED", OFB.admitOutcome(outcome("N", "NOT_MEASURED", { a: 1 })).admitted === false);
  check("unbound experiment sha ⇒ REFUSED", OFB.admitOutcome(outcome("X", "PASS", { a: 1 }, { validation: { experimentEvidence: { experimentSha256: "other" } } })).admitted === false);
  check("no attributable selection-time prediction ⇒ REFUSED", OFB.admitOutcome(outcome("Y", "PASS", { a: 1 }, { prediction: { basis: "NOT_MEASURED", criteria: {}, source: ["x"] } })).admitted === false);
  check("a well-formed inspected, bound closure grade is ADMITTED", OFB.admitOutcome(outcome("OK", "PARTIAL", { a: 1 })).admitted === true);

  // --- attribution (OFB-CAL-2): constant ⇒ ×1, measured signed association ⇒ bounded multiplier, min-n, determinism ---
  const withProbe = five().concat([probe]);
  const r = OFB.computeAdjustments(withProbe, CRIT);
  check("PROBE offered alongside real outcomes: listed in refused, absent from admitted", r.refused.some((x: any) => x.id === "P") && !r.admitted.some((x: any) => x.id === "P") && r.admitted.length === 5);
  const pa = r.perCriterion.find((p: any) => p.criterion === "a");
  check("CONSTANT selection-time values (0.5 on all 5) ⇒ NOT_ATTRIBUTABLE ×1 even though mean fav ≠ mean utility (the rejected base-rate shift)", pa.status === "NOT_ATTRIBUTABLE" && pa.why === "CONSTANT_VALUES" && pa.multiplier === 1 && !("a" in r.multipliers));
  const pc = r.perCriterion.find((p: any) => p.criterion === "cost");
  check("varying values + measured positive ρ (0.790569 ≥ RHO_MIN) ⇒ ADJUSTED ×(1 + CAP·ρ) = 1.1581", pc.status === "ADJUSTED" && pc.spearman.rho === 0.790569 && pc.multiplier === 1.1581);
  const pr = r.perCriterion.find((p: any) => p.criterion === "rare");
  check("n = 2 < MIN_N ⇒ NOT_ATTRIBUTABLE BELOW_MIN_N, multiplier 1, not in multipliers", pr.status === "NOT_ATTRIBUTABLE" && pr.why === "BELOW_MIN_N" && pr.multiplier === 1 && !("rare" in r.multipliers) && pr.n === 2);
  const four = OFB.computeAdjustments(five().slice(0, 4), CRIT);
  check("min-n gate: 4 admitted items ⇒ NO criterion adjusted (empty multipliers)", Object.keys(four.multipliers).length === 0 && four.perCriterion.every((p: any) => p.multiplier === 1));
  const G5 = ["FAIL", "FAIL", "PARTIAL", "PARTIAL", "PASS"];
  const pos = OFB.computeAdjustments(G5.map((g, i) => outcome("Q" + i, g, { a: i / 4, cost: 0.5, rare: null })), CRIT);
  const neg = OFB.computeAdjustments(G5.map((g, i) => outcome("Q" + i, g, { a: 1 - i / 4, cost: 0.5, rare: null })), CRIT);
  const pp = pos.perCriterion.find((p: any) => p.criterion === "a"), pn = neg.perCriterion.find((p: any) => p.criterion === "a");
  check("sign determines direction: ρ > 0 ⇒ ×>1, ρ < 0 ⇒ ×<1, symmetric", pp.multiplier > 1 && pn.multiplier < 1 && Number((pp.multiplier + pn.multiplier).toFixed(4)) === 2);
  check("magnitude bounded: every multiplier within [1 − CAP, 1 + CAP]", [r, pos, neg].every((x: any) => Object.values(x.multipliers).every((m: any) => m >= 1 - OFB.CAP && m <= 1 + OFB.CAP)));
  const weak = OFB.computeAdjustments(["FAIL", "PASS", "FAIL", "PASS", "PARTIAL"].map((g, i) => outcome("V" + i, g, { a: i / 4, cost: 0.5, rare: null })), CRIT);
  const pw = weak.perCriterion.find((p: any) => p.criterion === "a");
  check("varying values but |ρ| < RHO_MIN ⇒ NOT_ATTRIBUTABLE NO_MEASURED_ASSOCIATION ×1", pw.status === "NOT_ATTRIBUTABLE" && pw.why === "NO_MEASURED_ASSOCIATION" && Math.abs(pw.spearman.rho) < OFB.RHO_MIN && pw.multiplier === 1);
  const flat = OFB.computeAdjustments([0, 1, 2, 3, 4].map((i) => outcome("K" + i, "FAIL", { a: i / 4, cost: 0.5, rare: null })), CRIT);
  check("constant realized grades ⇒ ρ undefined ⇒ NOT_ATTRIBUTABLE ×1", flat.perCriterion.find((p: any) => p.criterion === "a").why === "NO_MEASURED_ASSOCIATION" && Object.keys(flat.multipliers).length === 0);
  check("no attributable criterion ⇒ selectorOptions returns base even when ACTIVE (byte-identical register)", OFB.selectorOptions({ weights: {} }, { state: { active: true }, multipliers: { a: 1 } }).scoreMultipliers === undefined);
  const r2 = OFB.computeAdjustments(withProbe.slice().reverse(), CRIT);
  check("deterministic: reversed input ⇒ byte-identical result + same adjustments sha", JSON.stringify(r) === JSON.stringify(r2) && r.adjustmentsSha256 === r2.adjustmentsSha256);
  check("NOT_MEASURED predictions are counted as notMeasuredOn, never imputed", pr.notMeasuredOn.join() === "B,C,E" && pr.observations.every((o: any) => typeof o.predictedValue === "number"));

  // --- activation (OFB-ACT-1) ---
  const layer = { adjustmentsSha256: r.adjustmentsSha256, adjustmentsCanonical: r.adjustmentsCanonical };
  const act = { schema: OFB.ACTIVATION_SCHEMA, feedbackVersion: OFB.FEEDBACK_VERSION, active: true, ownerDirective: { record: OFB.OWNER_RECORD, quote: OFB.OWNER_QUOTE }, adjustmentsSha256: r.adjustmentsSha256 };
  check("OFF by default: no activation record ⇒ inactive", OFB.activationState(null, layer, null).active === false);
  check("activation record bound to these adjustments + verbatim quote ⇒ ACTIVE", OFB.activationState(act, layer, null).active === true);
  check("rollback flag active:false ⇒ inactive", OFB.activationState({ ...act, active: false }, layer, null).active === false);
  check("quote not verbatim ⇒ inactive", OFB.activationState({ ...act, ownerDirective: { record: OFB.OWNER_RECORD, quote: OFB.OWNER_QUOTE.replace("Ne jamais", "Ne pas") } }, layer, null).active === false);
  check("activation bound to OTHER adjustments (e.g. a new grade landed) ⇒ inactive until re-bound", OFB.activationState({ ...act, adjustmentsSha256: four.adjustmentsSha256 }, layer, null).active === false);
  check("tampered layer (multipliers edited, sha kept) ⇒ inactive", OFB.activationState(act, { ...layer, adjustmentsCanonical: { ...layer.adjustmentsCanonical, multipliers: { a: 1.2 } } }, null).active === false);
  check("owner record present but without the quote ⇒ inactive", OFB.activationState(act, layer, "{\"quote\":\"something else\"}").active === false);
  check("owner record present with the quote ⇒ ACTIVE, status PRESENT_QUOTE_MATCH", OFB.activationState(act, layer, `{"quote": ["« ${OFB.OWNER_QUOTE} »"]}`).ownerRecordStatus === "PRESENT_QUOTE_MATCH" && OFB.activationState(act, layer, `{"quote": ["« ${OFB.OWNER_QUOTE} »"]}`).active === true);

  // --- selector consumption (OFB-APPLY-1) ---
  const base = { weights: { a: 1, cost: 1, rare: 1 }, directions: { cost: "LOWER_IS_BETTER" } };
  check("inactive ⇒ selectorOptions returns the base options untouched (no scoreMultipliers)", OFB.selectorOptions(base, { state: { active: false }, multipliers: { a: 0.8 } }) === base);
  const on = OFB.selectorOptions(base, { state: OFB.activationState(act, layer, null), multipliers: r.multipliers });
  check("active ⇒ scoreMultipliers + provenance passed", on.scoreMultipliers === r.multipliers && on.scoreAdjustmentProvenance.adjustmentsSha256 === r.adjustmentsSha256);
  const cands = [
    { id: "X1", status: "PARTIAL", deps: [], criteria: { a: { status: "MEASURED", value: 1 }, cost: { status: "MEASURED", value: 0.9 }, rare: { status: "MEASURED", value: 0.1 } } },
    { id: "X2", status: "PARTIAL", deps: [], criteria: { a: { status: "MEASURED", value: 0.2 }, cost: { status: "MEASURED", value: 0.1 }, rare: { status: "MEASURED", value: 0.1 } } },
    { id: "X3", status: "PARTIAL", deps: [], criteria: { a: { status: "NOT_MEASURED", value: null }, cost: { status: "MEASURED", value: 0.5 }, rare: { status: "MEASURED", value: 0.5 } } },
  ];
  const dBase = SEL.selectNextExplained(cands, base);
  check("selector without multipliers ⇒ byte-identical to the pre-V17.6 call (no new fields)", JSON.stringify(dBase) === JSON.stringify(SEL.selectNextExplained(cands, { ...base })) && !/baseEvidenceScore|scoreAdjustment|multiplier/.test(JSON.stringify(dBase)));
  const mult = { a: 1.2, cost: 0.8 };   // direct selector test (multiplier mechanics), independent of OFB-CAL-2
  const dAdj = SEL.selectNextExplained(cands, { ...base, scoreMultipliers: mult });
  const x1 = dAdj.ranking.find((x: any) => x.id === "X1"), x1b = dBase.ranking.find((x: any) => x.id === "X1");
  check("active ⇒ ranked row keeps baseEvidenceScore = the base score, scoreDelta = adjusted − base", x1.baseEvidenceScore === x1b.evidenceScore && x1.scoreDelta === Number((x1.evidenceScore - x1.baseEvidenceScore).toFixed(4)) && x1.evidenceScore !== x1b.evidenceScore);
  const x3 = dAdj.ranking.find((x: any) => x.id === "X3"), x3b = dBase.ranking.find((x: any) => x.id === "X3");
  check("NOT_MEASURED criterion: still 0 contribution, uncertainty unchanged under multipliers", x3.uncertainty === x3b.uncertainty && x3.breakdown.find((b: any) => b.criterion === "a").contribution === 0);
  check("breakdown keeps baseContribution + multiplier on MEASURED rows", x1.breakdown.filter((b: any) => b.status === "MEASURED").every((b: any) => typeof b.baseContribution === "number" && typeof b.multiplier === "number"));
  check("decision record carries scoreAdjustment (visible) when multipliers are used", !!dAdj.scoreAdjustment && dAdj.scoreAdjustment.multipliers === mult);
  check("multipliers CAN change the decision (outcome change visible): base X2, adjusted X1", (dBase.selected || dBase.proposed || {}).id !== (dAdj.selected || dAdj.proposed || {}).id || dBase.decision !== dAdj.decision);
  check("invalid multiplier (≤0 / NaN) ignored ⇒ ×1", SEL.scoreExplained(cands[0], base.weights, base.directions, { a: -1, cost: NaN }).evidenceScore === SEL.scoreExplained(cands[0], base.weights, base.directions).evidenceScore);

  // --- history (OFB-HIST-1) ---
  const l1 = OFB.historyEntry(null, 1, { action: "ACTIVATE", adjustmentsSha256: "s1" });
  const l2 = OFB.historyEntry(l1, 2, { action: "DEACTIVATE", adjustmentsSha256: "s1" });
  const h = OFB.verifyHistory(l1 + "\n" + l2 + "\n");
  check("history: two hash-chained entries verify", h.ok === true && h.entries.length === 2 && h.entries[1].prevSha256 === OFB.sha256(l1));
  const l3 = OFB.historyEntry(l2, 3, { action: "ACTIVATE", adjustmentsSha256: "s2" });
  check("history append keeps earlier lines byte-identical (append-only) and verifies", (l1 + "\n" + l2 + "\n" + l3 + "\n").startsWith(l1 + "\n" + l2 + "\n") && OFB.verifyHistory(l1 + "\n" + l2 + "\n" + l3 + "\n").ok === true);
  check("history: an edited earlier line breaks the chain", OFB.verifyHistory(l1.replace("s1", "sX") + "\n" + l2 + "\n").ok === false);
  check("history: a removed line breaks the chain", OFB.verifyHistory(l1 + "\n" + l3 + "\n").ok === false);

  // --- loader: inactive ⇒ no inputs, no multipliers (temp root) ---
  const SS = require("../bin/odg-strategic-select.ts");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ofb-"));
  fs.mkdirSync(path.join(tmp, "docs", "odg", "evidence"), { recursive: true });
  fs.writeFileSync(path.join(tmp, OFB.LAYER_REL), JSON.stringify(layer));
  fs.writeFileSync(path.join(tmp, OFB.ACTIVATION_REL), JSON.stringify({ ...act, active: false }));
  const inputsOff: any[] = [];
  const offFb = SS.loadOutcomeFeedback(tmp, inputsOff);
  check("loader: activation active:false ⇒ state OFF, multipliers null, NO input recorded", offFb.state.active === false && offFb.multipliers === null && inputsOff.length === 0);
  fs.writeFileSync(path.join(tmp, OFB.ACTIVATION_REL), JSON.stringify(act));
  const inputsOn: any[] = [];
  const onFb = SS.loadOutcomeFeedback(tmp, inputsOn);
  check("loader: bound activation ⇒ ACTIVE, multipliers = layer's, activation + layer recorded in inputs", onFb.state.active === true && JSON.stringify(onFb.multipliers) === JSON.stringify(r.multipliers) && inputsOn.map((i: any) => i.source).join() === `${OFB.ACTIVATION_REL},${OFB.LAYER_REL}`);
  fs.rmSync(tmp, { recursive: true, force: true });

  // --- real repo (history-dependent): committed layer reproduces; rollback ⇒ base register byte-identical ---
  const root = path.resolve(__dirname, "..", "..");
  const BIN = require("../bin/odg-v176-outcome-feedback.ts");
  const committedTxt = fs.readFileSync(path.join(root, OFB.LAYER_REL), "utf8");
  const rec = BIN.build(root);
  check("V176_OUTCOME_FEEDBACK.json is byte-identical to a fresh computation (--check)", committedTxt === BIN.text(rec));
  check("real: no PROBE among admitted; every committed *_PROBE_*.json listed as refused", rec.admission.admitted.every((a: any) => !/PROBE/.test(a.validation)) && fs.readdirSync(path.join(root, "docs/odg/evidence")).filter((f: string) => /_PROBE_\d+\.json$/.test(f)).every((f: string) => rec.admission.refused.some((x: any) => x.validation === `docs/odg/evidence/${f}`)));
  check("real: admitted = CLOSE-1 graded items only (G, G2, H, J2, V175-NB1, V175-NB2 at this tree — V17.6 NB2 CLOSED_FAIL)", rec.admission.admitted.map((a: any) => `${a.id}=${a.grade}`).join() === "G=PARTIAL,G2=PARTIAL,H=FAIL,J2=FAIL,V175-NB1=PASS,V175-NB2=FAIL");
  check("real (OFB-CAL-2): every criterion NOT_ATTRIBUTABLE at this tree — autonomyBenefit constant, costRiskComplexity / evidenceLevel |ρ| < RHO_MIN, the rest below MIN_N ⇒ empty multipliers", rec.perCriterion.every((p: any) => p.status === "NOT_ATTRIBUTABLE" && p.multiplier === 1) && Object.keys(rec.adjustmentsCanonical.multipliers).length === 0 && rec.perCriterion.find((p: any) => p.criterion === "autonomyBenefit").why === "CONSTANT_VALUES");
  check("real: history chain valid and its last entry matches the activation state", BIN.checkHistory(root, rec) === null);
  const sources = SS.loadSources(root);
  const fbFiles = new Set([OFB.ACTIVATION_REL, OFB.LAYER_REL, OFB.OWNER_RECORD]);
  const { outcomeFeedback: _drop, ...rest } = sources;
  const baseSources = { ...rest, inputs: sources.inputs.filter((i: any) => !fbFiles.has(i.source)) };   // the pre-V17.6 loader shape
  const offSources = { ...baseSources, outcomeFeedback: { state: OFB.activationState({ ...JSON.parse(fs.readFileSync(path.join(root, OFB.ACTIVATION_REL), "utf8")), active: false }, rec, null), multipliers: null } };
  const baseRec = JSON.stringify(SS.compute(baseSources)), offRec = JSON.stringify(SS.compute(offSources));
  check("ROLLBACK: feedback OFF ⇒ register record byte-identical to the base register (no feedback code path)", baseRec === offRec && !/baseEvidenceScore|outcomeFeedback/.test(offRec));
  const committedReg = JSON.parse(fs.readFileSync(path.join(root, SS.OUT_REL), "utf8"));
  if (rec.activation.active === true && Object.values(rec.adjustmentsCanonical.multipliers).some((m: any) => m !== 1)) {
    check("active: committed register decision = layer's ADJUSTED strategic decision", committedReg.decisionRecord.selected === rec.decisions.strategic.adjusted.selected && committedReg.decisionRecord.decision === rec.decisions.strategic.adjusted.decision);
    check("active: committed register ranking carries baseEvidenceScore equal to the layer's base scores", rec.scores.every((s: any) => { const row = committedReg.decision.ranking.find((x: any) => x.id === s.id); return !row || (row.baseEvidenceScore === s.baseScore && row.evidenceScore === s.adjustedScore); }));
  } else check("inactive OR active-with-all-multipliers-1: committed register equals the base computation (byte-identical)", JSON.stringify((({ generatedAtHead, ...x }: any) => x)(committedReg)) === baseRec);

  process.stdout.write(failures ? `\n${failures} FAILED\n` : "\nall passed\n");
  if (failures) process.exit(1);
}
main();
export {};
