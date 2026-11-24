#!/usr/bin/env node
"use strict";
/* Tests for odg-outcome-learning (V17.5 P4): determinism (order-independent, byte-identical), source citation on every
 * item + finding, NOT_MEASURED / PENDING preservation, findings are HYPOTHESES with n, nothing fed into scoring; plus the
 * committed record is reproduced from the committed sources (history-dependent: full clone). */
const fs = require("fs");
const path = require("path");
const OL = require("./odg-outcome-learning.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

const crit = (v: Record<string, any>) => { const o: any = {}; for (const k of Object.keys(v)) o[k] = v[k] === null ? { status: "NOT_MEASURED", value: null, rule: "R-0", direction: "HIGHER_IS_BETTER" } : { status: "MEASURED", value: v[k], rule: "R-1", direction: k === "cost" ? "LOWER_IS_BETTER" : "HIGHER_IS_BETTER" }; return o; };
const mk = (id: string, basis: string, score: number, unc: number, c: any, exp: string, val: string | null, bound = true, extra: any = {}) => ({
  id, selection: { basis, registerCommit: "abc", decision: "SELECTED", evidenceScore: score, uncertainty: unc, upperBound: score + unc, rank: 1, rankN: 5, uncertaintyMax: 0.5, criteria: c, atRunHead: { commit: "def", decision: "SELECTED", selected: extra.selectedAtHead || id }, source: [`reg#${id}`] },
  contract: { sha256: "s", bound: true, question: "q?", passRule: "Δ>0", parent: extra.parent || null, parentStatus: extra.parentStatus || null, source: [`contracts#${id}`] },
  realized: { experimentOutcome: exp, validatedGrade: val, validationBound: bound, lesson: null, source: [`exp#${id}`] },
  dispatch: extra.dispatch || { by: "PROVIDER", source: [`exp#${id}.run`] },
});
const fixture = () => [
  mk("A", "REGISTER_SELECTED", 0.4, 0.5, crit({ evidence: 1, cost: 0.1, unknown: null }), "FAIL", "FAIL"),
  mk("B", "REGISTER_SELECTED", 0.3, 0.5, crit({ evidence: 0.9, cost: 0.9, unknown: null }), "PARTIAL", "PARTIAL", true, { selectedAtHead: "A" }),
  mk("C", "NOT_REGISTER_SELECTED", 0.05, 0.7, crit({ evidence: 0, cost: 0.9, unknown: null }), "FAIL", null, true, { parent: "A", parentStatus: "CLOSED_FAIL", dispatch: { by: "ODG_GO", goStrategicDecision: "SELECTED", goStrategic: "A", goActionable: "C", actionableResolvedBy: "OWNER_SELECTION_DECISION docs/odg/X.json", dispatched: "C", source: ["trace#SELECT"] } }),
];

function main(): void {
  const a = JSON.stringify(OL.learnFromOutcomes(fixture()));
  const b = JSON.stringify(OL.learnFromOutcomes(fixture().reverse()));
  check("deterministic: same input in reversed order ⇒ byte-identical record", a === b);
  const r = OL.learnFromOutcomes(fixture());
  check("never fed into scoring (feedsScoring false)", r.feedsScoring === false);
  check("every item cites selection, contract and realized sources", r.items.every((i: any) => i.predicted.source.length && i.preRegistered.source.length && i.realized.source.length));
  check("every finding is a HYPOTHESIS with n and non-empty support", r.findings.length > 0 && r.findings.every((f: any) => f.status === "HYPOTHESIS" && typeof f.n === "number" && Array.isArray(f.support) && f.support.length > 0));
  const C = r.items.find((i: any) => i.id === "C");
  check("pending validation ⇒ experiment outcome used, marked NOT validated (never presented as validated)", C.realized.validated === false && /PENDING/.test(C.realized.gradeBasis) && C.realized.validatedGrade === null);
  const unbound = OL.learnFromOutcomes([mk("D", "REGISTER_SELECTED", 0.3, 0.5, crit({ e: 1 }), "FAIL", "PASS", false)]);
  check("validation NOT bound to the experiment ⇒ its grade is not used (experiment outcome, flagged)", unbound.items[0].realized.grade === "FAIL" && /NOT bound/.test(unbound.items[0].realized.gradeBasis));
  const unk = r.perCriterion.find((p: any) => p.criterion === "unknown");
  check("NOT_MEASURED criterion: counted, value null, never imputed, no calibration claim", unk.measured === 0 && unk.notMeasured === 3 && unk.observations.every((o: any) => o.value === null) && /NOT_MEASURED/.test(unk.reading));
  const ev = r.perCriterion.find((p: any) => p.criterion === "evidence");
  check("predicted-high (≥0.75) criterion preceding only non-PASS on ≥2 items ⇒ a BIAS hypothesis with n", ev.predictedHighThenNonPass.join() === "A,B" && r.findings.some((f: any) => f.id === "OL-6-evidence" && f.n === 2));
  const cost = r.perCriterion.find((p: any) => p.criterion === "cost");
  check("LOWER_IS_BETTER favourability = 1 − value (cost 0.1 ⇒ 0.9 favourable-high)", cost.predictedHigh.join() === "A");
  check("selection drift detected (B selected earlier, register selected A at run head)", r.findings.some((f: any) => f.id === "OL-2" && f.support.some((s: string) => s.startsWith("B:"))));
  check("GO strategic ≠ dispatched ⇒ OL-4 with owner resolution counted", r.findings.some((f: any) => f.id === "OL-4" && /1\/1/.test(f.statement) && /owner decision in 1\/1/.test(f.statement)));
  check("re-attempt of a non-PASS parent ⇒ OL-8", r.findings.some((f: any) => f.id === "OL-8" && f.n === 1));
  check("pass-rate calibration reuses the survivorship guard ⇒ DEGRADED at tiny n (no calibrated P)", r.passRateCalibration.pForPlanner === null && r.passRateCalibration.quality !== "CALIBRATED");
  check("evidenceScore never treated as a probability (no Brier/ECE field)", !/brier|ece/i.test(JSON.stringify(r.scoreVsOutcome).replace(/no Brier\/ECE/g, "")));
  check("empty input ⇒ n 0, no crash, no fabricated finding beyond the 0/0 count", (() => { const e = OL.learnFromOutcomes([]); return e.n === 0 && e.items.length === 0; })());

  // committed record reproduced from committed sources (history-dependent: needs a full clone)
  const BIN = require("../bin/odg-v175-outcome-learning.ts");
  const root = path.resolve(__dirname, "..", "..");
  const committed = fs.readFileSync(path.join(root, "docs/odg/evidence/V175_OUTCOME_LEARNING.json"), "utf8");
  const fresh = BIN.build(root);
  check("V175_OUTCOME_LEARNING.json is byte-identical to a fresh computation (--check)", committed === fresh);
  const rec = JSON.parse(committed);
  check("real record: 4 items G, G2, H, J2; J2 not yet validated", rec.items.map((i: any) => i.id).join() === "G,G2,H,J2" && rec.items.find((i: any) => i.id === "J2").realized.validated === false);
  check("real record: every contract bound to its experiment (contractSha256)", rec.items.every((i: any) => i.preRegistered.contractBoundToExperiment === true));

  process.stdout.write(failures ? `\n${failures} FAILED\n` : "\nall passed\n");
  if (failures) process.exit(1);
}
main();
export {};
