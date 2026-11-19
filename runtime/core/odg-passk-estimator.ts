#!/usr/bin/env node
"use strict";
/*
 * P2 EVAL — UNBIASED pass@k ESTIMATOR (Chen et al. 2021, "Evaluating LLMs Trained on Code"). PURE, deterministic.
 *
 * THE GAP (reconciled): p2-passk-reliability computes pass^k — RELIABILITY under repetition ("a task counts only if ALL
 * k rollouts pass"). That is a DIFFERENT metric from pass@k — CAPABILITY under a sampling budget ("the probability that
 * AT LEAST ONE of k samples passes"). The famous unbiased pass@k estimator (from n ≥ k samples with c correct) was NOT
 * present. This adds it, using the numerically-stable product form 1 − Π_{i=n−c+1}^{n}(1 − k/i) (NOT the naive
 * 1 − C(n−c,k)/C(n,k), which overflows) — exactly the form the paper recommends.
 *
 * Honesty:
 *  - pass@k is CAPABILITY (≥1 of k correct), the COMPLEMENT of pass^k reliability (all k correct) — they are NOT the
 *    same number and a high pass@k does NOT imply reliability (see p2-passk-reliability);
 *  - it is an UNBIASED ESTIMATOR of the true pass@k from n i.i.d. samples — an estimate, not the exact value; it assumes
 *    the c "correct" are i.i.d. draws (stated, not hidden);
 *  - fail-closed: non-integers / c > n / k > n / k < 1 / n < 1 ⇒ typed refusal (no clamping/fabrication). No clock/random.
 */

function isNonNegInt(v: any): boolean { return typeof v === "number" && Number.isSafeInteger(v) && v >= 0; }
function freeze(o: any): any { return Object.freeze(o); }
function r6(n: number): number { return Number(n.toFixed(6)); }

/**
 * passAtK(n, c, k) -> { ok, n, c, k, passAtK, note }. n samples, c correct, draw k.
 * = 1 − Π_{i=n−c+1}^{n}(1 − k/i); if (n−c) < k the k-subset must contain a correct one ⇒ 1. Fail-closed on bad inputs.
 */
function passAtK(n: any, c: any, k: any): any {
  if (!isNonNegInt(n) || !isNonNegInt(c) || !isNonNegInt(k)) return freeze({ ok: false, code: "NOT_NON_NEG_INT" });
  if (n < 1) return freeze({ ok: false, code: "N_TOO_SMALL", detail: "need at least 1 sample" });
  if (k < 1) return freeze({ ok: false, code: "K_TOO_SMALL", detail: "k must be ≥ 1" });
  if (c > n) return freeze({ ok: false, code: "C_GT_N", detail: "correct count c cannot exceed samples n" });
  if (k > n) return freeze({ ok: false, code: "K_GT_N", detail: "cannot draw k > n samples (need n ≥ k)" });
  let val: number;
  if (n - c < k) val = 1; // fewer than k incorrect ⇒ every k-subset contains a correct sample
  else { let prod = 1; for (let i = n - c + 1; i <= n; i++) prod *= 1 - k / i; val = 1 - prod; }
  return freeze({ ok: true, n, c, k, passAtK: r6(Math.min(1, Math.max(0, val))),
    note: "unbiased pass@k (CAPABILITY: ≥1 of k correct) — the COMPLEMENT of pass^k reliability (ALL k correct); an estimate from n i.i.d. samples, not the exact value." });
}

/**
 * estimatePassAtK(tasks, k) -> { ok, k, tasks, meanPassAtK, perTask }. tasks: [{ id?, n, c }] OR [{ id?, rollouts:[bool] }].
 * Averages the per-task unbiased pass@k (the standard aggregate). Fail-closed: any invalid task ⇒ refusal (not skipped).
 */
function estimatePassAtK(tasks: any, k: any): any {
  if (!Array.isArray(tasks) || tasks.length === 0) return freeze({ ok: false, code: "NO_TASKS" });
  const per: any[] = [];
  for (let idx = 0; idx < tasks.length; idx++) {
    const t = tasks[idx];
    if (t === null || typeof t !== "object") return freeze({ ok: false, code: "BAD_TASK", detail: `task ${idx} is not an object` });
    let n: any, c: any;
    if (Array.isArray(t.rollouts)) {
      if (!t.rollouts.every((r: any) => typeof r === "boolean")) return freeze({ ok: false, code: "BAD_ROLLOUTS", detail: `task ${idx}: rollouts must be booleans` });
      n = t.rollouts.length; c = t.rollouts.filter((r: boolean) => r).length;
    } else { n = t.n; c = t.c; }
    const r = passAtK(n, c, k);
    if (r.ok !== true) return freeze({ ok: false, code: "TASK_INVALID", detail: `task ${idx}: ${r.code}`, task: idx });
    per.push(freeze({ id: typeof t.id === "string" ? t.id : "t" + idx, n: r.n, c: r.c, passAtK: r.passAtK }));
  }
  const mean = per.reduce((a: number, p: any) => a + p.passAtK, 0) / per.length;
  return freeze({ ok: true, k, tasks: per.length, meanPassAtK: r6(mean), perTask: freeze(per),
    note: "mean unbiased pass@k across tasks (CAPABILITY ≥1-of-k, complement of pass^k reliability); each task needs n ≥ k samples." });
}

const PASSK_ESTIMATOR_CONTRACT = Object.freeze({
  id: "P2-PASSK-ESTIMATOR",
  purpose: "unbiased pass@k estimator (Chen et al. 2021) — CAPABILITY (≥1 of k correct); the complement of p2-passk-reliability's pass^k (ALL k correct)",
  reuses: Object.freeze(["distinct from p2-passk-reliability (pass^k reliability) — pass@k is capability; numerically-stable product form, not the overflow-prone C(n−c,k)/C(n,k)"]),
  invariants: Object.freeze([
    "pass@k = CAPABILITY (≥1 of k correct) — the COMPLEMENT of pass^k reliability (ALL k correct); NOT the same number",
    "numerically-stable product 1 − Π_{i=n−c+1}^{n}(1 − k/i) — avoids binomial-coefficient overflow",
    "an UNBIASED ESTIMATOR from n i.i.d. samples — an estimate, not the exact value; the i.i.d. assumption is stated",
    "fail-closed: non-integer / c>n / k>n / k<1 / n<1 ⇒ typed refusal (no clamping/fabrication)",
    "PURE + deterministic; no clock/randomness",
  ]),
});

module.exports = { passAtK, estimatePassAtK, PASSK_ESTIMATOR_CONTRACT };
export {};
