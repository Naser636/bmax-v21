#!/usr/bin/env node
"use strict";
/*
 * V16.6 — SCENARIO G, step RUN_CONTROLLED_EXPERIMENTS (contract docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json#G,
 * revised + independently inspected — docs/odg/evidence/V166_G_CONTRACT_INSPECTION.json).
 *
 * Implements WORK_ITEM_CONTRACT.preRegistration LITERALLY. Nothing here is tuned after seeing results: every constant
 * below is copied from the frozen pre-registration (T_K=1000, T=100 secondary, label commits ≥ 2, dataset + sha256,
 * PR-number sort, first/last 200 split, balanced accuracy, B0/B1, 1000 paired-bootstrap resamples with the V160 LCG seed
 * 20261124, secondary random split seed 20261125, grade thresholds). Where the text is ambiguous the most literal reading
 * is implemented and the ambiguity is RECORDED in the output (`ambiguities`).
 *
 * Gate (fail-closed, before anything is measured):
 *   - sha256(canon(live contract G)) === PINNED_CONTRACT_SHA (any edit ⇒ NOT_AUTHORIZED, exit 2);
 *   - odg-authorization-scope.deriveAuthorizationScope(contract, {inspection}) authorizes RUN_CONTROLLED_EXPERIMENTS
 *     (else NOT_AUTHORIZED, exit 2).
 * C1: the knowledge item G_SMALL_SIZE is retrieved via odg-knowledge-intelligence (attestCollection vs COLLECTION_REGISTRY,
 *     assessClaim → toMemory, usableFor(record, "DESIGN_PROPOSAL", useAt, {assessment}), admissible() verdict recorded).
 *     Any refusal ⇒ outcome NOT_MEASURED (no default fill).
 * Grade: first matching of NOT_MEASURED, PASS, PARTIAL, FAIL — mechanical on the recorded numbers. A validated step is
 * DONE with this outcome; VALIDATE_CRITERIA (independent grading) is NOT performed here. The earlier V160 G result
 * (docs/odg/evidence/V160_SCENARIO_G.json, NOT_ADOPTED) is never read for grading nor rewritten.
 *
 * Usage: --write (writes docs/odg/evidence/V166_G_EXPERIMENT.json) | --check (re-derives; exit 1 on drift) |
 *        --check-at-run-head (V17.2: the record's own --check at its run head in a temp worktree + current-tree drift classified) |
 *        --selftest (offline unit checks of the grade rule / fitting / split — no evidence written).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cp = require("child_process");
const K = require("../core/odg-knowledge-intelligence.js");
const AS = require("../core/odg-authorization-scope.js");
const OCUR = require("../core/odg-observation-currency.js");   // V16.9 Phase 1b — R7 proof-currency probes
const BCM = require("../core/odg-binary-classification-metrics.js");
const KR = require("./odg-v160-practices-knowledge-run.ts");
const RHC = require("../core/odg-run-head-check.js");      // V17.2 — reproducibility at the record's own run head

const ROOT = path.resolve(__dirname, "..", "..");
const CONTRACTS = "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json";
const INSPECTION = "docs/odg/evidence/V166_G_CONTRACT_INSPECTION.json";
const COL = "docs/odg/evidence/V160_PRACTICES_COLLECTION.json";
const REG = "docs/odg/evidence/COLLECTION_REGISTRY.json";
const OUT = "docs/odg/evidence/V166_G_EXPERIMENT.json";
const STEP = "RUN_CONTROLLED_EXPERIMENTS";

/* ---- frozen pre-registration constants (copied verbatim from the contract; asserted against it at run time) ---- */
const PINNED_CONTRACT_SHA = "ac79b1744bf4978b768d7909a312d28eefb3e8e005a0ed60a8f7ac821c87a8cd";
const PRE = Object.freeze({
  knowledgeItem: "G_SMALL_SIZE",
  T_K: 1000,
  T_secondary: 100,
  highIterationMinCommits: 2,
  dataset: "docs/odg/evidence/V160_SCENARIO_G_PR_HISTORY.json",
  datasetSha256: "09a1112dd42c6821e030d3ebf2058f2c93f440a28b4ed34aef4f631ac646d9ea",
  trainN: 200, testN: 200,
  resamples: 1000, bootstrapSeed: 20261124, secondarySplitSeed: 20261125,
  minClassInTest: 20,
  pass: Object.freeze({ minDelta0: 0.05, ciLowDelta0GreaterThan: 0, minDelta1: -0.02 }),
});
/* use time is not fixed by the pre-registration; pinned to the actual run instant for reproducible --check (recorded). */
const USE_AT_ISO = "2026-11-23T21:30:00Z";

const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
const sha256File = (rel: string) => crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, rel))).digest("hex");
const r6 = (n: number) => Number(n.toFixed(6));
const median = (a: number[]): number | null => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
/* fixed-seed LCG — identical formula to odg-v160-scenario-g-run.bootstrap */
function lcg(seed: number): () => number { let st = seed >>> 0; return () => { st = (Math.imul(st, 1664525) + 1013904223) >>> 0; return st / 4294967296; }; }
/* percentile — identical to odg-v160-scenario-g-run (sorted[floor(p·n)], clamped) */
function q(sorted: number[], p: number): number { return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))]; }

/* ------------------------------------------------ gate ------------------------------------------------ */
function gate(): any {
  const all = readJson(CONTRACTS);
  const contract = (all.contracts || []).find((c: any) => c && c.scenario === "G");
  if (!contract) return { ok: false, reason: "contract G not found" };
  const sha = AS.contractSha256(contract);
  if (sha !== PINNED_CONTRACT_SHA) return { ok: false, reason: `live contract sha256 ${sha} ≠ pinned ${PINNED_CONTRACT_SHA} (contract edited — inspection invalid)`, contractSha256: sha };
  let inspection: any = null; try { inspection = readJson(INSPECTION); } catch { inspection = null; }
  const scope = AS.deriveAuthorizationScope(contract, { inspection, probes: OCUR.localGitProbes(ROOT) });   // V16.9 R7: inspected head verified in local git
  const authorized = AS.isStepAuthorized(scope, STEP);
  if (!authorized) return { ok: false, reason: `deriveAuthorizationScope does not authorize ${STEP}: ${scope.reason}`, contractSha256: sha };
  // the run's constants must equal the frozen pre-registration text (guards against a silent constant change in this file)
  const pr = contract.WORK_ITEM_CONTRACT.preRegistration;
  const mismatch: string[] = [];
  if (pr.dataset.sha256 !== PRE.datasetSha256) mismatch.push("dataset.sha256");
  if (pr.dataset.file !== PRE.dataset) mismatch.push("dataset.file");
  if (!/T_K = 1000/.test(pr.withKnowledge) || !/T = 100 /.test(pr.withKnowledge)) mismatch.push("withKnowledge");
  if (!/commits ≥ 2/.test(pr.outcomeLabel)) mismatch.push("outcomeLabel");
  if (!/first 200 rows/.test(pr.dataset.split) || !/last 200 rows/.test(pr.dataset.split)) mismatch.push("split");
  if (!/1000 resamples/.test(pr.uncertainty) || !/seed 20261124/.test(pr.uncertainty)) mismatch.push("uncertainty");
  if (!/seed 20261125/.test(pr.secondaryRobustness.split)) mismatch.push("secondaryRobustness.split");
  if (!/Δ0 ≥ 0\.05/.test(pr.thresholds.PASS) || !/Δ1 ≥ −0\.02/.test(pr.thresholds.PASS)) mismatch.push("thresholds.PASS");
  if (!/< 20 HIGH_ITERATION or < 20 non-HIGH_ITERATION/.test(pr.thresholds.NOT_MEASURED)) mismatch.push("thresholds.NOT_MEASURED");
  if (mismatch.length) return { ok: false, reason: "runner constants diverge from the frozen preRegistration: " + mismatch.join(", "), contractSha256: sha };
  return { ok: true, contractSha256: sha, scope: { currentStep: scope.currentStep, authorizedSteps: scope.authorizedSteps, derivedSteps: scope.derivedSteps.map((d: any) => ({ step: d.step, rule: d.rule, coveredBy: d.coveredBy })), reason: scope.reason, independenceLevel: scope.independenceLevel, selfAuthorized: scope.selfAuthorized }, inspection: { path: INSPECTION, verdict: inspection.verdict, inspectedHeadSha: inspection.inspectedHeadSha, inspectedPr: inspection.inspectedPr } };
}

/* ------------------------------------------------ C1 ------------------------------------------------ */
function retrieveC1(useAt: number): any {
  const col = readJson(COL); const reg = readJson(REG);
  const pins = (reg.collections || []).filter((c: any) => c.path === COL).map((c: any) => c.sha256);
  const collection = K.attestCollection(col, { pinnedDigests: pins });
  const base: any = { collection: COL, registry: REG, collectionSha256: sha256File(COL), registryPins: pins, attested: collection.attested === true, useAt: new Date(useAt).toISOString() };
  if (!collection.attested) return { ok: false, refusal: "collection NOT attested against COLLECTION_REGISTRY", ...base };
  const id = PRE.knowledgeItem;
  const asOf = Date.parse(col.consultedDate + "T12:00:00Z");
  const cy = (col.cycles || []).find((c: any) => String(c.query).endsWith(":: " + id));
  const st = KR.STRUCT[id];
  if (!cy || !st) return { ok: false, refusal: `knowledge item ${id} not found in the pinned collection`, ...base };
  const a = K.assessClaim({ ...st, nature: "OFFICIAL_DOCUMENTATION", text: cy.claim, sources: (cy.support || []).map((sp: any) => ({ url: sp.url, citation: sp.quote, structured: st })) },
    { asOfEpochMs: asOf, collection, quarantined: [], missionAuthorization: "DESIGN_PROPOSAL" });
  const mem = K.toMemory(a, asOf);
  const use = K.usableFor(mem, "DESIGN_PROPOSAL", useAt, { assessment: a });
  const adm = K.admissible(mem, useAt, { assessment: a });
  const epistemic = a.dimensions && a.dimensions.epistemic;
  const isFact = a.isFact === true;
  const item = { id, claim: cy.claim, url: (cy.support || [])[0] && cy.support[0].url, epistemic, isFact, provenance: use.attestedBy || null,
    useAuthorization: use.authorization, useReason: use.reason, validUntil: Number.isFinite(mem.validUntil) ? new Date(mem.validUntil).toISOString() : null,
    fresh: Number.isFinite(mem.validUntil) && useAt <= mem.validUntil,
    admissible: { trusted: adm.trusted === true, verdict: adm.verdict || null, reasons: adm.reasons || [] },
    presentedAs: epistemic === "CORROBORATED" && isFact ? "FACT" : "DESIGN_PROPOSAL (not a fact)" };
  let refusal: string | null = null;
  if (epistemic !== "SUPPORTED" && epistemic !== "CORROBORATED") refusal = `epistemic level ${epistemic} ∉ {SUPPORTED, CORROBORATED}`;
  else if (use.authorization !== "DESIGN_PROPOSAL") refusal = `usableFor → ${use.authorization} (${use.reason}) ≠ DESIGN_PROPOSAL`;
  else if (!item.fresh) refusal = "stale at use time (useAt > validUntil)";
  else if (item.presentedAs === "FACT" && adm.trusted !== true) refusal = `item presented as FACT but admissible().trusted = false (${adm.verdict})`;
  return { ok: refusal === null, refusal, ...base, item, expectedAdmissibleVerdictForSupported: "NOT_A_FACT", admissibleVerdictAsExpected: epistemic === "SUPPORTED" ? adm.verdict === "NOT_A_FACT" : null };
}

/* ------------------------------------------------ data ------------------------------------------------ */
function loadRows(hist: any): any {
  const raw = hist && Array.isArray(hist.prs) ? hist.prs : [];
  const ok = raw.filter((p: any) => Number.isFinite(p.additions) && Number.isFinite(p.deletions) && Number.isFinite(p.commits)
    && typeof p.createdAt === "string" && typeof p.mergedAt === "string" && Number.isFinite(Date.parse(p.createdAt)) && Number.isFinite(Date.parse(p.mergedAt)));
  const rows = ok.map((p: any) => ({ number: p.number, size: p.additions + p.deletions, commits: p.commits, minutes: (Date.parse(p.mergedAt) - Date.parse(p.createdAt)) / 60000 }))
    .sort((x: any, y: any) => x.number - y.number);
  return { rawCount: raw.length, rows, dropped: raw.length - rows.length, negativeMinutes: rows.filter((r: any) => r.minutes < 0).length };
}
const high = (r: any) => r.commits >= PRE.highIterationMinCommits;

/* balanced accuracy of "SPLIT_RECOMMENDED iff size > T" (T = null ⇒ B0: no row flagged) against a label function */
function confusion(rows: any[], T: number | null, label: (r: any) => boolean): any {
  let tp = 0, tn = 0, fp = 0, fn = 0;
  for (const r of rows) { const p = T !== null && r.size > T; const y = label(r); if (p && y) tp++; else if (p) fp++; else if (y) fn++; else tn++; }
  return { tp, tn, fp, fn };
}
function ba(rows: any[], T: number | null, label: (r: any) => boolean = high): number | null {
  const m = BCM.classificationMetrics(confusion(rows, T, label));
  return m.ok ? m.balancedAccuracy : null;
}
function metricsAt(rows: any[], T: number | null, label: (r: any) => boolean = high): any {
  const c = confusion(rows, T, label); const m = BCM.classificationMetrics(c);
  return { T, ...c, balancedAccuracy: m.ok ? m.balancedAccuracy : null, recall: m.ok ? m.recall : null, specificity: m.ok ? m.specificity : null, mcc: m.ok ? m.mcc : null };
}

/* B1: over the distinct TRAIN sizes, the T maximizing TRAIN balanced accuracy for HIGH_ITERATION; ties ⇒ smallest T */
function fitB1(train: any[]): any {
  const cands = Array.from(new Set(train.map((r: any) => r.size))).sort((a: any, b: any) => a - b) as number[];
  let best: number | null = null, bestBa = -Infinity;
  for (const T of cands) { const b = ba(train, T); if (b !== null && b > bestBa) { bestBa = b; best = T; } }
  return { T_B: best, trainBalancedAccuracy: best === null ? null : bestBa, candidates: cands.length };
}

/* paired bootstrap over TEST rows: same resample for BA(T_K), BA(B0), BA(T_B) */
function pairedBootstrap(test: any[], T_B: number | null): any {
  const rnd = lcg(PRE.bootstrapSeed);
  const d0: number[] = [], d1: number[] = []; let undefinedResamples = 0;
  for (let b = 0; b < PRE.resamples; b++) {
    const s: any[] = [];
    for (let i = 0; i < test.length; i++) s.push(test[Math.floor(rnd() * test.length)]);
    const k = ba(s, PRE.T_K), z = ba(s, null), f = ba(s, T_B);
    if (k === null || z === null || f === null) { undefinedResamples++; continue; }
    d0.push(r6(k - z)); d1.push(r6(k - f));
  }
  d0.sort((a, b) => a - b); d1.sort((a, b) => a - b);
  return { resamples: PRE.resamples, seed: PRE.bootstrapSeed, usedResamples: d0.length, undefinedResamples,
    ci95Delta0: d0.length ? [q(d0, 0.025), q(d0, 0.975)] : null, ci95Delta1: d1.length ? [q(d1, 0.025), q(d1, 0.975)] : null };
}

function analyse(train: any[], test: any[]): any {
  const b1 = fitB1(train);
  const baK = ba(test, PRE.T_K), ba0 = ba(test, null), baB = ba(test, b1.T_B);
  const delta0 = baK !== null && ba0 !== null ? r6(baK - ba0) : null;
  const delta1 = baK !== null && baB !== null ? r6(baK - baB) : null;
  const trainMedianMinutes = median(train.map((r: any) => r.minutes));
  const slow = (r: any) => trainMedianMinutes !== null && r.minutes > trainMedianMinutes;
  return {
    counts: { train: { n: train.length, highIteration: train.filter(high).length, notHighIteration: train.filter((r: any) => !high(r)).length, prRange: train.length ? [Math.min(...train.map((r: any) => r.number)), Math.max(...train.map((r: any) => r.number))] : null },
      test: { n: test.length, highIteration: test.filter(high).length, notHighIteration: test.filter((r: any) => !high(r)).length } },
    B1: b1,
    test: { withKnowledge_T_K: metricsAt(test, PRE.T_K), B0_noBound: metricsAt(test, null), B1_dataOnly_T_B: metricsAt(test, b1.T_B) },
    delta0, delta1,
    bootstrap: pairedBootstrap(test, b1.T_B),
    secondary_reportOnly: {
      T100_highIteration: metricsAt(test, PRE.T_secondary),
      slowLabel: { definition: "open→merge minutes > median minutes of the TRAIN split", trainMedianMinutes, T_K: metricsAt(test, PRE.T_K, slow), B0: metricsAt(test, null, slow), T100: metricsAt(test, PRE.T_secondary, slow) },
    },
  };
}

/* grade = first matching of NOT_MEASURED, PASS, PARTIAL, FAIL (thresholds of the pre-registration) */
function grade(input: { c1ok: boolean; datasetShaOk: boolean; testHigh: number; testNotHigh: number; delta0: number | null; ciLow0: number | null; delta1: number | null }): any {
  const nm: string[] = [];
  if (!input.c1ok) nm.push("C1 refused at use time");
  if (!input.datasetShaOk) nm.push("dataset sha256 ≠ pinned value");
  if (input.testHigh < PRE.minClassInTest) nm.push(`TEST has ${input.testHigh} < 20 HIGH_ITERATION rows`);
  if (input.testNotHigh < PRE.minClassInTest) nm.push(`TEST has ${input.testNotHigh} < 20 non-HIGH_ITERATION rows`);
  if (input.delta0 === null) nm.push("Δ0 undefined");
  if (nm.length) return { outcome: "NOT_MEASURED", because: nm };
  const d0 = input.delta0 as number;
  const passConds = { delta0_ge_0_05: d0 >= PRE.pass.minDelta0, ci95Low_delta0_gt_0: input.ciLow0 !== null && input.ciLow0 > PRE.pass.ciLowDelta0GreaterThan, delta1_ge_minus_0_02: input.delta1 !== null && input.delta1 >= PRE.pass.minDelta1 };
  if (passConds.delta0_ge_0_05 && passConds.ci95Low_delta0_gt_0 && passConds.delta1_ge_minus_0_02) return { outcome: "PASS", passConditions: passConds };
  if (d0 > 0) return { outcome: "PARTIAL", passConditions: passConds, because: Object.entries(passConds).filter(([, v]) => !v).map(([k]) => `PASS condition not met: ${k}`) };
  return { outcome: "FAIL", passConditions: passConds, because: [`Δ0 = ${d0} ≤ 0`] };
}

/* secondary: Fisher–Yates (i = n−1 … 1, j = floor(rnd·(i+1))) over the PR-number-sorted rows, LCG seed 20261125 */
function shuffled(rows: any[], seed: number): any[] {
  const a = rows.slice(); const rnd = lcg(seed);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

function gitHead(): string | null { try { return cp.execFileSync("git", ["-C", ROOT, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch { return null; } }

function run(): any {
  const g = gate();
  if (!g.ok) return { notAuthorized: true, reason: g.reason, contractSha256: g.contractSha256 || null };
  const useAt = Date.parse(USE_AT_ISO);
  const c1 = retrieveC1(useAt);
  const dsSha = sha256File(PRE.dataset);
  const datasetShaOk = dsSha === PRE.datasetSha256;
  const data = loadRows(readJson(PRE.dataset));
  const rows = data.rows;
  const train = rows.slice(0, PRE.trainN), test = rows.slice(Math.max(0, rows.length - PRE.testN));
  const primary = analyse(train, test);
  const gr = grade({ c1ok: c1.ok, datasetShaOk, testHigh: primary.counts.test.highIteration, testNotHigh: primary.counts.test.notHighIteration,
    delta0: primary.delta0, ciLow0: primary.bootstrap.ci95Delta0 ? primary.bootstrap.ci95Delta0[0] : null, delta1: primary.delta1 });
  const sh = shuffled(rows, PRE.secondarySplitSeed);
  const sec = analyse(sh.slice(0, PRE.trainN), sh.slice(Math.max(0, sh.length - PRE.testN)));
  return {
    schema: "odg-scenario-experiment/1",
    scenario: "G", step: STEP, contract: CONTRACTS + "#G", contractSha256: g.contractSha256,
    authorization: { ...g.scope, inspection: g.inspection, note: "authorized automatically by odg-authorization-scope R4 under the owner's V165 authorization; the provider did not self-authorize" },
    outcome: gr.outcome,
    grade: { ...gr, rule: "first matching of NOT_MEASURED, PASS, PARTIAL, FAIL per WORK_ITEM_CONTRACT.preRegistration.thresholds (mechanical; no re-tuning)", gradedBy: "pre-registered rule only — NOT the independent VALIDATE_CRITERIA step (pending)" },
    inputs: { contracts: { path: CONTRACTS, sha256File: sha256File(CONTRACTS) }, inspection: { path: INSPECTION, sha256File: sha256File(INSPECTION) },
      dataset: { path: PRE.dataset, sha256: dsSha, pinned: PRE.datasetSha256, matches: datasetShaOk, rawRows: data.rawCount, eligibleRows: rows.length, droppedRows: data.dropped, rowsWithNegativeMinutes: data.negativeMinutes },
      collection: { path: COL, sha256: c1.collectionSha256 }, registry: { path: REG, sha256: sha256File(REG) } },
    preRegistration: PRE, useAt: USE_AT_ISO,
    C1: c1,
    primary: { split: "sorted by PR number ascending; TRAIN = first 200, TEST = last 200", ...primary },
    secondaryRobustness: { role: "REPORT-ONLY — cannot change the grade", split: `Fisher–Yates with LCG seed ${PRE.secondarySplitSeed}; first 200 = TRAIN, last 200 = TEST`, ...sec },
    priorResult: { path: "docs/odg/evidence/V160_SCENARIO_G.json", decision: "NOT_ADOPTED (borderline)", note: "untouched; not re-graded by this experiment" },
    ambiguities: [
      "useAt is not fixed by the pre-registration: pinned to the actual run instant 2026-11-23T21:30Z so --check is reproducible (the item's validUntil is 2027-02-21; any later real use must re-check)",
      "row eligibility read literally ('finite additions/deletions/commits and createdAt/mergedAt'): the V160 runner's extra 'minutes ≥ 0' filter is NOT applied; rowsWithNegativeMinutes is recorded (minutes only feed the report-only secondary label)",
      "'SPLIT_RECOMMENDED iff size > T' is strict for every T (T_K, T=100, every B1 candidate); B1 candidates are exactly the distinct TRAIN sizes (no extra 'flag nothing' candidate)",
      "paired bootstrap: one LCG stream (seed 20261124) draws TEST.length indices per resample in order; Δ0/Δ1 computed on the same resample; a resample whose balanced accuracy is undefined (a class absent) is excluded and counted (undefinedResamples); percentiles as in odg-v160-scenario-g-run: sorted[floor(p·n)]",
      "Δ values are differences of the 6-decimal balanced accuracies returned by odg-binary-classification-metrics, rounded to 6 decimals; thresholds compared on those values",
      "Fisher–Yates direction for the secondary split: i from n−1 down to 1, j = floor(rnd()·(i+1)), applied to the PR-number-sorted rows; the secondary split refits B1 on its own TRAIN and reuses bootstrap seed 20261124",
      "the secondary 'slow' label (minutes > TRAIN median) is evaluated on the primary split only, report-only",
    ],
    honesty: [
      "a validated RUN_CONTROLLED_EXPERIMENTS step is DONE with the recorded outcome, never upgraded; VALIDATE_CRITERIA (independent inspection of this result) is pending",
      "the knowledge item is SUPPORTED (single official source), never a fact; a PASS would be a DESIGN_PROPOSAL on held-out ODG data, not causation",
      "the held-out split is not blind to the analyst (the dataset was analysed by the V160 run; label counts per split were inspected before registration)",
      "chronological split ⇒ distribution shift (TRAIN 20/200 vs TEST 100/200 HIGH_ITERATION); recorded, not corrected",
      "commit count and minutes are confounded proxies (task difficulty, inspection loop)",
      "provider (Claude Code) wrote this runner; attestation, use authorization, metrics and the grade rule are executed by ODG components / the frozen rule",
    ],
  };
}

function selftest(): number {
  let f = 0; const ok = (n: string, c: boolean) => { process.stdout.write(`${c ? "ok" : "NOT OK"} - ${n}\n`); if (!c) f++; };
  const base = { c1ok: true, datasetShaOk: true, testHigh: 100, testNotHigh: 100 };
  ok("PASS needs all three", grade({ ...base, delta0: 0.05, ciLow0: 0.001, delta1: -0.02 }).outcome === "PASS");
  ok("Δ0 0.0499 ⇒ PARTIAL", grade({ ...base, delta0: 0.0499, ciLow0: 0.01, delta1: 0 }).outcome === "PARTIAL");
  ok("CI low = 0 ⇒ PARTIAL (strict >)", grade({ ...base, delta0: 0.2, ciLow0: 0, delta1: 0 }).outcome === "PARTIAL");
  ok("Δ1 −0.021 ⇒ PARTIAL", grade({ ...base, delta0: 0.2, ciLow0: 0.1, delta1: -0.021 }).outcome === "PARTIAL");
  ok("Δ0 = 0 ⇒ FAIL", grade({ ...base, delta0: 0, ciLow0: -0.1, delta1: 0 }).outcome === "FAIL");
  ok("C1 refused ⇒ NOT_MEASURED even with great numbers", grade({ ...base, c1ok: false, delta0: 0.5, ciLow0: 0.4, delta1: 0.3 }).outcome === "NOT_MEASURED");
  ok("dataset sha mismatch ⇒ NOT_MEASURED", grade({ ...base, datasetShaOk: false, delta0: 0.5, ciLow0: 0.4, delta1: 0.3 }).outcome === "NOT_MEASURED");
  ok("19 HIGH in TEST ⇒ NOT_MEASURED", grade({ ...base, testHigh: 19, delta0: 0.5, ciLow0: 0.4, delta1: 0.3 }).outcome === "NOT_MEASURED");
  const rows = [1, 5, 10, 50].map((s, i) => ({ number: i, size: s, commits: s >= 10 ? 2 : 1, minutes: 1 }));
  ok("B1 fits smallest perfect threshold", fitB1(rows).T_B === 5 && fitB1(rows).trainBalancedAccuracy === 1);
  ok("B0 balanced accuracy 0.5 by construction", ba(rows, null) === 0.5);
  ok("strict size > T", confusion([{ size: 1000, commits: 2 }], 1000, high).fn === 1);
  ok("shuffle deterministic + permutation", JSON.stringify(shuffled(rows, 7)) === JSON.stringify(shuffled(rows, 7)) && shuffled(rows, 7).map((r: any) => r.number).sort().join() === "0,1,2,3");
  ok("malformed rows dropped, sorted by number", (() => { const d = loadRows({ prs: [{ number: 9, additions: 1, deletions: 0, commits: 1, createdAt: "2026-01-01T00:00:00Z", mergedAt: "2026-01-01T00:01:00Z" }, { number: 3, additions: "x", deletions: 0, commits: 1, createdAt: "a", mergedAt: "b" }, { number: 2, additions: 1, deletions: 1, commits: 2, createdAt: "2026-01-01T00:00:00Z", mergedAt: "2026-01-01T00:01:00Z" }] }); return d.rows.length === 2 && d.rows[0].number === 2; })());
  ok("gate authorizes on the live contract", gate().ok === true);
  process.stdout.write(`\n${f === 0 ? "ALL PASS" : f + " FAILURE(S)"}\n`);
  return f === 0 ? 0 : 1;
}

/* V17.2 — --check-at-run-head: re-run this record's OWN --check at the commit it was produced from (temporary detached
 * worktree, local objects only), then separately classify the CURRENT-tree drift: if the only differing leaf is
 * inputs.contracts.sha256File (a context citation of the whole contracts file) while the contract binding contractSha256
 * still matches the record, that drift is INFORMATIONAL. Exit 0 iff the run-head check is OK and no current-tree drift
 * beyond that context path exists. The pre-registered computation (run()) and the committed record are not changed. */
const CONTEXT_ONLY_PATHS = Object.freeze(["inputs.contracts.sha256File"]);
function currentTreeDrift(cur: any): any {
  const res = run();
  if (res.notAuthorized) return { classification: "CONTRACT_BINDING_BROKEN", reason: res.reason, contractSha256: res.contractSha256 || null };
  const recomputed = JSON.parse(JSON.stringify({ ...res, run: cur && cur.run }));
  const paths = RHC.diffLeafPaths(cur, recomputed);
  const bindingOk = !!cur && res.contractSha256 === cur.contractSha256 && res.contractSha256 === PINNED_CONTRACT_SHA;
  const contextOnly = paths.length > 0 && paths.every((p: string) => CONTEXT_ONLY_PATHS.includes(p));
  const classification = paths.length === 0 ? "NO_DRIFT" : (contextOnly && bindingOk ? "CONTEXT_ONLY_INFORMATIONAL" : "DRIFT_BEYOND_CONTEXT");
  return { classification, driftPaths: paths, contractBinding: { recorded: cur && cur.contractSha256, live: res.contractSha256, pinned: PINNED_CONTRACT_SHA, matches: bindingOk },
    contractsFileSha256: { recorded: cur && cur.inputs && cur.inputs.contracts && cur.inputs.contracts.sha256File, live: res.inputs.contracts.sha256File } };
}
function checkAtRunHead(): number {
  let cur: any = null; try { cur = readJson(OUT); } catch { cur = null; }
  const r = RHC.checkAtRunHead({ repoRoot: ROOT, recordRel: OUT, runnerRel: "runtime/bin/odg-v166-scenario-g-experiment.ts", checkArgs: ["--check"] });
  process.stdout.write(RHC.format("V166 G", r));
  const d = currentTreeDrift(cur);
  process.stdout.write(`  current tree (HEAD ${gitHead()}): ${d.classification}${d.driftPaths ? " — drift paths " + JSON.stringify(d.driftPaths) : ""}\n`);
  if (d.contractBinding) process.stdout.write(`  contract binding contractSha256: recorded ${d.contractBinding.recorded} / live ${d.contractBinding.live} ⇒ ${d.contractBinding.matches ? "MATCHES" : "MISMATCH"}\n`);
  if (d.classification === "CONTEXT_ONLY_INFORMATIONAL") process.stdout.write(`  INFORMATIONAL (not a failure): contracts file sha256 ${d.contractsFileSha256.recorded} → ${d.contractsFileSha256.live} (context citation only; contract G unchanged)\n`);
  const ok = r.verdict === "CHECK_OK" && (d.classification === "NO_DRIFT" || d.classification === "CONTEXT_ONLY_INFORMATIONAL");
  process.stdout.write(ok ? "RESULT: CHECK OK at run head\n" : "RESULT: FAILED\n");
  return ok ? 0 : 1;
}

if (require.main === module) {
  if (process.argv.includes("--selftest")) { process.exitCode = selftest(); }
  else if (process.argv.includes("--check-at-run-head")) { process.exitCode = checkAtRunHead(); }
  else {
    const res = run();
    if (res.notAuthorized) { process.stdout.write(`NOT_AUTHORIZED — ${res.reason}\n`); process.exitCode = 2; }
    else {
      const head = gitHead();
      if (process.argv.includes("--check")) {
        let cur: any = null; try { cur = readJson(OUT); } catch { cur = null; }
        const recordedHead = cur && cur.run ? cur.run.head : null;
        const text = JSON.stringify({ ...res, run: { head: recordedHead, command: "npx tsx runtime/bin/odg-v166-scenario-g-experiment.ts --write", note: "head = HEAD at --write time (the commit carrying this record is its child)" } }, null, 2) + "\n";
        const same = cur !== null && JSON.stringify(cur, null, 2) + "\n" === text;
        process.stdout.write(same ? `CHECK OK (outcome ${res.outcome}; live HEAD ${head})\n` : "CHECK FAILED — V166 G experiment evidence drifts\n"); process.exitCode = same ? 0 : 1;
      } else {
        const text = JSON.stringify({ ...res, run: { head, command: "npx tsx runtime/bin/odg-v166-scenario-g-experiment.ts --write", note: "head = HEAD at --write time (the commit carrying this record is its child)" } }, null, 2) + "\n";
        if (process.argv.includes("--write")) fs.writeFileSync(path.join(ROOT, OUT), text);
        const p = res.primary, s = res.secondaryRobustness;
        process.stdout.write(JSON.stringify({ outcome: res.outcome, C1: res.C1.ok ? "OK" : res.C1.refusal, admissible: res.C1.item && res.C1.item.admissible.verdict, counts: p.counts, T_B: p.B1.T_B, BA: { T_K: p.test.withKnowledge_T_K.balancedAccuracy, B0: p.test.B0_noBound.balancedAccuracy, B1: p.test.B1_dataOnly_T_B.balancedAccuracy }, delta0: p.delta0, ci95Delta0: p.bootstrap.ci95Delta0, delta1: p.delta1, ci95Delta1: p.bootstrap.ci95Delta1, secondary: { T_B: s.B1.T_B, delta0: s.delta0, ci95Delta0: s.bootstrap.ci95Delta0, delta1: s.delta1, ci95Delta1: s.bootstrap.ci95Delta1, testHigh: s.counts.test.highIteration } }, null, 1) + "\n");
      }
    }
  }
}
module.exports = { gate, retrieveC1, loadRows, fitB1, ba, confusion, pairedBootstrap, analyse, grade, shuffled, run, PRE, PINNED_CONTRACT_SHA, currentTreeDrift, CONTEXT_ONLY_PATHS, OUT };
export {};
