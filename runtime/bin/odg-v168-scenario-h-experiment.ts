#!/usr/bin/env node
"use strict";
/*
 * V16.8 — SCENARIO H, step RUN_CONTROLLED_EXPERIMENTS (contract docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json#H,
 * revised + independently inspected — docs/odg/evidence/V168_H_CONTRACT_INSPECTION.json). This file is the contract's
 * DECLARED dispatch target authorization.dispatchTargets.RUN_CONTROLLED_EXPERIMENTS (GO-DT-1): ODG GO runs
 *   npx tsx runtime/bin/odg-v168-scenario-h-experiment.ts docs/odg/evidence/V168_H_EXPERIMENT.json
 * in an isolated scratch worktree. Provider (Claude Code) wrote this runner; the run itself is ODG GO's dispatch.
 *
 * Implements WORK_ITEM_CONTRACT.preRegistration LITERALLY (constants copied verbatim and asserted against the live text):
 *   dataset V168_H_HELDOUT.json (sha256 pinned) · rows sorted by PR number · DEV = first 200, HELDOUT = last 199 ·
 *   label HIGH_ITERATION (as written by the builder) · H1 = odg-verification-risk-calibration fitted on DEV ONLY ·
 *   B0 = levelRank + reinforced · B1 = log1p(#changedFiles) · ROC AUC · Δ0 = AUC(H1) − AUC(B0), Δ1 = AUC(H1) − AUC(B1) ·
 *   paired bootstrap 2000 resamples, LCG seed 20261128, CI95 = 2.5/97.5 percentiles · min-n · grade = first matching of
 *   NOT_MEASURED, PASS, PARTIAL, FAIL · report-only secondary random split (Fisher–Yates, LCG seed 20261129).
 *
 * GATE (fail-closed, BEFORE the dataset is opened; exit 2 NOT_AUTHORIZED and NOTHING written):
 *   - sha256(canon(live contract H)) === PINNED_CONTRACT_SHA;
 *   - odg-authorization-scope.deriveAuthorizationScope(contract, {inspection}) authorizes RUN_CONTROLLED_EXPERIMENTS;
 *   - runner constants equal the frozen preRegistration text; the declared dispatch target is this file + writeSet [OUT].
 * WRITE CONFINEMENT: the output path comes from argv and must EQUAL the contract-declared writeSet entry (else exit 3,
 *   nothing written); the runner writes exactly that one file (single writeFileSync, no temp file) and nothing else
 *   (chooseLevel is read-only; no cache/dist/runtime/generated output).
 * ANTI-LEAKAGE: labels live in a LabelVault; features of every row are computed first (no label), then DEV labels are
 *   revealed, H1 is fitted, the weights + their sha256 are SEALED into the record, and only then does the vault release
 *   HELDOUT labels (reveal("HELDOUT") throws before sealing). The ordered reveal log is part of the record.
 *
 * Usage:  <out-path>            run + write the record to <out-path> (must be the declared writeSet entry)
 *         --check <out-path>    recompute and compare with the committed record (exit 1 on drift; writes nothing)
 *         --check-at-run-head <out-path>  V17.2: the record's OWN --check at record.run.head (temp detached worktree)
 *         --selftest            offline synthetic checks (no dataset, no label, nothing written)
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cp = require("child_process");
const AS = require("../core/odg-authorization-scope.js");
const OCUR = require("../core/odg-observation-currency.js");   // V16.9 Phase 1b — R7 proof-currency probes
const VL = require("../core/odg-verification-level.js");
const RC = require("../core/odg-verification-risk-calibration.js");
const RHC = require("../core/odg-run-head-check.js");      // V17.2 — reproducibility at the record's own run head

const ROOT = path.resolve(__dirname, "..", "..");
const CONTRACTS = "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json";
const INSPECTION = "docs/odg/evidence/V168_H_CONTRACT_INSPECTION.json";
const SELF = "runtime/bin/odg-v168-scenario-h-experiment.ts";
const OUT = "docs/odg/evidence/V168_H_EXPERIMENT.json";
const STEP = "RUN_CONTROLLED_EXPERIMENTS";

/* ---- frozen pre-registration constants (verbatim from contract H; asserted against the live text by gate()) ---- */
const PINNED_CONTRACT_SHA = "8436885a2d483c4f26db3753de6fdbc6dd42296602ede9be7d4b9860c8e672e2";
const PRE = Object.freeze({
  dataset: "docs/odg/evidence/V168_H_HELDOUT.json",
  datasetSha256: "d8bf4a3f5e4b3a6bdc0700183b710c38acc2ae0d786aa6303ff7868ddd26fcb1",
  devN: 200, heldoutN: 199,
  positiveLabel: "HIGH_ITERATION", negativeLabel: "LOW_ITERATION",
  resamples: 2000, bootstrapSeed: 20261128, secondarySplitSeed: 20261129,
  maxSkippedFraction: 0.05,
  minHeldoutPerClass: 20, minDevPerClass: 10,
  pass: Object.freeze({ minDelta0: 0.05, ciLowDelta0GreaterThan: 0, delta1GreaterThan: 0, ciLowDelta1GreaterThan: 0, minAucH1: 0.55 }),
  hyper: RC.HYPER,
});

const sha256 = (b: any) => crypto.createHash("sha256").update(b).digest("hex");
/* fixed-seed LCG — identical formula to odg-v160-scenario-g-run / odg-v166-scenario-g-experiment */
function lcg(seed: number): () => number { let st = seed >>> 0; return () => { st = (Math.imul(st, 1664525) + 1013904223) >>> 0; return st / 4294967296; }; }
/* percentile — identical to odg-v166-scenario-g-experiment (sorted[floor(p·n)], clamped) */
function q(sorted: number[], p: number): number { return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))]; }

/* ------------------------------------------------ gate ------------------------------------------------ */
function readContractH(root: string): any {
  const all = JSON.parse(fs.readFileSync(path.join(root, CONTRACTS), "utf8"));
  return (all.contracts || []).find((c: any) => c && c.scenario === "H") || null;
}
function readInspection(root: string): any { try { return JSON.parse(fs.readFileSync(path.join(root, INSPECTION), "utf8")); } catch { return null; } }
/* gate(contract, inspection) — pure over its inputs (the CLI passes the live files). */
function gate(contract: any, inspection: any): any {
  if (!contract) return { ok: false, reason: "contract H not found" };
  const sha = AS.contractSha256(contract);
  if (sha !== PINNED_CONTRACT_SHA) return { ok: false, reason: `live contract sha256 ${sha} ≠ pinned ${PINNED_CONTRACT_SHA} (contract edited — inspection invalid)`, contractSha256: sha };
  const scope = AS.deriveAuthorizationScope(contract, { inspection, probes: OCUR.localGitProbes(ROOT) });   // V16.9 R7: inspected head verified in local git
  if (!AS.isStepAuthorized(scope, STEP) || scope.currentStep !== STEP || scope.executionAuthorized !== true) return { ok: false, reason: `deriveAuthorizationScope does not authorize ${STEP} now: ${scope.reason}`, contractSha256: sha };
  const pr = contract.WORK_ITEM_CONTRACT.preRegistration;
  const mm: string[] = [];
  const need = (k: string, s: any, res: RegExp[]) => { if (typeof s !== "string" || !res.every((r) => r.test(s))) mm.push(k); };
  if (pr.dataset.sha256 !== PRE.datasetSha256) mm.push("dataset.sha256");
  if (pr.dataset.file !== PRE.dataset) mm.push("dataset.file");
  need("dataset.split", pr.dataset.split, [/sorted by PR number ascending/, /first 200 rows/, /last 199 rows/]);
  need("outcomeLabel", pr.outcomeLabel, [/HIGH_ITERATION iff commits ≥ 2/, /stored per row in the dataset/]);
  need("mechanism.improvement", pr.mechanism.improvement, [/Fit on DEV ONLY/, /population sd/, /sd = 0 ⇒ feature weight fixed at 0/, /λ = 1/, /intercept not penalized/, /all-zero weights/, /learning rate 0\.1/, /5000 iterations/, /f8 \(#plan\.files with class DOC\)/]);
  need("baseline.B0_primary", pr.baseline.B0_primary, [/s0 = levelRank \+ \(reinforced \? 1 : 0\)/]);
  need("baseline.B1_comparator", pr.baseline.B1_comparator, [/s1 = log1p\(#changedFiles\)/]);
  need("metric", pr.metric, [/ROC AUC/, /ties count 0\.5/, /Δ0 = AUC\(H1\) − AUC\(B0\)/, /Δ1 = AUC\(H1\) − AUC\(B1\)/]);
  need("uncertainty", pr.uncertainty, [/2000 resamples/, /seed 20261128/, /0 positives or 0 negatives is skipped and counted/, /2\.5\/97\.5 percentiles/]);
  need("minimumN", pr.minimumN, [/HELDOUT ≥ 20 HIGH_ITERATION and ≥ 20 LOW_ITERATION/, /DEV ≥ 10 of each/]);
  need("thresholds.NOT_MEASURED", pr.thresholds.NOT_MEASURED, [/sha256 ≠ the pinned value/, /minimumN not met/, /chooseLevel throws on any row/, /non-finite weight/, /> 5% of bootstrap resamples skipped/]);
  need("thresholds.PASS", pr.thresholds.PASS, [/Δ0 ≥ 0\.05/, /CI95 lower bound of Δ0 > 0/, /Δ1 > 0/, /CI95 lower bound of Δ1 > 0/, /AUC\(H1\) ≥ 0\.55/]);
  need("thresholds.PARTIAL", pr.thresholds.PARTIAL, [/Δ0 > 0 but the PASS conditions are not all met/]);
  need("thresholds.FAIL", pr.thresholds.FAIL, [/Δ0 ≤ 0/]);
  need("secondaryRobustness.split", pr.secondaryRobustness && pr.secondaryRobustness.split, [/Fisher–Yates/, /seed 20261129/, /first 200 = DEV, last 199 = HELDOUT/]);
  const dt = contract.authorization && contract.authorization.dispatchTargets && contract.authorization.dispatchTargets[STEP];
  if (!dt || dt.command !== SELF || JSON.stringify(dt.args) !== JSON.stringify([OUT]) || JSON.stringify(dt.writeSet) !== JSON.stringify([OUT])) mm.push("authorization.dispatchTargets.RUN_CONTROLLED_EXPERIMENTS");
  if (mm.length) return { ok: false, reason: "runner constants diverge from the frozen contract: " + mm.join(", "), contractSha256: sha };
  return { ok: true, contractSha256: sha, declaredOutput: OUT,
    scope: { currentStep: scope.currentStep, authorizedSteps: scope.authorizedSteps, derivedSteps: scope.derivedSteps.map((d: any) => ({ step: d.step, rule: d.rule, coveredBy: d.coveredBy })), reason: scope.reason, independenceLevel: scope.independenceLevel, selfAuthorized: scope.selfAuthorized },
    inspection: { path: INSPECTION, verdict: inspection.verdict, inspectedHeadSha: inspection.inspectedHeadSha, inspectedPr: inspection.inspectedPr, inspectorSessionId: inspection.inspectorSessionId, authorSessionId: inspection.authorSessionId } };
}
/* write confinement: argv output path must be EXACTLY the declared writeSet entry (repo-relative, resolved under ROOT). */
function outputPathOk(arg: any, root: string = ROOT): boolean {
  if (typeof arg !== "string" || !arg) return false;
  return path.resolve(root, arg) === path.resolve(root, OUT) && path.normalize(arg) === OUT;
}

/* ------------------------------------------------ data + label vault ------------------------------------------------ */
/* LabelVault — HELDOUT labels are unreachable until the fitted model is sealed. The ordered log goes in the record. */
function makeVault(labelsBySplit: any): any {
  const log: string[] = []; let sealed: string | null = null;
  return {
    log,
    reveal(split: string): number[] {
      if (split === "HELDOUT" && !sealed) throw new Error("ANTI_LEAKAGE: HELDOUT labels requested before the fitted weights were sealed");
      if (split === "ALL" && !sealed) throw new Error("ANTI_LEAKAGE: all labels requested before the fitted weights were sealed");
      log.push(`${split}_LABELS_READ`);
      return split === "ALL" ? labelsBySplit.DEV.concat(labelsBySplit.HELDOUT) : labelsBySplit[split].slice();
    },
    seal(modelSha: string): void { if (sealed) throw new Error("vault already sealed"); sealed = modelSha; log.push(`WEIGHTS_SEALED ${modelSha}`); },
    sealedWith: () => sealed,
  };
}
/* loadDataset(doc) → { ok, inputs:[{number, split, changedFiles}] (label-free), vault, counts } | { ok:false, reason } */
function loadDataset(doc: any): any {
  const raw = doc && Array.isArray(doc.rows) ? doc.rows : null;
  if (!raw) return { ok: false, reason: "dataset has no rows array" };
  const rows = raw.slice().sort((a: any, b: any) => a.number - b.number);
  for (const r of rows) {
    if (!Number.isInteger(r.number) || !Array.isArray(r.changedFiles) || !r.changedFiles.every((f: any) => typeof f === "string")) return { ok: false, reason: `malformed row #${r && r.number}` };
    if (r.label !== PRE.positiveLabel && r.label !== PRE.negativeLabel) return { ok: false, reason: `row #${r.number}: label not ${PRE.positiveLabel}/${PRE.negativeLabel}` };
  }
  if (rows.length !== PRE.devN + PRE.heldoutN) return { ok: false, reason: `dataset has ${rows.length} rows ≠ ${PRE.devN + PRE.heldoutN} pre-registered` };
  const inputs = rows.map((r: any, i: number) => ({ number: r.number, split: i < PRE.devN ? "DEV" : "HELDOUT", changedFiles: r.changedFiles.slice() }));
  const splitMismatch = rows.filter((r: any, i: number) => r.split !== inputs[i].split).map((r: any) => r.number);
  if (splitMismatch.length) return { ok: false, reason: `stored split field disagrees with the pre-registered split for PR(s) ${splitMismatch.slice(0, 5).join(", ")}` };
  const y = (r: any) => (r.label === PRE.positiveLabel ? 1 : 0);
  const vault = makeVault({ DEV: rows.slice(0, PRE.devN).map(y), HELDOUT: rows.slice(PRE.devN).map(y) });
  const range = (a: any[]) => (a.length ? [a[0].number, a[a.length - 1].number] : null);
  return { ok: true, inputs, vault, counts: { rows: rows.length, dev: PRE.devN, heldout: PRE.heldoutN, devPrRange: range(inputs.slice(0, PRE.devN)), heldoutPrRange: range(inputs.slice(PRE.devN)) } };
}

/* memoized fsReader(root): identical answers on the static scratch tree, computed once (preRegistration.featureComputation). */
function memoReader(root: string): any {
  const base = VL.fsReader(root);
  const memo = (fn: any) => { const m = new Map(); return (k: any) => { if (!m.has(k)) m.set(k, fn(k)); return m.get(k); }; };
  let g: any = null, gDone = false, gErr: any = null;
  return { root, exists: memo(base.exists), read: memo(base.read), list: memo(base.list), realRel: memo(base.realRel), walk: memo(base.walk),
    graph: () => { if (!gDone) { try { g = base.graph(); } catch (e) { gErr = e; } gDone = true; } if (gErr) throw gErr; return g; } };
}
/* plans + features for every row — NO label is touched here. Any throw ⇒ recorded, never silently dropped. */
function computeFeatures(inputs: any[], root: string, choose: any = VL.chooseLevel): any {
  const reader = memoReader(root);
  const out: any[] = []; const errors: any[] = [];
  for (const r of inputs) {
    try {
      const plan = choose(r.changedFiles, { root, reader });
      out.push({ number: r.number, split: r.split, x: RC.features(plan, r.changedFiles), b0: RC.b0Score(plan), b1: RC.b1Score(r.changedFiles), level: plan.level, reinforced: plan.reinforced });
    } catch (e: any) { errors.push({ number: r.number, error: String(e && e.message || e).slice(0, 200) }); }
  }
  return { rows: out, errors };
}

/* ------------------------------------------------ metrics ------------------------------------------------ */
function pairedBootstrap(sH: number[], s0: number[], s1: number[], y: number[], seed: number = PRE.bootstrapSeed, B: number = PRE.resamples): any {
  const rnd = lcg(seed); const n = y.length;
  const d0: number[] = [], d1: number[] = []; let skipped = 0;
  for (let b = 0; b < B; b++) {
    const idx: number[] = []; for (let i = 0; i < n; i++) idx.push(Math.floor(rnd() * n));
    const yy = idx.map((i) => y[i]);
    const aH = RC.rocAuc(idx.map((i) => sH[i]), yy), a0 = RC.rocAuc(idx.map((i) => s0[i]), yy), a1 = RC.rocAuc(idx.map((i) => s1[i]), yy);
    if (aH === null || a0 === null || a1 === null) { skipped++; continue; }
    d0.push(aH - a0); d1.push(aH - a1);
  }
  d0.sort((a, b) => a - b); d1.sort((a, b) => a - b);
  return { resamples: B, seed, usedResamples: d0.length, skippedResamples: skipped, skippedFraction: skipped / B,
    ci95Delta0: d0.length ? [q(d0, 0.025), q(d0, 0.975)] : null, ci95Delta1: d1.length ? [q(d1, 0.025), q(d1, 0.975)] : null };
}
const classCounts = (y: number[]) => ({ n: y.length, highIteration: y.filter((v) => v === 1).length, lowIteration: y.filter((v) => v === 0).length });
/* evaluate a SEALED model on rows with their labels (paired: same rows, same plan for every score). */
function evaluate(model: any, rows: any[], y: number[], seed: number = PRE.bootstrapSeed): any {
  const sH = rows.map((r) => RC.score(model, r.x)), s0 = rows.map((r) => r.b0), s1 = rows.map((r) => r.b1);
  const aucH1 = RC.rocAuc(sH, y), aucB0 = RC.rocAuc(s0, y), aucB1 = RC.rocAuc(s1, y);
  return { counts: classCounts(y), auc: { H1: aucH1, B0: aucB0, B1: aucB1 },
    delta0: aucH1 !== null && aucB0 !== null ? aucH1 - aucB0 : null, delta1: aucH1 !== null && aucB1 !== null ? aucH1 - aucB1 : null,
    bootstrap: pairedBootstrap(sH, s0, s1, y, seed) };
}

/* grade = first matching of NOT_MEASURED, PASS, PARTIAL, FAIL (preRegistration.thresholds) — mechanical, never upgraded */
function grade(g: any): any {
  const nm: string[] = [];
  if (!g.datasetShaOk) nm.push("dataset sha256 ≠ the pinned value");
  if (g.datasetError) nm.push(`dataset unusable: ${g.datasetError}`);
  if (g.chooseLevelErrors > 0) nm.push(`chooseLevel threw on ${g.chooseLevelErrors} row(s)`);
  if (g.devHigh !== undefined && (g.devHigh < PRE.minDevPerClass || g.devLow < PRE.minDevPerClass)) nm.push(`minimumN: DEV ${g.devHigh} HIGH / ${g.devLow} LOW (< ${PRE.minDevPerClass})`);
  if (g.weightsFinite === false) nm.push("the fit yields a non-finite weight");
  if (g.heldoutHigh !== undefined && (g.heldoutHigh < PRE.minHeldoutPerClass || g.heldoutLow < PRE.minHeldoutPerClass)) nm.push(`minimumN: HELDOUT ${g.heldoutHigh} HIGH / ${g.heldoutLow} LOW (< ${PRE.minHeldoutPerClass})`);
  if (g.skippedFraction !== undefined && g.skippedFraction > PRE.maxSkippedFraction) nm.push(`${g.skippedFraction} > 5% of bootstrap resamples skipped`);
  if (!nm.length && (g.delta0 === null || g.delta0 === undefined)) nm.push("Δ0 undefined");
  if (nm.length) return { outcome: "NOT_MEASURED", because: nm };
  const c = {
    delta0_ge_0_05: g.delta0 >= PRE.pass.minDelta0,
    ci95Low_delta0_gt_0: g.ciLow0 !== null && g.ciLow0 > PRE.pass.ciLowDelta0GreaterThan,
    delta1_gt_0: g.delta1 !== null && g.delta1 > PRE.pass.delta1GreaterThan,
    ci95Low_delta1_gt_0: g.ciLow1 !== null && g.ciLow1 > PRE.pass.ciLowDelta1GreaterThan,
    aucH1_ge_0_55: g.aucH1 !== null && g.aucH1 >= PRE.pass.minAucH1,
  };
  if (Object.values(c).every(Boolean)) return { outcome: "PASS", passConditions: c };
  if (g.delta0 > 0) return { outcome: "PARTIAL", passConditions: c, because: Object.entries(c).filter(([, v]) => !v).map(([k]) => `PASS condition not met: ${k}`) };
  return { outcome: "FAIL", passConditions: c, because: [`Δ0 = ${g.delta0} ≤ 0`] };
}
const adoption = (outcome: string) => (outcome === "PASS" ? "ADOPTION_CANDIDATE (advisory only — wiring into chooseLevel or any gate needs a separate decision)" : "NOT_ADOPTED");

/* secondary: Fisher–Yates (i = n−1 … 1, j = floor(rnd·(i+1))) over the PR-number-sorted rows, LCG seed 20261129 */
function shuffled(rows: any[], seed: number): any[] {
  const a = rows.slice(); const rnd = lcg(seed);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

/* ------------------------------------------------ experiment ------------------------------------------------ */
/* experiment(datasetText, root, opts) — everything after the gate. Pure except chooseLevel's read-only tree access. */
function experiment(datasetText: string, root: string, opts: any = {}): any {
  const dsSha = sha256(datasetText);
  const datasetShaOk = dsSha === PRE.datasetSha256 || opts.skipShaPin === true;
  const dsInfo: any = { path: PRE.dataset, sha256: dsSha, pinned: PRE.datasetSha256, matches: dsSha === PRE.datasetSha256 };
  const nm = (because: any, extra: any = {}) => ({ outcome: "NOT_MEASURED", grade: { outcome: "NOT_MEASURED", because }, adoptionDecision: "NOT_ADOPTED", dataset: dsInfo, ...extra });
  if (!datasetShaOk) return nm(["dataset sha256 ≠ the pinned value (dataset not opened further)"]);
  let doc: any; try { doc = JSON.parse(datasetText); } catch { return nm(["dataset unusable: unparseable JSON"]); }
  const ds = loadDataset(doc);
  if (!ds.ok) return nm([`dataset unusable: ${ds.reason}`]);
  dsInfo.counts = ds.counts;
  const vault = ds.vault;

  // 1. features for EVERY row — no label read
  const feats = computeFeatures(ds.inputs, root, opts.chooseLevel);
  vault.log.push(`FEATURES_COMPUTED ${feats.rows.length}/${ds.inputs.length} rows (no label read)`);
  const levelHistogram: any = {};
  for (const r of feats.rows) { const k = r.level + (r.reinforced ? "+REINFORCED" : ""); levelHistogram[k] = (levelHistogram[k] || 0) + 1; }
  const featureComputation = { rows: feats.rows.length, chooseLevelErrors: feats.errors, levelHistogram, reader: "fsReader(root) memoized (exists/read/list/realRel/walk/graph) on the scratch tree" };
  if (feats.errors.length) return nm([`chooseLevel threw on ${feats.errors.length} row(s) (no silent drop)`], { featureComputation, antiLeakageLog: vault.log });

  // 2. DEV labels → fit → seal
  const dev = feats.rows.filter((r: any) => r.split === "DEV"), held = feats.rows.filter((r: any) => r.split === "HELDOUT");
  const yDev = vault.reveal("DEV");
  const devCounts = classCounts(yDev);
  if (devCounts.highIteration < PRE.minDevPerClass || devCounts.lowIteration < PRE.minDevPerClass) return nm([`minimumN: DEV ${devCounts.highIteration} HIGH / ${devCounts.lowIteration} LOW (< ${PRE.minDevPerClass})`], { featureComputation, dev: devCounts, antiLeakageLog: vault.log });
  const model = RC.fit(dev.map((r: any) => r.x), yDev, PRE.hyper);
  const mSha = RC.modelSha256(model);
  vault.seal(mSha);
  const fitted = { model, modelSha256: mSha, sealedBeforeHeldoutLabels: true };
  if (!model.finite) return nm(["the fit yields a non-finite weight"], { featureComputation, dev: devCounts, fitted, antiLeakageLog: vault.log });

  // 3. HELDOUT labels (only now) → evaluate
  const yHeld = vault.reveal("HELDOUT");
  const primary = evaluate(model, held, yHeld);
  const f1Auc = RC.rocAuc(held.map((r: any) => r.x[0]), yHeld);
  const gr = grade({ datasetShaOk: true, chooseLevelErrors: 0, devHigh: devCounts.highIteration, devLow: devCounts.lowIteration, weightsFinite: true,
    heldoutHigh: primary.counts.highIteration, heldoutLow: primary.counts.lowIteration, skippedFraction: primary.bootstrap.skippedFraction,
    delta0: primary.delta0, ciLow0: primary.bootstrap.ci95Delta0 ? primary.bootstrap.ci95Delta0[0] : null,
    delta1: primary.delta1, ciLow1: primary.bootstrap.ci95Delta1 ? primary.bootstrap.ci95Delta1[0] : null, aucH1: primary.auc.H1 });

  // 4. REPORT-ONLY secondary random split (after the primary is sealed and evaluated; cannot change the grade)
  const yAll = vault.reveal("ALL");
  const all = feats.rows.map((r: any, i: number) => ({ ...r, y: yAll[i] }));
  const sh = shuffled(all, PRE.secondarySplitSeed);
  const sDev = sh.slice(0, PRE.devN), sHeld = sh.slice(PRE.devN);
  const sModel = RC.fit(sDev.map((r: any) => r.x), sDev.map((r: any) => r.y), PRE.hyper);
  const sEval = evaluate(sModel, sHeld, sHeld.map((r: any) => r.y));

  return {
    outcome: gr.outcome, grade: gr, adoptionDecision: adoption(gr.outcome), dataset: dsInfo, featureComputation, dev: devCounts, fitted,
    primary: { split: `rows sorted by PR number ascending; DEV = first ${PRE.devN} (#${ds.counts.devPrRange.join("–#")}), HELDOUT = last ${PRE.heldoutN} (#${ds.counts.heldoutPrRange.join("–#")})`, ...primary },
    secondaryRobustness: { role: "REPORT-ONLY — never part of PASS/PARTIAL/FAIL", split: `Fisher–Yates with LCG seed ${PRE.secondarySplitSeed} over the PR-sorted rows; first ${PRE.devN} = DEV, last ${PRE.heldoutN} = HELDOUT; H1 refitted on that DEV`,
      dev: classCounts(sDev.map((r: any) => r.y)), fitted: { model: sModel, modelSha256: RC.modelSha256(sModel) }, ...sEval,
      aucF1LevelRankAlone_primaryHeldout: f1Auc },
    antiLeakageLog: vault.log,
  };
}

function gitHead(root: string): string | null { try { return cp.execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; } }

function run(): any {
  const contract = readContractH(ROOT);
  const inspection = readInspection(ROOT);
  const g = gate(contract, inspection);
  if (!g.ok) return { notAuthorized: true, reason: g.reason, contractSha256: g.contractSha256 || null };
  const text = fs.readFileSync(path.join(ROOT, PRE.dataset), "utf8");
  const res = experiment(text, ROOT);
  return {
    schema: "odg-scenario-experiment/1",
    scenario: "H", step: STEP, contract: CONTRACTS + "#H", contractSha256: g.contractSha256,
    authorization: { ...g.scope, inspection: g.inspection, note: "authorized automatically by odg-authorization-scope R4 under the owner's V168 authorization (docs/odg/V168_OWNER_AUTHORIZATION_H.json); the provider did not self-authorize" },
    outcome: res.outcome,
    grade: { ...res.grade, rule: "first matching of NOT_MEASURED, PASS, PARTIAL, FAIL per WORK_ITEM_CONTRACT.preRegistration.thresholds (mechanical; no re-tuning)", gradedBy: "pre-registered rule only — NOT the independent VALIDATE_CRITERIA step (pending)" },
    adoptionDecision: res.adoptionDecision,
    inputs: { contracts: { path: CONTRACTS, sha256File: sha256(fs.readFileSync(path.join(ROOT, CONTRACTS))) }, inspection: { path: INSPECTION, sha256File: sha256(fs.readFileSync(path.join(ROOT, INSPECTION))) }, dataset: res.dataset },
    preRegistration: PRE,
    featureComputation: res.featureComputation || null, dev: res.dev || null, fitted: res.fitted || null,
    primary: res.primary || null, secondaryRobustness: res.secondaryRobustness || null,
    antiLeakage: { log: res.antiLeakageLog || [], rule: "features of all rows computed before any label; only DEV labels feed the fit; weights + sha256 sealed before HELDOUT labels are released (LabelVault throws otherwise)" },
    controls: { changed: false, note: "H1 is an additive advisory score; chooseLevel's level / reinforced / independentInspection / mandatoryPreMergeCI / tests are unchanged and nothing is wired into any gate" },
    priorResult: { initialState: "PARTIAL (V159 routing 0.75→0.75; #902 gain not measured)", note: "untouched; not re-graded by this experiment" },
    ambiguities: [
      "label = the per-row 'label' field written by the builder (preRegistration.outcomeLabel 'stored per row in the dataset as written by the builder'); commits are not re-derived",
      "primary split recomputed from the PR-number sort (first 200 / last 199) and cross-checked against the stored 'split' field (any disagreement ⇒ NOT_MEASURED)",
      "reader memoization covers exists/read/list/realRel/walk/graph (all pure on the static scratch tree ⇒ identical answers); a graph build failure is memoized as the same throw",
      "f3 counts distinct label STRINGS over plan.files[].sensitive (a 'protected path (<prefix>)' label is one string per prefix); f6 uses plan.graph.reverseClosure (0 when absent, e.g. empty change-set plans)",
      "sd = 0 is decided exactly (a feature constant over DEV ⇒ sd 0, never a floating residue); such a feature standardizes to 0 everywhere and its weight is held at 0 at every iteration",
      "AUC and Δ values are full IEEE-754 doubles (no rounding) — thresholds compared on those values",
      "bootstrap: one LCG stream (seed 20261128) draws HELDOUT.length indices per resample in order; AUC(H1/B0/B1) on the same resample; skipped if 0 positives or 0 negatives; percentiles sorted[floor(p·n)] as in odg-v166-scenario-g-experiment",
      "secondary: Fisher–Yates i = n−1 … 1, j = floor(rnd()·(i+1)) over the PR-sorted rows; refit on its DEV with the same hyper-parameters; same bootstrap seed restarted",
      "a NOT_MEASURED outcome stops at the first failing pre-condition (later steps are not computed)",
    ],
    honesty: [
      "a validated RUN_CONTROLLED_EXPERIMENTS step is DONE with this recorded outcome, never upgraded; VALIDATE_CRITERIA (independent inspection of this result) is pending",
      "PASS ⇒ ADOPTION_CANDIDATE only (advisory score); PARTIAL / FAIL / NOT_MEASURED ⇒ NOT_ADOPTED",
      "chronological split ⇒ distribution shift; era confounding; commit count is a confounded rework proxy — a PASS shows held-out discrimination, never causation",
      "anachronistic reader: historical change-sets classified against the CURRENT tree (identical for B0, B1 and H1 — paired)",
      "provider (Claude Code) wrote this runner; the run is ODG GO's dispatch of the contract-declared target",
    ],
  };
}

/* ------------------------------------------------ selftest (synthetic only) ------------------------------------------------ */
function selftest(): number {
  let f = 0; const ok = (n: string, c: boolean) => { process.stdout.write(`${c ? "ok" : "NOT OK"} - ${n}\n`); if (!c) f++; };
  const base = { datasetShaOk: true, chooseLevelErrors: 0, devHigh: 50, devLow: 50, weightsFinite: true, heldoutHigh: 50, heldoutLow: 50, skippedFraction: 0 };
  const good = { ...base, delta0: 0.1, ciLow0: 0.01, delta1: 0.05, ciLow1: 0.001, aucH1: 0.6 };
  ok("grade: all PASS conditions ⇒ PASS", grade(good).outcome === "PASS");
  ok("grade: Δ0 = 0.0499 ⇒ PARTIAL", grade({ ...good, delta0: 0.0499 }).outcome === "PARTIAL");
  ok("grade: CI low Δ0 = 0 ⇒ PARTIAL (strict >)", grade({ ...good, ciLow0: 0 }).outcome === "PARTIAL");
  ok("grade: Δ1 = 0 ⇒ PARTIAL (superiority over B1 required)", grade({ ...good, delta1: 0 }).outcome === "PARTIAL");
  ok("grade: CI low Δ1 = 0 ⇒ PARTIAL", grade({ ...good, ciLow1: 0 }).outcome === "PARTIAL");
  ok("grade: AUC(H1) 0.549 ⇒ PARTIAL", grade({ ...good, aucH1: 0.549 }).outcome === "PARTIAL");
  ok("grade: Δ0 = 0 ⇒ FAIL", grade({ ...good, delta0: 0 }).outcome === "FAIL");
  ok("grade: Δ0 < 0 with Δ1 > 0 ⇒ FAIL", grade({ ...good, delta0: -0.1 }).outcome === "FAIL");
  ok("grade: dataset sha mismatch ⇒ NOT_MEASURED", grade({ ...good, datasetShaOk: false }).outcome === "NOT_MEASURED");
  ok("grade: 19 HIGH in HELDOUT ⇒ NOT_MEASURED", grade({ ...good, heldoutHigh: 19 }).outcome === "NOT_MEASURED");
  ok("grade: 9 LOW in DEV ⇒ NOT_MEASURED", grade({ ...good, devLow: 9 }).outcome === "NOT_MEASURED");
  ok("grade: chooseLevel threw ⇒ NOT_MEASURED", grade({ ...good, chooseLevelErrors: 1 }).outcome === "NOT_MEASURED");
  ok("grade: non-finite weight ⇒ NOT_MEASURED", grade({ ...good, weightsFinite: false }).outcome === "NOT_MEASURED");
  ok("grade: 5.05% skipped ⇒ NOT_MEASURED; exactly 5% is not", grade({ ...good, skippedFraction: 0.0505 }).outcome === "NOT_MEASURED" && grade({ ...good, skippedFraction: 0.05 }).outcome === "PASS");
  ok("adoption: only PASS ⇒ ADOPTION_CANDIDATE", adoption("PASS").startsWith("ADOPTION_CANDIDATE") && adoption("PARTIAL") === "NOT_ADOPTED" && adoption("NOT_MEASURED") === "NOT_ADOPTED");
  ok("LCG matches the V160/V166 formula", (() => { const r = lcg(1); return r() === ((Math.imul(1, 1664525) + 1013904223) >>> 0) / 4294967296; })());
  const perm = shuffled([1, 2, 3, 4, 5].map((n) => ({ n })), 7);
  ok("shuffle deterministic + permutation", JSON.stringify(perm) === JSON.stringify(shuffled([1, 2, 3, 4, 5].map((n) => ({ n })), 7)) && perm.map((r: any) => r.n).sort().join() === "1,2,3,4,5");

  // synthetic dataset (NOT V168_H_HELDOUT.json): 399 rows, label depends on breadth; stub chooseLevel (no tree access)
  const synthRows: any[] = []; const rr = lcg(42);
  for (let i = 0; i < 399; i++) { const k = 1 + Math.floor(rr() * 12); const files = Array.from({ length: k }, (_, j) => (j % 3 === 0 ? `docs/s${i}_${j}.md` : `runtime/core/s${i}_${j}.ts`)); synthRows.push({ number: 1000 + i, changedFiles: files, split: i < 200 ? "DEV" : "HELDOUT", label: rr() < Math.min(0.9, k / 12) ? "HIGH_ITERATION" : "LOW_ITERATION" }); }
  const stub = (files: string[]) => Object.freeze({ schema: "ODG_VERIFICATION_PLAN", level: files.length > 6 ? "L3" : files.length > 2 ? "L2" : "L1", reinforced: files.length > 9, mandatoryPreMergeCI: true,
    files: files.map((p) => ({ path: p, class: p.startsWith("docs/") ? "DOC" : "SOURCE", sensitive: p.endsWith("_1.ts") ? ["ledger"] : [] })), unresolved: [], tests: { L1: [], L2: files.filter((p) => p.endsWith(".ts")), L3: [] }, graph: { reverseClosure: files.length } });
  const synthText = JSON.stringify({ rows: synthRows });
  const res = experiment(synthText, ROOT, { skipShaPin: true, chooseLevel: stub });
  const res2 = experiment(synthText, ROOT, { skipShaPin: true, chooseLevel: stub });
  ok("synthetic: experiment deterministic (byte-identical result)", JSON.stringify(res) === JSON.stringify(res2));
  ok("synthetic: graded mechanically to a recognised outcome", ["PASS", "PARTIAL", "FAIL", "NOT_MEASURED"].includes(res.outcome) && res.outcome === grade({ ...base, devHigh: res.dev.highIteration, devLow: res.dev.lowIteration, heldoutHigh: res.primary.counts.highIteration, heldoutLow: res.primary.counts.lowIteration, skippedFraction: res.primary.bootstrap.skippedFraction, delta0: res.primary.delta0, ciLow0: res.primary.bootstrap.ci95Delta0[0], delta1: res.primary.delta1, ciLow1: res.primary.bootstrap.ci95Delta1[0], aucH1: res.primary.auc.H1 }).outcome);
  ok("synthetic: anti-leakage order FEATURES → DEV → SEALED → HELDOUT → ALL", (() => { const l = res.antiLeakageLog.map((s: string) => s.split(" ")[0]); return JSON.stringify(l) === JSON.stringify(["FEATURES_COMPUTED", "DEV_LABELS_READ", "WEIGHTS_SEALED", "HELDOUT_LABELS_READ", "ALL_LABELS_READ"]); })());
  ok("synthetic: sealed sha = sha of the recorded model", res.fitted.modelSha256 === RC.modelSha256(res.fitted.model) && res.antiLeakageLog[2] === `WEIGHTS_SEALED ${res.fitted.modelSha256}`);
  ok("synthetic: 2000 resamples, seed 20261128, counted", res.primary.bootstrap.resamples === 2000 && res.primary.bootstrap.seed === 20261128 && res.primary.bootstrap.usedResamples + res.primary.bootstrap.skippedResamples === 2000);
  ok("synthetic: Δ0/Δ1 = AUC differences", res.primary.delta0 === res.primary.auc.H1 - res.primary.auc.B0 && res.primary.delta1 === res.primary.auc.H1 - res.primary.auc.B1);
  ok("synthetic: secondary is report-only (outcome unaffected)", res.secondaryRobustness.role.startsWith("REPORT-ONLY") && typeof res.secondaryRobustness.aucF1LevelRankAlone_primaryHeldout === "number");
  ok("vault: HELDOUT labels refused before sealing", (() => { const v = loadDataset({ rows: synthRows }).vault; try { v.reveal("HELDOUT"); return false; } catch (e: any) { return /ANTI_LEAKAGE/.test(e.message); } })());
  ok("vault: ALL labels refused before sealing", (() => { const v = loadDataset({ rows: synthRows }).vault; try { v.reveal("ALL"); return false; } catch (e: any) { return /ANTI_LEAKAGE/.test(e.message); } })());
  ok("dataset: sha mismatch ⇒ NOT_MEASURED without opening", experiment(synthText, ROOT, { chooseLevel: () => { throw new Error("must not run"); } }).outcome === "NOT_MEASURED");
  ok("dataset: chooseLevel throw on a row ⇒ NOT_MEASURED (no silent drop)", experiment(synthText, ROOT, { skipShaPin: true, chooseLevel: (fs2: string[]) => { if (fs2.length === 5) throw new Error("boom"); return stub(fs2); } }).outcome === "NOT_MEASURED");
  ok("dataset: split-field disagreement ⇒ NOT_MEASURED", experiment(JSON.stringify({ rows: synthRows.map((r, i) => (i === 0 ? { ...r, split: "HELDOUT" } : r)) }), ROOT, { skipShaPin: true, chooseLevel: stub }).outcome === "NOT_MEASURED");
  ok("dataset: one class absent in DEV ⇒ NOT_MEASURED", experiment(JSON.stringify({ rows: synthRows.map((r, i) => (i < 200 ? { ...r, label: "LOW_ITERATION" } : r)) }), ROOT, { skipShaPin: true, chooseLevel: stub }).outcome === "NOT_MEASURED");

  // gate + write confinement (live contract; no fabricated inspection record)
  const live = readContractH(ROOT);
  ok("gate: live contract sha = pinned", !!live && AS.contractSha256(live) === PINNED_CONTRACT_SHA);
  ok("gate: no inspection ⇒ NOT authorized", gate(live, null).ok === false);
  ok("gate: REJECT inspection ⇒ NOT authorized", gate(live, { scenario: "H", verdict: "REJECT", contractSha256: PINNED_CONTRACT_SHA }).ok === false);
  ok("gate: edited contract ⇒ sha refusal", (() => { const c = JSON.parse(JSON.stringify(live)); c.WORK_ITEM_CONTRACT.preRegistration.thresholds.PASS += " "; const r = gate(c, null); return r.ok === false && /≠ pinned/.test(r.reason); })());
  const insp = readInspection(ROOT);
  if (insp) ok("gate: committed inspection present ⇒ authorized", gate(live, insp).ok === true);
  else process.stdout.write("skip - committed inspection record absent in this tree (gate refuses ⇒ NOT_AUTHORIZED at run time)\n");
  ok("confinement: declared output path accepted", outputPathOk(OUT));
  ok("confinement: any other path refused", !outputPathOk("docs/odg/evidence/OTHER.json") && !outputPathOk("/tmp/x.json") && !outputPathOk("./" + OUT + "/../x") && !outputPathOk("runtime/generated/x.json") && !outputPathOk(undefined));
  ok("calibration: advisory never changes the plan", (() => { const p = stub(["runtime/core/a.ts"]); const a = RC.advisory(p, ["runtime/core/a.ts"], res.fitted.model); return a.plan === p && a.controlsChanged === false && p.mandatoryPreMergeCI === true; })());
  process.stdout.write(`\n${f === 0 ? "ALL PASS" : f + " FAILURE(S)"}\n`);
  return f === 0 ? 0 : 1;
}

function record(res: any, head: string | null): string {
  return JSON.stringify({ ...res, run: { head, command: `npx tsx ${SELF} ${OUT}`, dispatchedBy: "ODG GO (odg-go --execute --allow-unsandboxed-target) — contract-declared target", note: "head = HEAD of the tree the run executed in" } }, null, 2) + "\n";
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const positional = argv.filter((a) => !a.startsWith("-"));
  if (argv.includes("--selftest")) { process.exitCode = selftest(); }
  else if (argv.includes("--check-at-run-head")) {
    /* V17.2 — H's features are computed from the tree (change graph etc.), so the record only reproduces at the tree it
     * ran in: re-run this record's OWN `--check <OUT>` at record.run.head in a temporary detached worktree (local objects
     * only, removed afterwards). Nothing is written in this tree; the recomputation itself is unchanged. */
    if (positional.length !== 1 || !outputPathOk(positional[0])) { process.stdout.write(`REFUSED — --check-at-run-head takes exactly ${OUT}; got ${JSON.stringify(positional)}\n`); process.exitCode = 3; }
    else {
      const r = RHC.checkAtRunHead({ repoRoot: ROOT, recordRel: OUT, runnerRel: SELF, checkArgs: ["--check", OUT] });
      process.stdout.write(RHC.format("V168 H", r) + `  current tree HEAD (not used for recomputation): ${gitHead(ROOT)}\n` + (r.verdict === "CHECK_OK" ? "RESULT: CHECK OK at run head\n" : "RESULT: FAILED\n"));
      process.exitCode = r.verdict === "CHECK_OK" ? 0 : 1;
    }
  }
  else if (positional.length !== 1 || !outputPathOk(positional[0])) {
    process.stdout.write(`REFUSED — output path must be exactly the contract-declared writeSet entry ${OUT} (got ${JSON.stringify(positional)}); nothing written\n`); process.exitCode = 3;
  } else {
    const t0 = Date.now();
    const res = run();
    if (res.notAuthorized) { process.stdout.write(`NOT_AUTHORIZED — ${res.reason}; nothing written\n`); process.exitCode = 2; }
    else if (argv.includes("--check")) {
      let cur: any = null; try { cur = JSON.parse(fs.readFileSync(path.join(ROOT, OUT), "utf8")); } catch { cur = null; }
      const same = cur !== null && JSON.stringify(cur, null, 2) + "\n" === record(res, cur && cur.run ? cur.run.head : null);
      process.stdout.write(same ? `CHECK OK (outcome ${res.outcome})\n` : "CHECK FAILED — V168 H experiment record drifts (or absent)\n"); process.exitCode = same ? 0 : 1;
    } else {
      fs.writeFileSync(path.join(ROOT, OUT), record(res, gitHead(ROOT)));
      const p = res.primary;
      process.stdout.write(JSON.stringify({ outcome: res.outcome, adoption: res.adoptionDecision, because: res.grade.because || null, auc: p && p.auc, delta0: p && p.delta0, ci95Delta0: p && p.bootstrap.ci95Delta0, delta1: p && p.delta1, ci95Delta1: p && p.bootstrap.ci95Delta1, wrote: OUT, seconds: (Date.now() - t0) / 1000 }, null, 1) + "\n");
    }
  }
}
module.exports = { gate, outputPathOk, loadDataset, makeVault, memoReader, computeFeatures, pairedBootstrap, evaluate, experiment, grade, adoption, shuffled, lcg, run, PRE, PINNED_CONTRACT_SHA, OUT };
export {};
