#!/usr/bin/env node
/**
 * characterization-baseline — capture a BEHAVIORAL baseline before a legacy edit, then prove an edit is
 * behavior-preserving (or surface exactly what changed for explicit human bless). This is Michael Feathers'
 * characterization-testing discipline (Working Effectively with Legacy Code, 2004) made a first-class ODG step
 * — the highest-value lever for D01's legacy-modernization half (CAPABILITY_GAP_REGISTER_V1.md G-01, P1).
 *
 * WHAT IT IS / IS NOT (the Feathers honesty invariant, enforced in code):
 *   - A baseline pins the ACTUAL observed behavior of code as-it-is-now; it is a regression safety net,
 *     NOT a correctness oracle. Every result carries basis:"BEHAVIORAL_NOT_CORRECTNESS".
 *   - BEHAVIOR_PRESERVED means "outputs match the recorded baseline" — it does NOT prove the behavior is
 *     correct (a preserved bug stays preserved). BEHAVIOR_CHANGED requires an explicit human bless.
 *
 * COMPOSES, DOES NOT REPLACE: the samples ({input, observedOutput}) are produced by the EXISTING
 * `code-execution` harness (or any real runner) and passed in — this module is PURE (no fs, no network,
 * no clock, no spawn except the injectable, fail-closed git read inside evidence-provenance). It reuses the
 * EVIDENCE primitive (`evidence-provenance.stampProvenance/verifyProvenance`) to seal a baseline tamper-evident
 * and detect any post-capture alteration. NO new primitive; NO tenth kernel.
 *
 * FAIL-CLOSED (never a fabricated pass):
 *   - no samples at capture ⇒ NO_BASELINE (you cannot characterize nothing).
 *   - same input mapped to differing outputs in one sample set ⇒ NONDETERMINISTIC_SOURCE (cannot baseline a
 *     non-deterministic observation honestly).
 *   - a compare run that does not cover every baselined input ⇒ INCOMPLETE (a coverage gap is NOT a pass).
 *   - a baseline whose seal does not verify ⇒ BASELINE_TAMPERED (altered since capture / wrong key).
 *   - input matching is key-ORDER-independent (canonicalized), so object-key reordering is not a false change.
 *
 * Dual export (ESM `export` + CJS `module.exports`) so it passes both tsconfigs and is require()-able by the
 * tsx test harness, exactly like dataset-quality-service.
 */
"use strict";

const crypto: any = require("crypto");
const EP: any = require("./evidence-provenance.js");

const SCHEMA = "odg.characterization-baseline.v1";
const BASIS = "BEHAVIORAL_NOT_CORRECTNESS";

// Stable canonical JSON: object keys sorted recursively so input-matching is key-order-independent.
function canon(v: any): any {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(canon);
  const out: any = {};
  for (const k of Object.keys(v).sort()) out[k] = canon(v[k]);
  return out;
}
function canonStr(v: any): string { return JSON.stringify(canon(v)); }
function inputDigest(v: any): string { return crypto.createHash("sha256").update("I\0" + canonStr(v)).digest("hex"); }

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

// Normalize a {input, observedOutput}[] into inputDigest -> {inputDigest, output(canonical str)} entries.
// Fail-closed: a repeated input with a DIFFERENT output ⇒ non-deterministic source (cannot honestly baseline).
function normalizeSamples(samples: any): { ok: boolean; entries?: any[]; code?: string; reason?: string } {
  if (!Array.isArray(samples) || samples.length === 0) return { ok: false, code: "NO_SAMPLES", reason: "samples must be a non-empty array of {input, observedOutput}" };
  const byDigest: Record<string, string> = {};
  const order: string[] = [];
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (!isObj(s) || !("input" in s) || !("observedOutput" in s)) return { ok: false, code: "INVALID_SAMPLE", reason: `sample[${i}] must be an object with input and observedOutput` };
    const d = inputDigest(s.input);
    const out = canonStr(s.observedOutput);
    if (d in byDigest) {
      if (byDigest[d] !== out) return { ok: false, code: "NONDETERMINISTIC_SOURCE", reason: `the same input is observed with differing outputs (sample[${i}]) — a non-deterministic source cannot be characterized honestly` };
      continue; // identical duplicate ⇒ dedup
    }
    byDigest[d] = out;
    order.push(d);
  }
  return { ok: true, entries: order.map((d) => ({ inputDigest: d, output: byDigest[d] })) };
}

// Capture a sealed, tamper-evident behavioral baseline from recorded samples.
// opts: { key?, revision?, runId?, spawn? } threaded to evidence-provenance (revision/spawn let tests be hermetic).
function captureBaseline(input: any): any {
  const target = input && typeof input.target === "string" ? input.target.trim() : "";
  if (!target) return { ok: false, code: "INVALID_INPUT", reason: "target (string) required", basis: BASIS };
  const n = normalizeSamples(input && input.samples);
  if (!n.ok) {
    const code = n.code === "NO_SAMPLES" ? "NO_BASELINE" : n.code;
    return { ok: false, code, reason: n.reason, basis: BASIS };
  }
  const core = { schema: SCHEMA, target, basis: BASIS, count: n.entries!.length, entries: n.entries };
  const opts = input || {};
  const baseline = EP.stampProvenance(core, { key: opts.key, revision: opts.revision, runId: opts.runId, spawn: opts.spawn });
  return {
    ok: true,
    baseline,
    note: "Behavioral baseline sealed (evidence-provenance). It pins CURRENT observed behavior as a regression net; it is NOT a correctness oracle.",
  };
}

// Compare a fresh set of recorded samples against a sealed baseline.
// Verdicts: BASELINE_TAMPERED | NO_COMPARISON | INCOMPLETE | BEHAVIOR_CHANGED | BEHAVIOR_PRESERVED.
function compareToBaseline(baseline: any, newSamples: any, opts?: any): any {
  const key = opts && typeof opts === "object" ? opts.key : undefined;
  // 1) integrity: a baseline altered since capture (or wrong key) cannot be trusted ⇒ fail-closed.
  const v = EP.verifyProvenance(baseline, { key });
  if (!v.ok) return { ok: false, verdict: "BASELINE_TAMPERED", reason: v.reason, basis: BASIS };
  if (!baseline || baseline.schema !== SCHEMA || !Array.isArray(baseline.entries)) return { ok: false, verdict: "BASELINE_TAMPERED", reason: "not a characterization baseline", basis: BASIS };
  // Fail-closed: a zero-entry baseline (not producible by captureBaseline, which returns NO_BASELINE on empty,
  // but hand-craftable + validly sealed) cannot prove behavior-preservation — it would vacuously "PRESERVE"
  // against any input. Refuse it explicitly rather than return a hollow BEHAVIOR_PRESERVED.
  if (baseline.entries.length === 0) return { ok: false, verdict: "NO_BASELINE", reason: "baseline has no entries — nothing to compare (a zero-entry baseline cannot prove behavior-preservation)", basis: BASIS };

  const n = normalizeSamples(newSamples);
  if (!n.ok) return { ok: false, verdict: "NO_COMPARISON", code: n.code, reason: n.reason, basis: BASIS };
  const fresh: Record<string, string> = {};
  for (const e of n.entries!) fresh[e.inputDigest] = e.output;

  const changed: any[] = [];
  const missing: any[] = [];
  let preserved = 0;
  for (const e of baseline.entries) {
    if (!(e.inputDigest in fresh)) { missing.push({ inputDigest: e.inputDigest }); continue; }
    if (fresh[e.inputDigest] === e.output) preserved++;
    else changed.push({ inputDigest: e.inputDigest, baselineOutput: e.output, newOutput: fresh[e.inputDigest] });
  }
  const baselineDigests = new Set(baseline.entries.map((e: any) => e.inputDigest));
  const extras = Object.keys(fresh).filter((d) => !baselineDigests.has(d)).map((d) => ({ inputDigest: d }));

  // verdict precedence (fail-closed): a coverage gap is NOT a pass; a change is NOT a pass.
  let verdict: string;
  if (missing.length > 0) verdict = "INCOMPLETE";
  else if (changed.length > 0) verdict = "BEHAVIOR_CHANGED";
  else verdict = "BEHAVIOR_PRESERVED";

  const findings: any[] = [];
  for (const c of changed) findings.push({ id: `behavior-changed:${c.inputDigest.slice(0, 12)}`, area: "behavior", severity: "HIGH", detail: "observed output differs from the characterization baseline for this input", remediation: "if the change is intended, record an explicit human bless and re-capture the baseline; otherwise the edit is NOT behavior-preserving", evidence: c });
  for (const m of missing) findings.push({ id: `coverage-missing:${m.inputDigest.slice(0, 12)}`, area: "coverage", severity: "MEDIUM", detail: "a baselined input was not exercised by the compare run", remediation: "exercise every baselined input before asserting behavior-preservation (a coverage gap is not a pass)", evidence: m });

  return {
    ok: true,
    verdict,
    basis: BASIS,
    counts: { baseline: baseline.entries.length, preserved, changed: changed.length, missing: missing.length, extras: extras.length },
    changed,
    missing,
    extras,
    findings,
    note: verdict === "BEHAVIOR_PRESERVED"
      ? "Outputs match the recorded baseline. This proves behavior was PRESERVED, NOT that it is correct (a preserved bug stays preserved)."
      : verdict === "INCOMPLETE"
      ? "Not every baselined input was exercised; behavior-preservation is UNPROVEN for the missing inputs (fail-closed, not a pass)."
      : verdict === "BEHAVIOR_CHANGED"
      ? "Behavior changed vs the baseline; this requires an explicit human bless before acceptance."
      : "Baseline integrity failed; comparison refused.",
  };
}

export { canon, canonStr, inputDigest, normalizeSamples, captureBaseline, compareToBaseline, SCHEMA, BASIS };
module.exports = { canon, canonStr, inputDigest, normalizeSamples, captureBaseline, compareToBaseline, SCHEMA, BASIS };

if (require.main === module) {
  const rev = { commit: "demo", treeDirty: false, available: true };
  const cap = captureBaseline({ target: "legacy.fn", revision: rev, samples: [{ input: { a: 1, b: 2 }, observedOutput: 3 }, { input: { b: 2, a: 1 }, observedOutput: 3 }] });
  const same = compareToBaseline(cap.baseline, [{ input: { a: 1, b: 2 }, observedOutput: 3 }]);
  process.stdout.write(JSON.stringify({ captured: cap.ok, count: cap.baseline && cap.baseline.count, verdict: same.verdict }, null, 2) + "\n");
}
