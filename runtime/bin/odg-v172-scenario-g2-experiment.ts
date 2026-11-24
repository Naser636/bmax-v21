#!/usr/bin/env node
"use strict";
/*
 * V17.2 — SCENARIO G2, step RUN_CONTROLLED_EXPERIMENTS (contract docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json#G2,
 * owner V170 docs/odg/V170_OWNER_AUTHORIZATION_HG.json; independently inspected — docs/odg/evidence/V172_G2_CONTRACT_INSPECTION.json).
 * This file is the contract's DECLARED dispatch target authorization.dispatchTargets.RUN_CONTROLLED_EXPERIMENTS: ODG GO runs
 *   npx tsx runtime/bin/odg-v172-scenario-g2-experiment.ts docs/odg/evidence/V172_G2_EXPERIMENT.json
 * which writes exactly its declared writeSet: docs/odg/evidence/V172_G2_HELDOUT.json (built by the pre-registered builder
 * runtime/bin/odg-v172-scenario-g2-heldout-build.ts) + docs/odg/evidence/V172_G2_EXPERIMENT.json. Provider (Claude Code)
 * wrote this runner; the run itself is ODG GO's dispatch.
 *
 * Implements WORK_ITEM_CONTRACT.preRegistration LITERALLY (constants below, asserted against the live text by gate()):
 *   C1 G_SMALL_SIZE via odg-knowledge-intelligence (reuses odg-v166-scenario-g-experiment.retrieveC1: attestCollection,
 *   assessClaim → toMemory, usableFor DESIGN_PROPOSAL at use time, admissible() recorded) · DEV = V160 snapshot (sha256
 *   09a1112d… pinned; G's row rule; sorted by PR number) · arms B0 / B1 (G's fitB1) / KG (α 0.05 per decade toward the
 *   1000-line prior; candidates = distinct training sizes ∪ {1000}; ties ⇒ closest to 1000 in |log10 T − 3|, then
 *   smallest T) · rolling-origin o ∈ {100, 200, 300} on DEV (can only BLOCK a PASS) · DEV/local-git concordance check ·
 *   HB (#319–#518) primary, HF (#921–#954) report-only · balanced accuracy (odg-binary-classification-metrics) · paired
 *   bootstrap 2000, LCG st = (Math.imul(st, 1664525) + 1013904223) >>> 0, index = st % n, seed 20261202 · grade = first
 *   matching of NOT_MEASURED, PASS, PARTIAL, FAIL.
 *
 * GATE (fail-closed, before ANY data is opened; exit 2 NOT_AUTHORIZED, NOTHING written):
 *   sha256(canon(live contract G2)) === PINNED_CONTRACT_SHA · deriveAuthorizationScope(contract, {inspection, probes:
 *   localGitProbes}) has RUN_CONTROLLED_EXPERIMENTS as the current authorized step · runner constants equal the frozen
 *   preRegistration text · the declared dispatch target is this file, args [OUT], writeSet [HELDOUT, OUT].
 * WRITE CONFINEMENT: argv must be exactly [OUT] (else exit 3, nothing written). The runner writes only HELDOUT (iff absent —
 *   never edited after its first build) and OUT, both after the whole computation; no temp/cache/dist/generated output.
 * ANTI-LEAKAGE (C3): fits see DEV rows only; T_B / T_KG (and the report-only α variants) are SEALED (sha256 of canonical
 *   JSON) before the held-out block is even built; HB/HF labels sit in a vault that throws if read before the seal; the
 *   ordered log is part of the record.
 *
 * Usage:  <OUT>                           run (dispatch) — writes HELDOUT (if absent) + OUT
 *         --check <OUT>                   recompute (rebuild HELDOUT, compare with the committed file; recompute the record
 *                                         with its recorded useAt and run.head) — exit 1 on drift; writes nothing
 *         --check-at-run-head <OUT>       the record's OWN --check at record.run.head (odg-run-head-check; temp detached worktree)
 *         --selftest                      offline synthetic checks (no real data, nothing written in the tree)
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const cp = require("child_process");
const AS = require("../core/odg-authorization-scope.js");
const OCUR = require("../core/odg-observation-currency.js");
const BCM = require("../core/odg-binary-classification-metrics.js");
const RC = require("../core/odg-verification-risk-calibration.js");   // rocAuc (report-only AUC of raw size)
const RHC = require("../core/odg-run-head-check.js");
const G = require("./odg-v166-scenario-g-experiment.ts");             // retrieveC1, loadRows, fitB1, ba, confusion (G's definitions)
const HB = require("./odg-v172-scenario-g2-heldout-build.ts");

const ROOT = path.resolve(__dirname, "..", "..");
const CONTRACTS = "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json";
const INSPECTION = "docs/odg/evidence/V172_G2_CONTRACT_INSPECTION.json";
const SELF = "runtime/bin/odg-v172-scenario-g2-experiment.ts";
const OUT = "docs/odg/evidence/V172_G2_EXPERIMENT.json";
const HELDOUT = HB.OUT;   // docs/odg/evidence/V172_G2_HELDOUT.json
const STEP = "RUN_CONTROLLED_EXPERIMENTS";
const WRITE_SET = Object.freeze(["runtime/bin/odg-v172-scenario-g2-heldout-build.ts", HELDOUT, SELF, "runtime/bin/odg-v172-scenario-g2-experiment.test.ts", OUT]);

/* ---- frozen pre-registration constants (verbatim from contract G2; asserted against the live text by gate()) ---- */
const PINNED_CONTRACT_SHA = "94ca64cab00782649944b6dd3825ca6f1ed9f868943c89e0e86f7827d1d704a1";
const PRE = Object.freeze({
  knowledgeItem: "G_SMALL_SIZE", T_prior: 1000, log10Prior: 3,
  alpha: 0.05, alphaReportOnly: Object.freeze([0.02, 0.10]), K_reportOnly: Object.freeze([1000, 100]),
  highIterationMinCommits: 2,
  dev: "docs/odg/evidence/V160_SCENARIO_G_PR_HISTORY.json",
  devSha256: "09a1112dd42c6821e030d3ebf2058f2c93f440a28b4ed34aef4f631ac646d9ea",
  devRowsRegistered: 400, devRange: Object.freeze([519, 920]),
  heldoutBaseCommit: "e97bcc43", HB: Object.freeze([319, 518]), HF: Object.freeze([921, 954]),
  folds: Object.freeze({ origins: Object.freeze([100, 200, 300]), testLen: 100, minPerClassTrain: 5, minPerClassTest: 5 }),
  concordance: Object.freeze({ minRows: 30, minLabelAgreement: 0.90, minSizeAgreement: 0.80, sizeAbsTol: 10, sizeRelTol: 0.10 }),
  resamples: 2000, bootstrapSeed: 20261202, maxSkippedFraction: 0.05,
  minHbPerClass: 20, minDevPerClass: 10, minValidFolds: 2, minHfPerClassReportOnly: 5,
  pass: Object.freeze({ deltaBGreaterThan: 0, ciLowDeltaBGreaterThan: 0, minDelta0: 0.05, ciLowDelta0GreaterThan: 0, minMeanRollingDeltaB: 0 }),
  partial: Object.freeze({ delta0GreaterThan: 0, minDeltaB: -0.02 }),
});

const sha256 = (b: any) => crypto.createHash("sha256").update(b).digest("hex");
const sha256File = (root: string, rel: string) => sha256(fs.readFileSync(path.join(root, rel)));
const r6 = (n: number) => Number(n.toFixed(6));
const high = (r: any) => r.commits >= PRE.highIterationMinCommits;
/* percentile — identical to odg-v160-scenario-g-run / odg-v166 (sorted[floor(p·n)], clamped) */
function q(sorted: number[], p: number): number { return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))]; }
/* the pre-registered index stream: st = (Math.imul(st, 1664525) + 1013904223) >>> 0; index = st % n (seed = initial st) */
function lcgIndex(seed: number): (n: number) => number { let st = seed >>> 0; return (n: number) => { st = (Math.imul(st, 1664525) + 1013904223) >>> 0; return st % n; }; }

/* ------------------------------------------------ gate ------------------------------------------------ */
function readContract(root: string): any {
  const all = JSON.parse(fs.readFileSync(path.join(root, CONTRACTS), "utf8"));
  return (all.contracts || []).find((c: any) => c && c.scenario === "G2") || null;
}
function readInspection(root: string): any { try { return JSON.parse(fs.readFileSync(path.join(root, INSPECTION), "utf8")); } catch { return null; } }
/* constantsMismatch(pr, wic, auth) — every frozen constant this runner uses, checked against the live contract text */
function constantsMismatch(contract: any): string[] {
  const wic = contract.WORK_ITEM_CONTRACT || {}; const pr = wic.preRegistration || {}; const ds = pr.dataset || {};
  const mm: string[] = [];
  const need = (k: string, s: any, res: RegExp[]) => { if (typeof s !== "string" || !res.every((r) => r.test(s))) mm.push(k); };
  if (!ds.dev || ds.dev.sha256 !== PRE.devSha256) mm.push("dataset.dev.sha256");
  if (!ds.dev || ds.dev.file !== PRE.dev) mm.push("dataset.dev.file");
  need("dataset.dev.rows", ds.dev && ds.dev.rows, [/400 merged PRs #519–#920/, /finite additions\/deletions\/commits/, /sorted by PR number ascending/, /same row rule as G/]);
  need("dataset.heldOutPrimary.file", ds.heldOutPrimary && ds.heldOutPrimary.file, [/^docs\/odg\/evidence\/V172_G2_HELDOUT\.json /, /odg-v172-scenario-g2-heldout-build\.ts/]);
  need("dataset.heldOutPrimary.rule", ds.heldOutPrimary && ds.heldOutPrimary.rule, [/319 ≤ N ≤ 518/, /first-parent commit of main at e97bcc43/, /subject '\^Merge pull request #N '/, /exactly 2 parents/,
    /commits = git rev-list --count M\^1\.\.M\^2/, /size = Σ\(added \+ deleted\) of git diff --numstat M\^1 M \(binary '-' ⇒ 0\)/, /squash commit \(subject ending '\(#N\)', 1 parent\) are EXCLUDED as LABEL_NOT_RECOVERABLE_LOCALLY and listed/, /duplicate subjects for one N ⇒ EXCLUDED AMBIGUOUS and listed/]);
  need("dataset.heldOutReportOnly.rule", ds.heldOutReportOnly && ds.heldOutReportOnly.rule, [/same rule for 921 ≤ N ≤ 954/, /report-only, never decisive/]);
  need("dataset.concordanceCheck", ds.concordanceCheck, [/2-parent 'Merge pull request #N' first-parent commit/, /≥ 30 such rows/, /HIGH_ITERATION label agreement ≥ 90%/, /\|local − snapshot\| ≤ max\(10 lines, 10%\)\) ≥ 80%/, /NOT_MEASURED/]);
  need("knowledgeItem", pr.knowledgeItem, [/^G_SMALL_SIZE /, /T_prior = 1000 \(log10 = 3\)/]);
  need("decisionProcedure", pr.decisionProcedure, [/SPLIT_RECOMMENDED iff size > T/, /size = additions \+ deletions/]);
  const arms = pr.arms || {};
  need("arms.B0", arms.B0, [/no row flagged/]);
  need("arms.B1", arms.B1, [/distinct training sizes maximizing training balanced accuracy for HIGH_ITERATION/, /ties ⇒ smallest T/]);
  need("arms.KG", arms.KG, [/T ∈ \(distinct training sizes ∪ \{1000\}\)/, /BA_train\(T\) − α·\| log10\(max\(T, 1\)\) − 3 \|/, /α = 0\.05/, /ties ⇒ T closest to 1000 in \|log10 T − 3\|, then smallest T/]);
  need("arms.K_reportOnly", arms.K_reportOnly, [/T = 1000/, /T = 100 /, /report-only/]);
  need("outcomeLabel", pr.outcomeLabel, [/HIGH_ITERATION iff commits ≥ 2/]);
  const em = pr.evaluationMethod || {};
  need("evaluationMethod.development", em.development, [/origins o ∈ \{100, 200, 300\}/, /fit B1 and KG on rows \[0, o\), evaluate on rows \[o, o \+ 100\)/, /training part has ≥ 5 HIGH and ≥ 5 LOW and its test part ≥ 5 HIGH and ≥ 5 LOW/, /BA\(T=1000\)/, /mean over valid folds of Δ_B,fold = BA\(KG\) − BA\(B1\)/, /can only BLOCK a PASS/]);
  need("evaluationMethod.final", em.final, [/fit B1 and KG once on all 400 DEV rows/, /record T_B, T_KG and their sha256 \(canonical JSON\) BEFORE reading HB labels/]);
  need("metric", pr.metric, [/balanced accuracy/, /odg-binary-classification-metrics\.classificationMetrics/, /Δ_B = BA\(KG\) − BA\(B1\)/, /Δ_0 = BA\(KG\) − BA\(B0\) = BA\(KG\) − 0\.5/]);
  need("uncertainty", pr.uncertainty, [/paired bootstrap over HB rows/, /no refit/, /2000 resamples/, /st = \(Math\.imul\(st, 1664525\) \+ 1013904223\) >>> 0/, /index = st % n/, /seed 20261202/, /0 HIGH or 0 LOW is skipped and counted/, /CI95 = 2\.5\/97\.5 percentiles of Δ_B and Δ_0/]);
  need("minimumN", pr.minimumN, [/HB ≥ 20 HIGH_ITERATION and ≥ 20 LOW_ITERATION rows/, /DEV fit ≥ 10 of each/, /≥ 2 VALID rolling-origin folds/]);
  const th = pr.thresholds || {};
  need("thresholds.NOT_MEASURED", th.NOT_MEASURED, [/C1 refused at use time/, /DEV sha256 ≠ pinned/, /held-out builder is not reproducible/, /violates its rule/, /minimumN not met/, /concordance check fails/, /> 5% of bootstrap resamples skipped/, /any non-finite number/]);
  need("thresholds.PASS", th.PASS, [/Δ_B > 0 AND CI95 lower bound of Δ_B > 0 AND Δ_0 ≥ 0\.05 AND CI95 lower bound of Δ_0 > 0 AND mean rolling-origin Δ_B ≥ 0/]);
  need("thresholds.PARTIAL", th.PARTIAL, [/Δ_0 > 0 AND Δ_B ≥ −0\.02 AND the PASS conditions are not all met/, /KG_EQUALS_B1/]);
  need("thresholds.FAIL", th.FAIL, [/Δ_0 ≤ 0 OR Δ_B < −0\.02/]);
  need("decisionRule", pr.decisionRule, [/first matching of NOT_MEASURED, PASS, PARTIAL, FAIL/]);
  need("secondaryRobustness.computed", pr.secondaryRobustness && pr.secondaryRobustness.computed, [/HF forward block \(if ≥ 5 HIGH and ≥ 5 LOW, else NOT_MEASURED there\)/, /α ∈ \{0\.02, 0\.10\}/, /K arms T = 1000 and T = 100 on HB/, /ROC AUC of raw size on HB/, /same bootstrap seed/]);
  if (JSON.stringify(wic.write_set) !== JSON.stringify(WRITE_SET)) mm.push("WORK_ITEM_CONTRACT.write_set");
  const dt = contract.authorization && contract.authorization.dispatchTargets && contract.authorization.dispatchTargets[STEP];
  if (!dt || dt.command !== SELF || JSON.stringify(dt.args) !== JSON.stringify([OUT]) || JSON.stringify(dt.writeSet) !== JSON.stringify([HELDOUT, OUT])) mm.push("authorization.dispatchTargets.RUN_CONTROLLED_EXPERIMENTS");
  // builder constants (the builder's RULE is what HB is built with)
  if (HB.RULE.baseCommit !== PRE.heldoutBaseCommit || JSON.stringify([HB.RULE.blocks.HB.lo, HB.RULE.blocks.HB.hi]) !== JSON.stringify(PRE.HB) || JSON.stringify([HB.RULE.blocks.HF.lo, HB.RULE.blocks.HF.hi]) !== JSON.stringify(PRE.HF) || HB.RULE.highIterationMinCommits !== PRE.highIterationMinCommits) mm.push("builder RULE");
  return mm;
}
/* gate(contract, inspection, root) — pure over its inputs except the local-git probes of deriveAuthorizationScope */
function gate(contract: any, inspection: any, root: string = ROOT): any {
  if (!contract) return { ok: false, reason: "contract G2 not found" };
  const sha = AS.contractSha256(contract);
  if (sha !== PINNED_CONTRACT_SHA) return { ok: false, reason: `live contract sha256 ${sha} ≠ pinned ${PINNED_CONTRACT_SHA} (contract edited — inspection invalid)`, contractSha256: sha };
  const scope = AS.deriveAuthorizationScope(contract, { inspection, probes: OCUR.localGitProbes(root) });
  if (!AS.isStepAuthorized(scope, STEP) || scope.currentStep !== STEP || scope.executionAuthorized !== true) return { ok: false, reason: `deriveAuthorizationScope does not authorize ${STEP} now: ${scope.reason}`, contractSha256: sha };
  const mm = constantsMismatch(contract);
  if (mm.length) return { ok: false, reason: "runner constants diverge from the frozen contract: " + mm.join(", "), contractSha256: sha };
  return { ok: true, contractSha256: sha,
    scope: { currentStep: scope.currentStep, authorizedSteps: scope.authorizedSteps, derivedSteps: scope.derivedSteps.map((d: any) => ({ step: d.step, rule: d.rule, coveredBy: d.coveredBy })), reason: scope.reason, independenceLevel: scope.independenceLevel, selfAuthorized: scope.selfAuthorized },
    inspection: { path: INSPECTION, verdict: inspection.verdict, contractSha256: inspection.contractSha256, inspectedHeadSha: inspection.inspectedHeadSha, inspectedPr: inspection.inspectedPr, inspectorSessionId: inspection.inspectorSessionId, authorSessionId: inspection.authorSessionId } };
}
/* write confinement: argv positional must be EXACTLY [OUT] (repo-relative) */
function outputPathOk(arg: any, root: string = ROOT): boolean {
  if (typeof arg !== "string" || !arg) return false;
  return path.normalize(arg) === OUT && arg === OUT && path.resolve(root, arg) === path.resolve(root, OUT);
}

/* ------------------------------------------------ arms ------------------------------------------------ */
const baT = (rows: any[], T: number | null): number | null => G.ba(rows, T, high);
const priorDist = (T: number) => Math.abs(Math.log10(Math.max(T, 1)) - PRE.log10Prior);
/* KG: argmax over T ∈ distinct training sizes ∪ {1000} of BA_train(T) − α·|log10(max(T,1)) − 3|; ties ⇒ closest to 1000 in
 * |log10 T − 3|, then smallest T. A candidate with undefined BA_train is not eligible (recorded count). */
function fitKG(train: any[], alpha: number = PRE.alpha): any {
  const cands = Array.from(new Set(train.map((r: any) => r.size).concat([PRE.T_prior]))).sort((a: any, b: any) => a - b) as number[];
  let best: any = null; let undefinedCandidates = 0;
  for (const T of cands) {
    const b = baT(train, T); if (b === null) { undefinedCandidates++; continue; }
    const obj = b - alpha * priorDist(T);
    const better = best === null || obj > best.objective || (obj === best.objective && (priorDist(T) < best.priorDistance || (priorDist(T) === best.priorDistance && T < best.T)));
    if (better) best = { T, objective: obj, trainBalancedAccuracy: b, priorDistance: priorDist(T) };
  }
  return { T_KG: best ? best.T : null, objective: best ? best.objective : null, trainBalancedAccuracy: best ? best.trainBalancedAccuracy : null, priorDistanceDecades: best ? best.priorDistance : null, alpha, candidates: cands.length, undefinedCandidates };
}
const fitB1 = (train: any[]) => G.fitB1(train);   // G's B1 (distinct training sizes, ties ⇒ smallest T)
const counts = (rows: any[]) => ({ n: rows.length, highIteration: rows.filter(high).length, lowIteration: rows.filter((r: any) => !high(r)).length });

/* rolling-origin over DEV (expanding window) — blocking-only */
function rollingOrigin(dev: any[]): any {
  const folds = PRE.folds.origins.map((o: number) => {
    const train = dev.slice(0, o), test = dev.slice(o, o + PRE.folds.testLen);
    const ct = counts(train), cs = counts(test);
    const valid = ct.highIteration >= PRE.folds.minPerClassTrain && ct.lowIteration >= PRE.folds.minPerClassTrain && cs.highIteration >= PRE.folds.minPerClassTest && cs.lowIteration >= PRE.folds.minPerClassTest;
    if (!valid) return { origin: o, valid: false, train: ct, test: cs };
    const b1 = fitB1(train), kg = fitKG(train);
    const baB1 = baT(test, b1.T_B), baKG = baT(test, kg.T_KG), baK = baT(test, PRE.T_prior);
    return { origin: o, valid: true, train: ct, test: cs, T_B: b1.T_B, T_KG: kg.T_KG, BA: { B1: baB1, KG: baKG, T1000: baK }, deltaB: baKG !== null && baB1 !== null ? r6(baKG - baB1) : null };
  });
  const v = folds.filter((f: any) => f.valid && f.deltaB !== null);
  return { folds, validFolds: v.length, meanDeltaB: v.length ? r6(v.reduce((a: number, f: any) => a + f.deltaB, 0) / v.length) : null,
    role: "DEV is CONTAMINATED — necessary condition only (can BLOCK a PASS, never grant one)" };
}

/* concordance: DEV snapshot rows vs local-git measurement of the same PR (merge-style only) */
function concordance(devRows: any[], localRows: any[]): any {
  const snap = new Map(devRows.map((r: any) => [r.number, r]));
  const pairs: any[] = [];
  for (const l of localRows) {
    const s: any = snap.get(l.number); if (!s) continue;
    const tol = Math.max(PRE.concordance.sizeAbsTol, PRE.concordance.sizeRelTol * s.size);
    pairs.push({ number: l.number, snapshot: { size: s.size, commits: s.commits }, local: { size: l.size, commits: l.commits }, labelAgree: high(s) === high(l), sizeAgree: Math.abs(l.size - s.size) <= tol });
  }
  const n = pairs.length;
  const labelAgreement = n ? pairs.filter((p) => p.labelAgree).length / n : null;
  const sizeAgreement = n ? pairs.filter((p) => p.sizeAgree).length / n : null;
  const ok = n >= PRE.concordance.minRows && labelAgreement !== null && labelAgreement >= PRE.concordance.minLabelAgreement && sizeAgreement !== null && sizeAgreement >= PRE.concordance.minSizeAgreement;
  return { ok, n, labelAgreement, sizeAgreement, required: PRE.concordance, pairs };
}

/* paired bootstrap over held-out rows: same resample for every arm; thresholds fixed (no refit) */
function pairedBootstrap(rows: any[], T_KG: number, T_B: number, seed: number = PRE.bootstrapSeed, B: number = PRE.resamples): any {
  const next = lcgIndex(seed); const n = rows.length;
  const dB: number[] = [], d0: number[] = []; let skipped = 0;
  for (let b = 0; b < B; b++) {
    const s: any[] = []; for (let i = 0; i < n; i++) s.push(rows[next(n)]);
    const c = counts(s);
    if (c.highIteration === 0 || c.lowIteration === 0) { skipped++; continue; }
    const kg = baT(s, T_KG), b1 = baT(s, T_B), b0 = baT(s, null);
    if (kg === null || b1 === null || b0 === null) { skipped++; continue; }
    dB.push(r6(kg - b1)); d0.push(r6(kg - b0));
  }
  dB.sort((a, b) => a - b); d0.sort((a, b) => a - b);
  return { resamples: B, seed, usedResamples: dB.length, skippedResamples: skipped, skippedFraction: skipped / B,
    ci95DeltaB: dB.length ? [q(dB, 0.025), q(dB, 0.975)] : null, ci95Delta0: d0.length ? [q(d0, 0.025), q(d0, 0.975)] : null };
}
const metricsAt = (rows: any[], T: number | null) => { const c = G.confusion(rows, T, high); const m = BCM.classificationMetrics(c); return { T, ...c, balancedAccuracy: m.ok ? m.balancedAccuracy : null, recall: m.ok ? m.recall : null, specificity: m.ok ? m.specificity : null }; };
function evaluateBlock(rows: any[], T_KG: number, T_B: number): any {
  const BA = { KG: baT(rows, T_KG), B1: baT(rows, T_B), B0: baT(rows, null) };
  return { counts: counts(rows), T: { KG: T_KG, B1: T_B }, BA, arms: { KG: metricsAt(rows, T_KG), B1: metricsAt(rows, T_B), B0: metricsAt(rows, null) },
    deltaB: BA.KG !== null && BA.B1 !== null ? r6(BA.KG - BA.B1) : null, delta0: BA.KG !== null && BA.B0 !== null ? r6(BA.KG - BA.B0) : null,
    kgEqualsB1: T_KG === T_B, bootstrap: pairedBootstrap(rows, T_KG, T_B) };
}

/* ------------------------------------------------ grade ------------------------------------------------ */
const fin = (v: any) => typeof v === "number" && Number.isFinite(v);
function grade(g: any): any {
  const nm: string[] = [];
  if (!g.c1ok) nm.push("C1 refused at use time");
  if (!g.devShaOk) nm.push("DEV sha256 ≠ pinned");
  if (g.devHigh !== undefined && (g.devHigh < PRE.minDevPerClass || g.devLow < PRE.minDevPerClass)) nm.push(`minimumN: DEV ${g.devHigh} HIGH / ${g.devLow} LOW (< ${PRE.minDevPerClass})`);
  if (g.validFolds !== undefined && g.validFolds < PRE.minValidFolds) nm.push(`minimumN: ${g.validFolds} VALID rolling-origin folds (< ${PRE.minValidFolds})`);
  if (g.concordanceOk === false) nm.push("concordance check fails");
  if (g.builderOk === false) nm.push(`held-out builder not reproducible or violates its rule${g.builderReason ? ": " + g.builderReason : ""}`);
  if (g.hbHigh !== undefined && (g.hbHigh < PRE.minHbPerClass || g.hbLow < PRE.minHbPerClass)) nm.push(`minimumN: HB ${g.hbHigh} HIGH / ${g.hbLow} LOW (< ${PRE.minHbPerClass})`);
  if (g.skippedFraction !== undefined && g.skippedFraction > PRE.maxSkippedFraction) nm.push(`${g.skippedFraction} > 5% of bootstrap resamples skipped`);
  if (!nm.length) {
    const nums = { deltaB: g.deltaB, delta0: g.delta0, ciLowB: g.ciLowB, ciLow0: g.ciLow0, meanRollingDeltaB: g.meanRollingDeltaB };
    const bad = Object.entries(nums).filter(([, v]) => !fin(v)).map(([k]) => k);
    if (bad.length) nm.push(`non-finite number(s): ${bad.join(", ")}`);
  }
  if (nm.length) return { outcome: "NOT_MEASURED", because: nm };
  const c = {
    deltaB_gt_0: g.deltaB > PRE.pass.deltaBGreaterThan,
    ci95Low_deltaB_gt_0: g.ciLowB > PRE.pass.ciLowDeltaBGreaterThan,
    delta0_ge_0_05: g.delta0 >= PRE.pass.minDelta0,
    ci95Low_delta0_gt_0: g.ciLow0 > PRE.pass.ciLowDelta0GreaterThan,
    meanRollingDeltaB_ge_0: g.meanRollingDeltaB >= PRE.pass.minMeanRollingDeltaB,
  };
  const flags = g.kgEqualsB1 ? ["KG_EQUALS_B1 (T_KG = T_B: no evidence that the knowledge helps)"] : [];
  if (Object.values(c).every(Boolean)) return { outcome: "PASS", passConditions: c, flags };
  if (g.delta0 > PRE.partial.delta0GreaterThan && g.deltaB >= PRE.partial.minDeltaB) return { outcome: "PARTIAL", passConditions: c, flags, because: Object.entries(c).filter(([, v]) => !v).map(([k]) => `PASS condition not met: ${k}`) };
  return { outcome: "FAIL", passConditions: c, flags, because: [g.delta0 <= 0 ? `Δ_0 = ${g.delta0} ≤ 0` : `Δ_B = ${g.deltaB} < −0.02`] };
}
const adoption = (o: string) => (o === "PASS" ? "ADOPTION_CANDIDATE (DESIGN_PROPOSAL only — size-budget advice; independent inspection must accept; no rule, gate or control changed)" : "NOT_ADOPTED");

/* ------------------------------------------------ vault ------------------------------------------------ */
/* Held-out rows enter the vault immediately after the build: only {number, size} is readable; commits (the label source)
 * are released only after seal(). The ordered log is part of the record. */
function makeVault(): any {
  const log: string[] = []; let sealed: string | null = null; const blocks: any = {};
  return {
    log,
    seal(obj: any): string { if (sealed) throw new Error("vault already sealed"); const s: string = sha256(AS.canon(obj)); sealed = s; log.push(`THRESHOLDS_SEALED ${s}`); return s; },
    put(id: string, rows: any[]): void { if (!sealed) throw new Error("ANTI_LEAKAGE: held-out block built before the thresholds were sealed"); blocks[id] = rows; log.push(`${id}_BUILT ${rows.length} rows (labels vaulted)`); },
    features(id: string): any[] { return (blocks[id] || []).map((r: any) => ({ number: r.number, size: r.size })); },
    reveal(id: string): any[] {
      if (!sealed) throw new Error(`ANTI_LEAKAGE: ${id} labels requested before the thresholds were sealed`);
      log.push(`${id}_LABELS_READ`);
      return (blocks[id] || []).map((r: any) => ({ number: r.number, size: r.size, commits: r.commits }));
    },
    sealedWith: () => sealed,
  };
}

/* ------------------------------------------------ experiment core ------------------------------------------------ */
/* experiment(io) — everything after the gate; all I/O injected so --selftest can drive it on synthetic data.
 * io: { c1, devText, concordanceLocalRows(): rows, buildHeldout(): {doc, text}, verifyHeldout(doc): {ok, violations},
 *       existingHeldoutText: string|null, requireExisting: boolean (--check) } */
function experiment(io: any): any {
  const vault = makeVault();
  const devSha = sha256(io.devText);
  const devInfo: any = { path: PRE.dev, sha256: devSha, pinned: PRE.devSha256, matches: devSha === PRE.devSha256 };
  const out: any = { C1: io.c1, dev: devInfo };
  const stop = (because: string[]) => ({ ...out, outcome: "NOT_MEASURED", grade: { outcome: "NOT_MEASURED", because, note: "stopped at the first failing pre-condition (later steps not computed)" }, adoptionDecision: "NOT_ADOPTED", antiLeakageLog: vault.log });
  if (!io.c1 || io.c1.ok !== true) return stop([`C1 refused at use time: ${io.c1 && io.c1.refusal}`]);
  if (!devInfo.matches && io.skipDevPin !== true) return stop(["DEV sha256 ≠ pinned (DEV not opened further)"]);
  let hist: any; try { hist = JSON.parse(io.devText); } catch { return stop(["DEV unparseable"]); }
  const d = G.loadRows(hist); const dev = d.rows;
  devInfo.rows = { raw: d.rawCount, eligible: dev.length, dropped: d.dropped, registered: PRE.devRowsRegistered, matchesRegistration: dev.length === PRE.devRowsRegistered, prRange: dev.length ? [dev[0].number, dev[dev.length - 1].number] : null };
  devInfo.counts = counts(dev);
  if (devInfo.counts.highIteration < PRE.minDevPerClass || devInfo.counts.lowIteration < PRE.minDevPerClass) return stop([`minimumN: DEV ${devInfo.counts.highIteration} HIGH / ${devInfo.counts.lowIteration} LOW (< ${PRE.minDevPerClass})`]);

  // 1. development: rolling-origin on DEV only
  const rolling = rollingOrigin(dev); out.rollingOrigin = rolling;
  vault.log.push(`ROLLING_ORIGIN_DONE ${rolling.validFolds} valid folds (DEV only)`);
  // 2. final fit on all DEV rows, then SEAL before any held-out row exists
  const b1 = fitB1(dev), kg = fitKG(dev);
  const kgAlt = PRE.alphaReportOnly.map((a: number) => fitKG(dev, a));
  const frozen = { T_B: b1.T_B, T_KG: kg.T_KG, alpha: PRE.alpha, T_prior: PRE.T_prior, reportOnly_T_KG_byAlpha: PRE.alphaReportOnly.map((a: number, i: number) => ({ alpha: a, T_KG: kgAlt[i].T_KG })) };
  const sealSha = vault.seal(frozen);
  out.fitted = { B1: b1, KG: kg, reportOnlyKG: kgAlt, frozen, frozenSha256: sealSha, canonical: AS.canon(frozen), sealedBeforeHeldoutBuilt: true };
  if (!fin(b1.T_B) || !fin(kg.T_KG)) return stop(["non-finite fitted threshold"]);

  // 3. DEV/local-git concordance (DEV PRs only)
  const conc = concordance(dev, io.concordanceLocalRows()); out.concordance = conc;
  vault.log.push(`CONCORDANCE_DONE n=${conc.n} ok=${conc.ok}`);

  // 4. held-out build (after the seal), reproducibility + rule check, vault
  const b1st = io.buildHeldout(), b2nd = io.buildHeldout();
  const ver = io.verifyHeldout(b1st.doc);
  const existing = io.existingHeldoutText;
  const reasons: string[] = [];
  if (b1st.text !== b2nd.text) reasons.push("two builds differ");
  if (!ver.ok) reasons.push(`rule violations: ${ver.violations.join("; ")}`);
  if (existing !== null && existing !== b1st.text) reasons.push("existing held-out file differs from the rebuild (never edited after its first build)");
  if (existing === null && io.requireExisting) reasons.push("held-out file absent");
  const builderOk = reasons.length === 0;
  out.heldout = { path: HELDOUT, sha256: sha256(b1st.text), baseCommit: b1st.doc.baseCommit, reproducible: b1st.text === b2nd.text, rule: ver, builderOk, builderReasons: reasons,
    counts: Object.fromEntries(Object.entries(b1st.doc.blocks).map(([k, v]: any) => [k, v.counts])) };
  out._heldoutText = b1st.text;
  vault.put("HB", b1st.doc.blocks.HB.rows); vault.put("HF", (b1st.doc.blocks.HF || { rows: [] }).rows);
  const gBase: any = { c1ok: true, devShaOk: true, devHigh: devInfo.counts.highIteration, devLow: devInfo.counts.lowIteration, validFolds: rolling.validFolds, concordanceOk: conc.ok, builderOk, builderReason: reasons.join("; ") };
  if (!builderOk || !conc.ok || rolling.validFolds < PRE.minValidFolds) { const gr = grade(gBase); return { ...stop(gr.because), grade: { ...gr, note: "stopped before reading HB labels" } }; }

  // 5. HB labels (only now) → primary
  const hb = vault.reveal("HB");
  const primary = evaluateBlock(hb, kg.T_KG, b1.T_B); out.primary = { block: "HB #319–#518 (backward era)", ...primary };
  const gr = grade({ ...gBase, hbHigh: primary.counts.highIteration, hbLow: primary.counts.lowIteration, skippedFraction: primary.bootstrap.skippedFraction,
    deltaB: primary.deltaB, delta0: primary.delta0, ciLowB: primary.bootstrap.ci95DeltaB ? primary.bootstrap.ci95DeltaB[0] : null, ciLow0: primary.bootstrap.ci95Delta0 ? primary.bootstrap.ci95Delta0[0] : null,
    meanRollingDeltaB: rolling.meanDeltaB, kgEqualsB1: primary.kgEqualsB1 });
  vault.log.push(`PRIMARY_GRADED ${gr.outcome}`);

  // 6. REPORT-ONLY (after the primary grade; cannot change it)
  const hf = vault.reveal("HF"); const hfc = counts(hf);
  const reportOnly = {
    role: "REPORT-ONLY — never part of PASS/PARTIAL/FAIL",
    HF: hfc.highIteration >= PRE.minHfPerClassReportOnly && hfc.lowIteration >= PRE.minHfPerClassReportOnly ? { block: "HF #921–#954 (forward era)", ...evaluateBlock(hf, kg.T_KG, b1.T_B) } : { block: "HF #921–#954 (forward era)", counts: hfc, outcome: "NOT_MEASURED (< 5 HIGH or < 5 LOW)" },
    alphaVariantsOnHB: kgAlt.map((k: any) => ({ alpha: k.alpha, T_KG: k.T_KG, BA: baT(hb, k.T_KG), deltaB: fin(baT(hb, k.T_KG)) && fin(primary.BA.B1) ? r6((baT(hb, k.T_KG) as number) - (primary.BA.B1 as number)) : null })),
    K_armsOnHB: PRE.K_reportOnly.map((T: number) => ({ T, ...metricsAt(hb, T) })),
    rocAucRawSizeOnHB: RC.rocAuc(hb.map((r: any) => r.size), hb.map((r: any) => (high(r) ? 1 : 0))),
    rollingOriginPerFold: "see rollingOrigin.folds",
  };
  return { ...out, outcome: gr.outcome, grade: gr, adoptionDecision: adoption(gr.outcome), reportOnly, antiLeakageLog: vault.log };
}

/* ------------------------------------------------ run ------------------------------------------------ */
function gitHead(root: string): string | null { try { return cp.execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; } }
function readText(root: string, rel: string): string | null { try { return fs.readFileSync(path.join(root, rel), "utf8"); } catch { return null; } }

/* run(mode, useAtIso) — mode "RUN" | "CHECK". Returns { notAuthorized } or { record (without run), heldoutText, heldoutExisted }. */
function run(mode: string, useAtIso: string): any {
  const contract = readContract(ROOT);
  const inspection = readInspection(ROOT);
  const g = gate(contract, inspection);
  if (!g.ok) return { notAuthorized: true, reason: g.reason, contractSha256: g.contractSha256 || null };
  const useAt = Date.parse(useAtIso);
  const c1 = Number.isFinite(useAt) ? G.retrieveC1(useAt) : { ok: false, refusal: `useAt ${useAtIso} unparseable` };
  let idx: any = null;
  const existing = readText(ROOT, HELDOUT);
  const res = experiment({
    c1, devText: fs.readFileSync(path.join(ROOT, PRE.dev), "utf8"),
    concordanceLocalRows: () => { const base = cp.execFileSync("git", ["-C", ROOT, "rev-parse", `${PRE.heldoutBaseCommit}^{commit}`], { encoding: "utf8" }).trim(); idx = idx || HB.firstParentIndex(ROOT, base); return HB.measureRange(ROOT, idx, PRE.devRange[0], PRE.devRange[1]).rows; },
    buildHeldout: () => HB.build(ROOT), verifyHeldout: (doc: any) => HB.verifyRule(ROOT, doc),
    existingHeldoutText: existing, requireExisting: mode === "CHECK",
  });
  const heldoutText = res._heldoutText || null; delete res._heldoutText;
  const record = {
    schema: "odg-scenario-experiment/1",
    scenario: "G2", step: STEP, contract: CONTRACTS + "#G2", contractSha256: g.contractSha256,
    authorization: { ...g.scope, inspection: g.inspection, owner: "docs/odg/V170_OWNER_AUTHORIZATION_HG.json#G (V170)", note: "authorized automatically by odg-authorization-scope (R4) under the owner's V170 authorization after an independent inspection ACCEPT; the provider did not self-authorize" },
    outcome: res.outcome,
    grade: { ...res.grade, rule: "first matching of NOT_MEASURED, PASS, PARTIAL, FAIL per WORK_ITEM_CONTRACT.preRegistration.thresholds (mechanical; no re-tuning)", gradedBy: "pre-registered rule only — NOT the independent VALIDATE_CRITERIA step (pending: C4 independent recomputation)" },
    adoptionDecision: res.adoptionDecision,
    useAt: useAtIso,
    inputs: { contracts: { path: CONTRACTS, sha256File: sha256File(ROOT, CONTRACTS) }, inspection: { path: INSPECTION, sha256File: sha256File(ROOT, INSPECTION) }, dev: res.dev, heldout: res.heldout || null },
    preRegistration: PRE,
    C1: res.C1, rollingOrigin: res.rollingOrigin || null, fitted: res.fitted || null, concordance: res.concordance || null,
    primary: res.primary || null, reportOnly: res.reportOnly || null,
    antiLeakage: { log: res.antiLeakageLog, rule: "fits see DEV rows only; T_B / T_KG (+ report-only α variants) sealed (sha256 of canonical JSON) before the held-out block is built; HB labels released only after the seal, HF only after the primary grade" },
    contamination: "as disclosed in WORK_ITEM_CONTRACT.preRegistration.contamination (part of this record by reference; contract sha256 bound above)",
    controls: { changed: false, note: "a PASS yields at most a DESIGN_PROPOSAL (size-budget advice); no rule, gate or control is changed by G2; G and H untouched" },
    ambiguities: [
      "useAt = the dispatch instant (UTC, seconds) recorded here; --check re-evaluates C1 at this recorded useAt",
      "DEV rows = odg-v166-scenario-g-experiment.loadRows (G's row rule: finite additions/deletions/commits and parseable createdAt/mergedAt), sorted by PR number",
      "balanced accuracies are the 6-decimal values of classificationMetrics (as in G); Δ values are rounded to 6 decimals; the KG objective uses that BA minus the full-double penalty; ties = exact equality",
      "a KG/B1 candidate with undefined training BA is not eligible (counted); SPLIT_RECOMMENDED iff size > T is strict",
      "bootstrap: one stream st (initial st = seed 20261202) advanced once per draw, index = st % n; n draws per resample; a resample with 0 HIGH or 0 LOW is skipped and counted; percentiles sorted[floor(p·n)] as in G",
      "concordance: size tolerance max(10, 10% of the SNAPSHOT size); DEV PRs with a unique 2-parent 'Merge pull request #N' first-parent commit at e97bcc43 (builder's measureRange over #519–#920)",
      "git is run with -c diff.renames=true (git's default) --no-ext-diff --no-textconv so a user config cannot change sizes",
      "the held-out file is written only if absent; if present it must equal the rebuild byte-for-byte, else NOT_MEASURED and it is not overwritten",
      "a NOT_MEASURED outcome stops at the first failing pre-condition; expected subject counts (168/32, 34/0) are informational, recorded in heldout.counts",
      "held-out exclusions: a PR number with > 1 first-parent subject (e.g. a 'Merge pull request #N' merge AND a '(#N)' squash subject) is EXCLUDED AMBIGUOUS and listed; the squash exclusion LABEL_NOT_RECOVERABLE_LOCALLY is decided on the '(#N)' subject — the contract's '1 parent' condition is reported by the builder's contractDiagnostics (measured: every squash exclusion at e97bcc43 has 1 parent), not re-applied",
    ],
    honesty: [
      "simulation ≠ test ≠ demonstration ≠ real operation: this is a controlled offline experiment on committed/local-git data",
      "HB is an earlier era (robustness to an era shift, not a forecast); HB keeps merge-style PRs only; commit count is a confounded rework proxy — a PASS is a design proposal, never causation",
      "provider (Claude Code) wrote this runner; the run is ODG GO's dispatch of the contract-declared target; VALIDATE_CRITERIA (independent recomputation) is pending",
    ],
  };
  return { record, heldoutText, heldoutExisted: existing !== null };
}
function serialize(record: any, head: string | null): string {
  return JSON.stringify({ ...record, run: { head, command: `npx tsx ${SELF} ${OUT}`, dispatchedBy: "ODG GO — contract-declared target authorization.dispatchTargets.RUN_CONTROLLED_EXPERIMENTS", note: "head = HEAD of the tree the run executed in" } }, null, 2) + "\n";
}

/* ------------------------------------------------ selftest (synthetic only) ------------------------------------------------ */
function synthGitRepo(): any {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-g2-selftest-"));
  const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z", GIT_CONFIG_NOSYSTEM: "1", HOME: dir };
  const g = (...a: string[]) => cp.execFileSync("git", ["-C", dir, ...a], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const w = (f: string, s: any) => fs.writeFileSync(path.join(dir, f), s);
  g("init", "-q", "-b", "main");
  w("a.txt", "1\n2\n3\n"); g("add", "."); g("commit", "-q", "-m", "init");
  // PR #5: 2 commits (+2 lines, then +1 −1) ⇒ commits 2, size = numstat(M^1, M) = a.txt +3 −1? (computed by git, checked below)
  g("checkout", "-q", "-b", "f5"); w("a.txt", "1\n2\n3\n4\n5\n"); g("commit", "-qam", "c1"); w("a.txt", "1\n2\nX\n4\n5\n"); g("commit", "-qam", "c2");
  g("checkout", "-q", "main"); g("merge", "-q", "--no-ff", "-m", "Merge pull request #5 from x/f5", "f5");
  w("b.txt", "s\n"); g("add", "."); g("commit", "-q", "-m", "feat: squash (#6)");
  g("checkout", "-q", "-b", "f7"); w("bin.dat", Buffer.from([0, 1, 2, 0, 255])); w("c.txt", "c\n"); g("add", "."); g("commit", "-q", "-m", "c3");
  g("checkout", "-q", "main"); g("merge", "-q", "--no-ff", "-m", "Merge pull request #7 from x/f7", "f7");
  return { dir, cleanup: () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } } };
}
function selftest(): number {
  let f = 0; const ok = (n: string, c: boolean) => { process.stdout.write(`${c ? "ok" : "NOT OK"} - ${n}\n`); if (!c) f++; };
  // grade rule
  const base = { c1ok: true, devShaOk: true, devHigh: 50, devLow: 50, validFolds: 3, concordanceOk: true, builderOk: true, hbHigh: 30, hbLow: 30, skippedFraction: 0, kgEqualsB1: false };
  const good = { ...base, deltaB: 0.03, ciLowB: 0.001, delta0: 0.2, ciLow0: 0.1, meanRollingDeltaB: 0 };
  ok("grade: all PASS conditions ⇒ PASS", grade(good).outcome === "PASS");
  ok("grade: Δ_B = 0 ⇒ PARTIAL (strict >)", grade({ ...good, deltaB: 0 }).outcome === "PARTIAL");
  ok("grade: CI low Δ_B = 0 ⇒ PARTIAL", grade({ ...good, ciLowB: 0 }).outcome === "PARTIAL");
  ok("grade: Δ_0 = 0.0499 ⇒ PARTIAL", grade({ ...good, delta0: 0.0499 }).outcome === "PARTIAL");
  ok("grade: CI low Δ_0 = 0 ⇒ PARTIAL", grade({ ...good, ciLow0: 0 }).outcome === "PARTIAL");
  ok("grade: mean rolling Δ_B −0.000001 blocks PASS ⇒ PARTIAL", grade({ ...good, meanRollingDeltaB: -0.000001 }).outcome === "PARTIAL");
  ok("grade: Δ_B = −0.02 ⇒ PARTIAL; −0.020001 ⇒ FAIL", grade({ ...good, deltaB: -0.02, ciLowB: -0.1 }).outcome === "PARTIAL" && grade({ ...good, deltaB: -0.020001, ciLowB: -0.1 }).outcome === "FAIL");
  ok("grade: Δ_0 = 0 ⇒ FAIL", grade({ ...good, delta0: 0, deltaB: 0 }).outcome === "FAIL");
  ok("grade: KG_EQUALS_B1 ⇒ PARTIAL + flag", (() => { const r = grade({ ...good, deltaB: 0, ciLowB: 0, kgEqualsB1: true }); return r.outcome === "PARTIAL" && r.flags.length === 1; })());
  for (const [k, v] of [["c1ok", false], ["devShaOk", false], ["concordanceOk", false], ["builderOk", false], ["hbHigh", 19], ["hbLow", 19], ["devLow", 9], ["validFolds", 1], ["skippedFraction", 0.0505], ["deltaB", NaN], ["ciLow0", null]] as any)
    ok(`grade: ${k} = ${v} ⇒ NOT_MEASURED`, grade({ ...good, [k]: v }).outcome === "NOT_MEASURED");
  ok("grade: exactly 5% skipped is not NOT_MEASURED", grade({ ...good, skippedFraction: 0.05 }).outcome === "PASS");
  ok("adoption: only PASS ⇒ ADOPTION_CANDIDATE", adoption("PASS").startsWith("ADOPTION_CANDIDATE") && adoption("PARTIAL") === "NOT_ADOPTED");
  // arms
  const rows = (spec: number[][]) => spec.map(([size, commits], i) => ({ number: i, size, commits, minutes: 1 }));
  const r1 = rows([[10, 1], [20, 1], [30, 1], [5000, 2], [6000, 2]]);
  ok("KG: perfect separation at 30 vs prior 1000 — BA equal ⇒ prefer 1000 (penalty 0)", fitKG(r1).T_KG === 1000);
  ok("B1: ties ⇒ smallest T", fitB1(r1).T_B === 30);
  const r2 = rows([[10, 1], [20, 1], [50, 2], [60, 1], [3000, 2]]);
  ok("KG candidates include 1000 and the distinct training sizes", fitKG(r2).candidates === 6);
  ok("KG penalty: α·|log10(max(T,1)) − 3| (T=0 ⇒ 3 decades)", priorDist(0) === 3 && priorDist(1000) === 0 && priorDist(100) === 1);
  ok("KG α = 0, BA tie between 10 and 1000 ⇒ the one closest to the prior (1000)", fitKG(rows([[10, 1], [2000, 2]]), 0).T_KG === 1000);
  ok("KG α = 0.05: BA 1 at 30 vs 0.75 at 1000 ⇒ 30 (0.0739 penalty < 0.25 BA gain)", fitKG(rows([[10, 1], [20, 1], [30, 1], [500, 2], [5000, 2]])).T_KG === 30);
  ok("B0 BA = 0.5 by construction", baT(r1, null) === 0.5);
  // LCG index stream
  ok("LCG index: st % n with the pre-registered update", (() => { const nx = lcgIndex(20261202); const st = (Math.imul(20261202, 1664525) + 1013904223) >>> 0; return nx(7) === st % 7; })());
  // vault
  ok("vault: put before seal refused", (() => { const v = makeVault(); try { v.put("HB", []); return false; } catch (e: any) { return /ANTI_LEAKAGE/.test(e.message); } })());
  ok("vault: reveal before seal refused", (() => { const v = makeVault(); try { v.reveal("HB"); return false; } catch (e: any) { return /ANTI_LEAKAGE/.test(e.message); } })());
  ok("vault: features never carry commits", (() => { const v = makeVault(); v.seal({ a: 1 }); v.put("HB", [{ number: 1, size: 2, commits: 3 }]); return JSON.stringify(v.features("HB")) === '[{"number":1,"size":2}]'; })());

  // synthetic end-to-end core (NO real data): synthetic DEV snapshot + synthetic held-out doc
  const rnd = lcgIndex(7);
  const mk = (n0: number, k: number, pHigh: (s: number) => number) => Array.from({ length: k }, (_, i) => { const size = 1 + rnd(4000); return { number: n0 + i, size, commits: rnd(1000) / 1000 < pHigh(size) ? 2 : 1 }; });
  const devPrs = mk(519, 400, (s) => (s > 800 ? 0.7 : 0.2)).map((r) => ({ number: r.number, additions: r.size, deletions: 0, commits: r.commits, createdAt: "2026-01-01T00:00:00Z", mergedAt: "2026-01-01T01:00:00Z" }));
  const devText = JSON.stringify({ prs: devPrs });
  const hbRows = mk(319, 168, (s) => (s > 1000 ? 0.6 : 0.25)).map((r) => ({ ...r, mergeCommit: "0".repeat(40), label: r.commits >= 2 ? "HIGH_ITERATION" : "LOW_ITERATION" }));
  const hfRows = mk(921, 34, () => 0.5).map((r) => ({ ...r, mergeCommit: "0".repeat(40), label: r.commits >= 2 ? "HIGH_ITERATION" : "LOW_ITERATION" }));
  const hdoc = { baseCommit: "0".repeat(40), blocks: { HB: { counts: { rows: hbRows.length }, rows: hbRows, excluded: [] }, HF: { counts: { rows: hfRows.length }, rows: hfRows, excluded: [] } } };
  const htext = JSON.stringify(hdoc);
  const concRows = devPrs.slice(0, 70).map((p) => ({ number: p.number, size: p.additions, commits: p.commits }));
  let builds = 0;
  const io = (over: any = {}) => ({ c1: { ok: true }, devText, skipDevPin: true, concordanceLocalRows: () => concRows, buildHeldout: () => { builds++; return { doc: hdoc, text: htext }; }, verifyHeldout: () => ({ ok: true, violations: [] }), existingHeldoutText: null, requireExisting: false, ...over });
  const e1 = experiment(io()), e2 = experiment(io());
  const strip = (e: any) => JSON.stringify(e);
  ok("synthetic: deterministic (identical result twice)", strip(e1) === strip(e2));
  ok("synthetic: graded to a recognised outcome", ["PASS", "PARTIAL", "FAIL", "NOT_MEASURED"].includes(e1.outcome));
  ok("synthetic: anti-leakage order ROLLING → SEALED → CONCORDANCE → HB_BUILT → HF_BUILT → HB_LABELS → GRADED → HF_LABELS",
    JSON.stringify(e1.antiLeakageLog.map((s: string) => s.split(" ")[0])) === JSON.stringify(["ROLLING_ORIGIN_DONE", "THRESHOLDS_SEALED", "CONCORDANCE_DONE", "HB_BUILT", "HF_BUILT", "HB_LABELS_READ", "PRIMARY_GRADED", "HF_LABELS_READ"]));
  ok("synthetic: sealed sha = sha256(canon(frozen))", e1.fitted.frozenSha256 === sha256(AS.canon(e1.fitted.frozen)) && e1.antiLeakageLog[1] === `THRESHOLDS_SEALED ${e1.fitted.frozenSha256}`);
  ok("synthetic: 3 folds, origins 100/200/300", e1.rollingOrigin.folds.map((x: any) => x.origin).join() === "100,200,300");
  ok("synthetic: bootstrap 2000, seed 20261202, used + skipped = 2000", e1.primary && e1.primary.bootstrap.resamples === 2000 && e1.primary.bootstrap.seed === 20261202 && e1.primary.bootstrap.usedResamples + e1.primary.bootstrap.skippedResamples === 2000);
  ok("synthetic: Δ_B / Δ_0 = BA differences", e1.primary.deltaB === r6(e1.primary.BA.KG - e1.primary.BA.B1) && e1.primary.delta0 === r6(e1.primary.BA.KG - 0.5));
  ok("synthetic: report-only block present (HF, α variants, K arms, AUC)", e1.reportOnly.role.startsWith("REPORT-ONLY") && e1.reportOnly.alphaVariantsOnHB.length === 2 && e1.reportOnly.K_armsOnHB.length === 2);
  ok("synthetic: grade = grade(recorded numbers)", e1.outcome === grade({ ...base, devHigh: e1.dev.counts.highIteration, devLow: e1.dev.counts.lowIteration, validFolds: e1.rollingOrigin.validFolds, hbHigh: e1.primary.counts.highIteration, hbLow: e1.primary.counts.lowIteration, skippedFraction: e1.primary.bootstrap.skippedFraction, deltaB: e1.primary.deltaB, delta0: e1.primary.delta0, ciLowB: e1.primary.bootstrap.ci95DeltaB[0], ciLow0: e1.primary.bootstrap.ci95Delta0[0], meanRollingDeltaB: e1.rollingOrigin.meanDeltaB, kgEqualsB1: e1.primary.kgEqualsB1 }).outcome);
  ok("synthetic: C1 refused ⇒ NOT_MEASURED, held-out never built", (() => { builds = 0; const e = experiment(io({ c1: { ok: false, refusal: "x" } })); return e.outcome === "NOT_MEASURED" && builds === 0 && !e.primary; })());
  ok("synthetic: DEV sha mismatch ⇒ NOT_MEASURED, held-out never built", (() => { builds = 0; const e = experiment(io({ skipDevPin: false })); return e.outcome === "NOT_MEASURED" && builds === 0; })());
  ok("synthetic: non-reproducible build ⇒ NOT_MEASURED before HB labels", (() => { let k = 0; const e = experiment(io({ buildHeldout: () => ({ doc: hdoc, text: htext + (k++) }) })); return e.outcome === "NOT_MEASURED" && !e.antiLeakageLog.includes("HB_LABELS_READ"); })());
  ok("synthetic: edited existing held-out ⇒ NOT_MEASURED", experiment(io({ existingHeldoutText: htext + " " })).outcome === "NOT_MEASURED");
  ok("synthetic: --check with absent held-out ⇒ NOT_MEASURED", experiment(io({ requireExisting: true })).outcome === "NOT_MEASURED");
  ok("synthetic: rule violation ⇒ NOT_MEASURED", experiment(io({ verifyHeldout: () => ({ ok: false, violations: ["x"] }) })).outcome === "NOT_MEASURED");
  ok("synthetic: concordance < 30 rows ⇒ NOT_MEASURED", experiment(io({ concordanceLocalRows: () => concRows.slice(0, 29) })).outcome === "NOT_MEASURED");
  ok("synthetic: concordance label disagreement ⇒ NOT_MEASURED", experiment(io({ concordanceLocalRows: () => concRows.map((r) => ({ ...r, commits: r.commits >= 2 ? 1 : 2 })) })).outcome === "NOT_MEASURED");
  ok("concordance: size tolerance max(10, 10%)", (() => { const c = concordance([{ number: 1, size: 200, commits: 1 }, { number: 2, size: 50, commits: 1 }], [{ number: 1, size: 220, commits: 1 }, { number: 2, size: 61, commits: 1 }]); return c.pairs[0].sizeAgree === true && c.pairs[1].sizeAgree === false; })());

  // builder on a synthetic local git repository (NOT the real history)
  const repo = synthGitRepo();
  try {
    const blocks = { HB: { lo: 5, hi: 8, role: "PRIMARY" } };
    const b = HB.build(repo.dir, { baseCommit: "HEAD", blocks }), b2 = HB.build(repo.dir, { baseCommit: "HEAD", blocks });
    const rws = b.doc.blocks.HB.rows, ex = b.doc.blocks.HB.excluded;
    ok("builder: deterministic", b.text === b2.text);
    ok("builder: merge rows #5 and #7", rws.map((r: any) => r.number).join() === "5,7");
    ok("builder: commits = rev-list --count M^1..M^2 (2 and 1)", rws[0].commits === 2 && rws[1].commits === 1 && rws[0].label === "HIGH_ITERATION" && rws[1].label === "LOW_ITERATION");
    ok("builder: size = numstat sum, binary ⇒ 0 (#5: 2 adds + X/3 change = 3+1; #7: c.txt 1)", rws[0].size === 4 && rws[1].size === 1);
    ok("builder: squash #6 ⇒ LABEL_NOT_RECOVERABLE_LOCALLY; #8 ⇒ NO_FIRST_PARENT_COMMIT", ex.find((e: any) => e.number === 6).reason === "LABEL_NOT_RECOVERABLE_LOCALLY" && ex.find((e: any) => e.number === 8).reason === "NO_FIRST_PARENT_COMMIT");
    ok("builder: verifyRule accepts its own build", HB.verifyRule(repo.dir, b.doc, blocks).ok === true);
    ok("builder: verifyRule rejects a tampered label", (() => { const d2 = JSON.parse(b.text); d2.blocks.HB.rows[1].label = "HIGH_ITERATION"; return HB.verifyRule(repo.dir, d2, blocks).ok === false; })());
  } finally { repo.cleanup(); }

  // gate + confinement on the live contract (no fabricated inspection)
  const live = readContract(ROOT);
  ok("gate: live contract sha = pinned", !!live && AS.contractSha256(live) === PINNED_CONTRACT_SHA);
  ok("gate: constants equal the frozen preRegistration text + dispatch target + write_set", !!live && constantsMismatch(live).length === 0);
  ok("gate: no inspection ⇒ NOT authorized", gate(live, null).ok === false);
  ok("gate: REJECT inspection ⇒ NOT authorized", gate(live, { scenario: "G2", verdict: "REJECT", contractSha256: PINNED_CONTRACT_SHA }).ok === false);
  ok("gate: edited contract ⇒ sha refusal", (() => { const c = JSON.parse(JSON.stringify(live)); c.WORK_ITEM_CONTRACT.preRegistration.thresholds.PASS += " "; const r = gate(c, null); return r.ok === false && /≠ pinned/.test(r.reason); })());
  ok("gate: dispatch-target drift detected", (() => { const c = JSON.parse(JSON.stringify(live)); c.authorization.dispatchTargets[STEP].writeSet.push("x"); return constantsMismatch(c).includes("authorization.dispatchTargets.RUN_CONTROLLED_EXPERIMENTS"); })());
  const insp = readInspection(ROOT);
  if (insp) ok("gate: committed inspection present ⇒ authorized", gate(live, insp).ok === true);
  else process.stdout.write("skip - inspection record absent in this tree (gate refuses ⇒ NOT_AUTHORIZED at run time)\n");
  ok("confinement: declared output accepted", outputPathOk(OUT));
  ok("confinement: other paths refused", !outputPathOk(HELDOUT) && !outputPathOk("./" + OUT) && !outputPathOk("/tmp/x.json") && !outputPathOk("runtime/generated/x.json") && !outputPathOk(undefined));
  process.stdout.write(`\n${f === 0 ? "ALL PASS" : f + " FAILURE(S)"}\n`);
  return f === 0 ? 0 : 1;
}

/* ------------------------------------------------ CLI ------------------------------------------------ */
if (require.main === module) {
  const argv = process.argv.slice(2);
  const positional = argv.filter((a) => !a.startsWith("-"));
  const flags = argv.filter((a) => a.startsWith("-"));
  const knownFlags = ["--check", "--check-at-run-head", "--selftest"];
  if (flags.some((x) => !knownFlags.includes(x)) || flags.length > 1) { process.stdout.write(`REFUSED — unknown/multiple flags ${JSON.stringify(flags)}; nothing written\n`); process.exitCode = 3; }
  else if (argv.includes("--selftest")) { process.exitCode = selftest(); }
  else if (positional.length !== 1 || !outputPathOk(positional[0])) {
    process.stdout.write(`REFUSED — output path must be exactly the contract-declared ${OUT} (got ${JSON.stringify(positional)}); nothing written\n`); process.exitCode = 3;
  } else if (argv.includes("--check-at-run-head")) {
    /* the record's OWN --check at record.run.head (temp detached worktree, local objects only). The committed held-out
     * file is placed byte-identical into that temporary worktree too (it is an input of --check), nothing in this tree. */
    const heldBytes = (() => { try { return fs.readFileSync(path.join(ROOT, HELDOUT)); } catch { return null; } })();
    const r = RHC.checkAtRunHead({ repoRoot: ROOT, recordRel: OUT, runnerRel: SELF, checkArgs: ["--check", OUT],
      command: (wt: string) => { if (heldBytes) fs.writeFileSync(path.join(wt, HELDOUT), heldBytes); return [path.join(wt, "node_modules", ".bin", "tsx"), [SELF, "--check", OUT]]; } });
    process.stdout.write(RHC.format("V172 G2", r) + `  current tree HEAD (not used for recomputation): ${gitHead(ROOT)}\n` + (r.verdict === "CHECK_OK" ? "RESULT: CHECK OK at run head\n" : "RESULT: FAILED\n"));
    process.exitCode = r.verdict === "CHECK_OK" ? 0 : 1;
  } else if (argv.includes("--check")) {
    let cur: any = null; try { cur = JSON.parse(fs.readFileSync(path.join(ROOT, OUT), "utf8")); } catch { cur = null; }
    if (!cur || typeof cur.useAt !== "string") { process.stdout.write("CHECK FAILED — V172 G2 experiment record absent or without useAt\n"); process.exitCode = 1; }
    else {
      const res = run("CHECK", cur.useAt);
      if (res.notAuthorized) { process.stdout.write(`NOT_AUTHORIZED — ${res.reason}; nothing written\n`); process.exitCode = 2; }
      else {
        const same = JSON.stringify(cur, null, 2) + "\n" === serialize(res.record, cur.run ? cur.run.head : null);
        process.stdout.write(same ? `CHECK OK (outcome ${res.record.outcome}; held-out sha256 ${res.record.inputs.heldout && res.record.inputs.heldout.sha256})\n` : "CHECK FAILED — V172 G2 experiment record drifts\n");
        process.exitCode = same ? 0 : 1;
      }
    }
  } else {
    const t0 = Date.now();
    const useAtIso = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString().replace(".000Z", "Z");
    const res = run("RUN", useAtIso);
    if (res.notAuthorized) { process.stdout.write(`NOT_AUTHORIZED — ${res.reason}; nothing written\n`); process.exitCode = 2; }
    else {
      const head = gitHead(ROOT);
      // held-out first (iff absent and the builder was reproducible + rule-conformant), then the record — the only two writes
      if (!res.heldoutExisted && res.heldoutText && res.record.inputs.heldout && res.record.inputs.heldout.builderOk) fs.writeFileSync(path.join(ROOT, HELDOUT), res.heldoutText);
      fs.writeFileSync(path.join(ROOT, OUT), serialize(res.record, head));
      const p = res.record.primary;
      process.stdout.write(JSON.stringify({ outcome: res.record.outcome, adoption: res.record.adoptionDecision, because: res.record.grade.because || null, T: p && p.T, BA: p && p.BA, deltaB: p && p.deltaB, ci95DeltaB: p && p.bootstrap.ci95DeltaB, delta0: p && p.delta0, ci95Delta0: p && p.bootstrap.ci95Delta0, wrote: [res.heldoutExisted ? null : HELDOUT, OUT].filter(Boolean), seconds: (Date.now() - t0) / 1000 }, null, 1) + "\n");
    }
  }
}
module.exports = { gate, constantsMismatch, outputPathOk, fitKG, fitB1, rollingOrigin, concordance, pairedBootstrap, evaluateBlock, grade, adoption, makeVault, experiment, lcgIndex, run, serialize, selftest, PRE, PINNED_CONTRACT_SHA, OUT, HELDOUT, SELF };
export {};
