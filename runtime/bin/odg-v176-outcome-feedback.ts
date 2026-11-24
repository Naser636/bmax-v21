/**
 * V17.6 (owner « V176 : DÉBLOCAGE FINAL » item 3) — OUTCOME FEEDBACK LAYER record (OFB-1). Offline, no network, no model.
 *
 *   npx tsx runtime/bin/odg-v176-outcome-feedback.ts                     write docs/odg/evidence/V176_OUTCOME_FEEDBACK.json
 *   npx tsx runtime/bin/odg-v176-outcome-feedback.ts --check             recompute; exit 1 on byte drift, on a broken history
 *                                                                         chain, or when the last history entry disagrees with
 *                                                                         the activation record (active flag / bound sha)
 *   npx tsx runtime/bin/odg-v176-outcome-feedback.ts --append-history    append ONE hash-chained ACTIVATE|DEACTIVATE entry to
 *                                                                         docs/odg/evidence/V176_OUTCOME_FEEDBACK_HISTORY.jsonl
 *                                                                         matching the activation record (refused if nothing changed)
 *
 * Inputs (committed only): the strategic register built by odg-strategic-select.loadSources + odg-strategic-register
 * (CLOSE-1 closures), every declared criteria-validation / experiment record (odg-authorization-evidence-paths), the
 * selection-time prediction from the git history of V164_STRATEGIC_REGISTER.json (odg-v175-outcome-learning.gatherSelection),
 * the activation record docs/odg/V176_OUTCOME_FEEDBACK_ACTIVATION.json and, when present, the owner record
 * docs/odg/V176_OWNER_DIRECTIVE_DEBLOCAGE_FINAL.json. Every *_PROBE_<n>.json evidence file is listed as REFUSED (never
 * admitted). Strategic + actionable (GO-ACT-1) decisions are computed by the SAME selector with and without the multipliers.
 * HISTORY-DEPENDENT (git log / git show, read-only) ⇒ --check needs a full clone. The output carries no HEAD / time.
 */
const fs = require("fs");
const path = require("path");
const OFB = require("../core/odg-outcome-feedback.js");
const REG = require("../core/odg-strategic-register.js");
const SEL = require("../core/mission-priority-selector.js");
const GOC = require("../core/odg-go-cycle.js");
const AEP = require("../core/odg-authorization-evidence-paths.js");
const SS = require("./odg-strategic-select.ts");
const OLB = require("./odg-v175-outcome-learning.ts");

const ROOT = path.resolve(__dirname, "..", "..");
const EV = "docs/odg/evidence";

function readTxt(root: string, rel: string): string | null { try { return fs.readFileSync(path.join(root, rel), "utf8"); } catch { return null; } }
function readJson(root: string, rel: string): any { const t = readTxt(root, rel); if (t === null) return null; try { return JSON.parse(t); } catch { return null; } }

/* gatherOutcomes(root, register) — one admitOutcome input per declared scoped item (+ every committed PROBE file). */
function gatherOutcomes(root: string, register: any): any {
  const outcomes: any[] = [];
  const notGraded: any[] = [];
  for (const id of Object.keys(AEP.AUTH_EVIDENCE).sort()) {
    const files = (AEP.AUTH_EVIDENCE as any)[id];
    const item = register.items.find((it: any) => it.id === id) || null;
    if (!item || !item.closure || item.closure.closed !== true) { notGraded.push({ id, status: item ? item.status : "ABSENT", reason: item && item.closure ? item.closure.reason || "not closed" : "no closure" }); continue; }
    const v = readJson(root, files.validation), e = readJson(root, files.experiment);
    let prediction: any = null;
    const runHead = e && e.run && typeof e.run.head === "string" ? e.run.head : null;
    if (runHead) { try { const s = OLB.gatherSelection(root, id, runHead); delete s._headSnapshot; prediction = s; } catch (err: any) { prediction = { basis: "NOT_MEASURED", source: [`gatherSelection failed: ${String(err && err.message).slice(0, 120)}`] }; } }
    outcomes.push({ id, item, validation: v ? { path: files.validation, data: v } : null, experiment: e ? { path: files.experiment, data: e } : null, prediction });
  }
  // every committed PROBE record is offered and refused visibly (OFB-ADM-1 d) — a probe never becomes a measured outcome
  for (const f of fs.readdirSync(path.join(root, EV)).filter((f: string) => /_PROBE_\d+\.json$/.test(f)).sort()) {
    const rel = `${EV}/${f}`, d = readJson(root, rel);
    const id = d && typeof d.scenario === "string" ? `${d.scenario} (${f})` : f;
    const item = d && typeof d.scenario === "string" ? register.items.find((it: any) => it.id === d.scenario) || null : null;
    outcomes.push({ id, item, validation: { path: rel, data: d }, experiment: { path: rel, data: d }, prediction: null });
  }
  return { outcomes, notGraded };
}

function actionable(root: string, register: any, opts: any): any {
  const GO = require("./odg-go.ts");
  const state = GO.readState(root);
  const cands = GOC.actionableCandidates(state, register);
  const base = { ...opts, nonSelectableStatuses: { ...SEL.EXPLAINED_DEFAULTS.nonSelectableStatuses, [GOC.NOT_AUTHORIZED_NOW]: "no AUTHORIZED next step now (GO-ACT-1 feasibility constraint; ranking unchanged)" } };
  return SEL.selectNextExplained(cands, base);
}

function build(root: string): any {
  const sources = SS.loadSources(root);
  const register = REG.buildRegister(sources);
  const { outcomes, notGraded } = gatherOutcomes(root, register);
  const adj = OFB.computeAdjustments(outcomes, REG.CRITERIA);
  const layerCore = { adjustmentsSha256: adj.adjustmentsSha256, adjustmentsCanonical: adj.adjustmentsCanonical };
  const activationTxt = readTxt(root, OFB.ACTIVATION_REL);
  let activation: any = null; try { activation = activationTxt === null ? null : JSON.parse(activationTxt); } catch { activation = null; }
  const ownerTxt = readTxt(root, OFB.OWNER_RECORD);
  const state = OFB.activationState(activation, layerCore, ownerTxt);
  const baseOpts = { weights: REG.WEIGHTS, directions: REG.DIRECTIONS };
  const adjOpts = OFB.selectorOptions(baseOpts, { state: { active: true, boundSha256: adj.adjustmentsSha256 }, multipliers: adj.multipliers });
  const cands = REG.toSelectorCandidates(register);
  const sBase = SEL.selectNextExplained(cands, baseOpts), sAdj = SEL.selectNextExplained(cands, adjOpts);
  const aBase = actionable(root, register, baseOpts), aAdj = actionable(root, register, adjOpts);
  const pick = (d: any) => { const x = OFB.decisionSummary(d); return JSON.stringify([x.decision, x.selected, x.proposed, x.tiedSet, x.resolvedBy]); };
  const changed = (a: any, b: any) => pick(a) !== pick(b);   // the DECISION (decision / selected / proposed / tiedSet / resolvedBy), not the scores
  const adjusted = adj.perCriterion.filter((p: any) => p.status === "ADJUSTED").map((p: any) => p.criterion);
  const below = adj.perCriterion.filter((p: any) => p.status !== "ADJUSTED").map((p: any) => `${p.criterion} (n=${p.n})`);
  return {
    "//": "V17.6 OFB-1 — outcome feedback on scores (owner « V176 : DÉBLOCAGE FINAL » item 3). Per-criterion bounded LEVEL calibration from measured + attributable closure grades only; applied to the strategic register ONLY while the committed activation record binds these adjustments. Recompute: npx tsx runtime/bin/odg-v176-outcome-feedback.ts --check",
    schema: OFB.LAYER_SCHEMA,
    feedbackVersion: OFB.FEEDBACK_VERSION,
    ownerDirective: { record: OFB.OWNER_RECORD, recordPresentOnThisTree: ownerTxt !== null, item: 3, quote: OFB.OWNER_QUOTE },
    rules: OFB.RULES,
    constants: { minN: OFB.MIN_N, cap: OFB.CAP, multiplierRange: [1 - OFB.CAP, 1 + OFB.CAP], gradeUtility: require("../core/odg-outcome-learning.js").GRADE_UTILITY, note: "provider-declared (Claude Code) before the first computation; the owner may replace them" },
    admission: { admitted: adj.admitted, refused: adj.refused, notGraded },
    perCriterion: adj.perCriterion,
    adjustmentsSha256: adj.adjustmentsSha256,
    adjustmentsCanonical: adj.adjustmentsCanonical,
    activation: { record: OFB.ACTIVATION_REL, ...state },
    scores: OFB.scoreTable(sBase, sAdj),
    decisions: {
      strategic: { base: OFB.decisionSummary(sBase), adjusted: OFB.decisionSummary(sAdj), changed: changed(sBase, sAdj) },
      actionable: { rule: "GO-ACT-1 (same selector, items without an AUTHORIZED next step excluded as NOT_AUTHORIZED_NOW); GO-ORD-1/GO-ORD-2 owner records apply on top, unchanged", base: OFB.decisionSummary(aBase), adjusted: OFB.decisionSummary(aAdj), changed: changed(aBase, aAdj) },
      scoresChanged: OFB.scoreTable(sBase, sAdj).filter((r: any) => r.delta !== 0).length,
      inEffect: state.active ? "ADJUSTED (activation bound to these adjustments)" : "BASE (feedback OFF)",
    },
    honesty: [
      `${adj.admitted.length} admitted graded item(s) [${adj.admitted.map((a: any) => `${a.id}=${a.grade}`).join(", ")}]; ${adj.refused.length} refused (incl. every PROBE record); ${notGraded.length} declared item(s) not graded`,
      `adjusted criteria (n ≥ MIN_N ${OFB.MIN_N}): [${adjusted.join(", ")}]; NOT adjusted (below MIN_N or never measured): [${below.join(", ")}]`,
      "a multiplier is a bounded LEVEL correction (did this criterion's favourability run above/below the realized utility on these items) — never a claim that the criterion predicts or discriminates outcomes; n is tiny",
      "NOT_MEASURED criteria stay NOT_MEASURED (multipliers scale MEASURED contributions only); statuses, criterion values, weights, thresholds and eligibility are unchanged",
      "no hypothesis, probe, simulation or fixture is used as an outcome; the V17.5 outcome-learning record stays report-only (feedsScoring false) — this layer is the separate, owner-authorized consumption",
    ],
    sources: [SS.OUT_REL + " (built from the committed sources; history for selection-time predictions)", ...Object.values(AEP.AUTH_EVIDENCE).flatMap((f: any) => [f.experiment, f.validation]), OFB.ACTIVATION_REL, OFB.OWNER_RECORD + (ownerTxt !== null ? "" : " (ABSENT on this tree)")],
  };
}

function text(rec: any): string { return JSON.stringify(rec, null, 2) + "\n"; }

/* historyFields(rec, activation) — the content of the next history line (OFB-HIST-1). */
function historyFields(rec: any, activation: any, activationTxt: string): any {
  const active = rec.activation.active === true;
  return { action: active ? "ACTIVATE" : "DEACTIVATE", date: activation && activation.date || null, feedbackVersion: rec.feedbackVersion, activationRecord: OFB.ACTIVATION_REL, activationSha256: OFB.sha256(activationTxt), activationState: { active, reason: rec.activation.reason },
    adjustmentsSha256: rec.adjustmentsSha256, multipliers: rec.adjustmentsCanonical.multipliers, admitted: rec.adjustmentsCanonical.admitted.map((a: any) => `${a.id}=${a.grade}`),
    ownerQuoteSha256: OFB.sha256(OFB.OWNER_QUOTE), scores: rec.scores, decisionsBefore: { strategic: rec.decisions.strategic.base, actionable: rec.decisions.actionable.base }, decisionsAfter: active ? { strategic: rec.decisions.strategic.adjusted, actionable: rec.decisions.actionable.adjusted } : { strategic: rec.decisions.strategic.base, actionable: rec.decisions.actionable.base } };
}

function checkHistory(root: string, rec: any): string | null {
  const h = OFB.verifyHistory(readTxt(root, OFB.HISTORY_REL) || "");
  if (!h.ok) return `history chain broken: ${h.reason}`;
  const last = h.entries[h.entries.length - 1] || null;
  const active = rec.activation.active === true;
  if (!last) return active ? "feedback ACTIVE but the history has no ACTIVATE entry" : null;
  if (active && (last.action !== "ACTIVATE" || last.adjustmentsSha256 !== rec.adjustmentsSha256)) return `feedback ACTIVE (adjustments ${rec.adjustmentsSha256.slice(0, 12)}…) but the last history entry is ${last.action} ${String(last.adjustmentsSha256).slice(0, 12)}… — run --append-history`;
  if (!active && last.action !== "DEACTIVATE" && readJson(root, OFB.ACTIVATION_REL) && readJson(root, OFB.ACTIVATION_REL).active === false) return "activation record active:false but the last history entry is ACTIVATE — run --append-history";
  return null;
}

function main(argv: string[]): number {
  const rec = build(ROOT);
  const out = path.join(ROOT, OFB.LAYER_REL);
  if (argv.includes("--check")) {
    const cur = readTxt(ROOT, OFB.LAYER_REL) || "";
    if (cur !== text(rec)) { process.stderr.write(`CHECK FAILED: ${OFB.LAYER_REL} differs from a fresh computation\n`); return 1; }
    const hErr = checkHistory(ROOT, rec);
    if (hErr) { process.stderr.write(`CHECK FAILED: ${hErr}\n`); return 1; }
    process.stdout.write(`CHECK OK ${OFB.LAYER_REL} (active=${rec.activation.active}; strategic ${rec.decisions.strategic.base.decision} ${rec.decisions.strategic.base.selected || rec.decisions.strategic.base.proposed} → ${rec.decisions.strategic.adjusted.decision} ${rec.decisions.strategic.adjusted.selected || rec.decisions.strategic.adjusted.proposed})\n`);
    return 0;
  }
  if (argv.includes("--append-history")) {
    const actTxt = readTxt(ROOT, OFB.ACTIVATION_REL);
    if (actTxt === null) { process.stderr.write("no activation record — nothing to record\n"); return 1; }
    const histTxt = readTxt(ROOT, OFB.HISTORY_REL) || "";
    const h = OFB.verifyHistory(histTxt);
    if (!h.ok) { process.stderr.write(`history chain broken: ${h.reason} — refusing to append\n`); return 1; }
    const fields = historyFields(rec, JSON.parse(actTxt), actTxt);
    const last = h.entries[h.entries.length - 1] || null;
    if (last && last.action === fields.action && last.adjustmentsSha256 === fields.adjustmentsSha256 && last.activationSha256 === fields.activationSha256) { process.stderr.write("last history entry already records this state — nothing appended\n"); return 1; }
    const lines = histTxt.split("\n").filter((l: string) => l.trim());
    const line = OFB.historyEntry(lines.length ? lines[lines.length - 1] : null, lines.length + 1, fields);
    fs.appendFileSync(path.join(ROOT, OFB.HISTORY_REL), line + "\n");
    process.stdout.write(`appended ${fields.action} #${lines.length + 1} to ${OFB.HISTORY_REL}\n`);
    return 0;
  }
  fs.writeFileSync(out, text(rec));
  process.stdout.write(`wrote ${OFB.LAYER_REL} (active=${rec.activation.active})\n`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { build, gatherOutcomes, historyFields, checkHistory, text };
export {};
