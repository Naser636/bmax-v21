#!/usr/bin/env node
"use strict";
/* V16.8 mission H — tests of runtime/core/odg-verification-risk-calibration.ts on SYNTHETIC fixtures only (no dataset row,
 * no label of docs/odg/evidence/V168_H_HELDOUT.json). PURE: no write, no network. */
const RC = require("./odg-verification-risk-calibration.js");
const VL = require("./odg-verification-level.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const close = (a: number, b: number, e = 1e-9) => Math.abs(a - b) <= e;

const plan = (o: any = {}) => Object.freeze({ schema: "ODG_VERIFICATION_PLAN", level: "L2", reinforced: false, mandatoryPreMergeCI: true, independentInspection: "RECOMMENDED",
  files: [{ path: "docs/a.md", class: "DOC", sensitive: [] }, { path: "runtime/core/x-ledger.ts", class: "SOURCE", sensitive: ["ledger", "recovery"] }, { path: "runtime/core/y-ledger.ts", class: "SOURCE", sensitive: ["ledger"] }, { path: "docs/b.md", class: "DOC", sensitive: [] }],
  unresolved: [{ path: "p", reason: "r" }], tests: { L1: ["a"], L2: ["a", "b", "c"], L3: [] }, graph: { reverseClosure: 7 }, ...o });

// features — exact definition
{
  const cf = ["docs/a.md", "runtime/core/x-ledger.ts", "runtime/core/y-ledger.ts", "docs/b.md"];
  const x = RC.features(plan(), cf);
  check("8 features in the pre-registered order", x.length === 8 && RC.FEATURE_NAMES.length === 8);
  check("f1 levelRank L2 = 2", x[0] === 2);
  check("f2 reinforced 0/1", x[1] === 0 && RC.features(plan({ reinforced: true, level: "L3" }), cf)[1] === 1);
  check("f3 DISTINCT sensitive labels (ledger, recovery) = 2", x[2] === 2);
  check("f4 log1p(#changedFiles)", close(x[3], Math.log1p(4)));
  check("f5 log1p(#tests.L2)", close(x[4], Math.log1p(3)));
  check("f6 log1p(graph.reverseClosure)", close(x[5], Math.log1p(7)));
  check("f7 log1p(#unresolved)", close(x[6], Math.log1p(1)));
  check("f8 DOC fraction = 2/4", x[7] === 0.5);
  check("f8 = 0 when the plan has no files", RC.features(plan({ files: [] }), [])[7] === 0);
  check("levelRank DOCS_ONLY 0 … L3 3", ["DOCS_ONLY", "L1", "L2", "L3"].map(RC.levelRank).join() === "0,1,2,3");
  check("unknown level throws (fail closed)", (() => { try { RC.features(plan({ level: "L9" }), cf); return false; } catch { return true; } })());
  check("non-plan throws", (() => { try { RC.features({}, cf); return false; } catch { return true; } })());
}

// baselines
check("B0 = levelRank + reinforced (L3 REINFORCED = 4)", RC.b0Score(plan({ level: "L3", reinforced: true })) === 4 && RC.b0Score(plan({ level: "DOCS_ONLY" })) === 0);
check("B1 = log1p(#changedFiles)", close(RC.b1Score(["a", "b"]), Math.log1p(2)));

// AUC (Mann–Whitney, ties 0.5)
check("AUC perfect = 1", RC.rocAuc([3, 4, 1, 2], [1, 1, 0, 0]) === 1);
check("AUC inverted = 0", RC.rocAuc([1, 2, 3, 4], [1, 1, 0, 0]) === 0);
check("AUC all tied = 0.5", RC.rocAuc([1, 1, 1, 1], [1, 0, 1, 0]) === 0.5);
check("AUC ties count 0.5 (pos {2,1} vs neg {1,0} ⇒ 3.5/4)", RC.rocAuc([2, 1, 1, 0], [1, 1, 0, 0]) === 0.875);
check("AUC null when a class is absent", RC.rocAuc([1, 2], [1, 1]) === null && RC.rocAuc([1, 2], [0, 0]) === null);

// standardizer: population sd
{
  const st = RC.fitStandardizer([[1, 5], [3, 5]]);
  check("mean / population sd", st.mean[0] === 2 && st.sd[0] === 1 && st.sd[1] === 0);
  check("sd = 0 feature standardizes to 0", RC.standardize([10, 9], st)[1] === 0);
}

// fit: deterministic, zero-init GD, sd = 0 ⇒ weight 0, learns a synthetic signal
{
  const X: number[][] = [], y: number[] = [];
  for (let i = 0; i < 60; i++) { X.push([i % 4, 1, (i * 7) % 5, i % 2]); y.push(i % 4 >= 2 ? 1 : 0); }
  const m1 = RC.fit(X, y), m2 = RC.fit(X, y);
  check("fit deterministic (same weights, same sha)", RC.modelSha256(m1) === RC.modelSha256(m2) && JSON.stringify(m1) === JSON.stringify(m2));
  check("hyper-parameters = pre-registration (λ 1, lr 0.1, 5000 iterations)", m1.hyper.lambda === 1 && m1.hyper.learningRate === 0.1 && m1.hyper.iterations === 5000);
  check("constant feature ⇒ weight fixed at 0 and listed frozen", m1.weights[1] === 0 && m1.frozenFeatures.includes(RC.FEATURE_NAMES[1]));
  check("signal feature gets a positive weight", m1.weights[0] > 0);
  check("fitted scores rank the synthetic signal (AUC 1)", RC.rocAuc(X.map((x) => RC.score(m1, x)), y) === 1);
  check("finite flag true", m1.finite === true);
  check("L2 penalty shrinks weights vs λ = 0", Math.abs(RC.fit(X, y, { ...RC.HYPER, lambda: 50 }).weights[0]) < Math.abs(m1.weights[0]));
  check("one GD step from zero: intercept = −lr·mean(p − y) with p = 0.5", (() => { const m = RC.fit([[0], [1]], [1, 1], { ...RC.HYPER, iterations: 1 }); return close(m.intercept, 0.1 * 0.5); })());
  check("bad labels refused", (() => { try { RC.fit([[1]], [2]); return false; } catch { return true; } })());
  check("empty DEV refused", (() => { try { RC.fit([], []); return false; } catch { return true; } })());
}

// controls never changed: advisory returns the SAME frozen plan; real chooseLevel output unchanged by scoring
{
  const m = RC.fit([[0, 0, 0, 0, 0, 0, 0, 0], [3, 1, 2, 1, 1, 1, 1, 0]], [0, 1]);
  const p = plan();
  const a = RC.advisory(p, ["docs/a.md"], m);
  check("advisory: same plan reference, controlsChanged false", a.plan === p && a.controlsChanged === false && a.advisory === true && Number.isFinite(a.riskScore));
  const root = require("path").resolve(__dirname, "..", "..");
  const real = VL.chooseLevel(["runtime/core/odg-verification-risk-calibration.ts"], { root });
  const before = JSON.stringify(real);
  RC.advisory(real, ["runtime/core/odg-verification-risk-calibration.ts"], m);
  check("real chooseLevel plan byte-identical after scoring; CI still mandatory", JSON.stringify(real) === before && real.mandatoryPreMergeCI === true && Object.isFrozen(real));
}

process.stdout.write(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}\n`);
process.exitCode = failures === 0 ? 0 : 1;
export {};
