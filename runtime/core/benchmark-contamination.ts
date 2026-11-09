#!/usr/bin/env node
"use strict";

/*
 * V5 / M-BENCH-01 (Benchmark Factory — hidden eval sets + contamination detector). PURE, deterministic. The existing
 * benchmark-factory BUILDS/RUNS suites and eval-significance SCORES them; what is missing is the guarantee that a HIDDEN
 * (held-out) eval set is actually uncontaminated — a hidden case whose content has leaked into a known/public/training
 * corpus, or that is duplicated inside the hidden set itself, makes the measured score meaningless. This module
 * fingerprints each hidden case (sha256 over NORMALIZED content — deterministic, so trivial reformatting is still
 * caught) and flags any case whose fingerprint appears in the known corpus (CONTAMINATED) or appears twice in the hidden
 * set (DUPLICATE). It then CERTIFIES a benchmark result only if it is BOTH uncontaminated AND statistically significant
 * (reusing eval-significance.significanceGate) — a contaminated benchmark NEVER certifies, even with a perfect score
 * (fail-closed; a high number over leaked data is not evidence). It composes the existing pieces (no new scorer, no new
 * suite engine — anti-gas-factory); it measures and reports and grants no authority. Dual export.
 */

const crypto = require("crypto");
const SIG = require("./eval-significance");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

/** fingerprint(content) -> sha256 of normalized text (lowercased, whitespace-collapsed, trimmed). Deterministic. */
function fingerprint(content: any): string {
  const norm = String(content === undefined || content === null ? "" : content).toLowerCase().replace(/\s+/g, " ").trim();
  return crypto.createHash("sha256").update(norm).digest("hex");
}

/**
 * detectContamination({ hiddenSet, knownCorpus, knownFingerprints }) ->
 *   { total, contaminated, duplicates, clean, contaminationRate, verdict, note }.
 * hiddenSet: [{ id, content }]. knownCorpus: [content...] (hashed here) and/or knownFingerprints: [hash...].
 * A hidden case whose fingerprint ∈ known ⇒ CONTAMINATED; a fingerprint seen twice in the hidden set ⇒ DUPLICATE.
 */
function detectContamination(input: any): any {
  const o = isObj(input) ? input : {};
  const hidden = arr(o.hiddenSet).filter(isObj);
  const known = new Set(arr(o.knownFingerprints).map(String).concat(arr(o.knownCorpus).map((c) => fingerprint(c))));

  const seen: Record<string, string> = {};   // fingerprint -> first case id (intra-set duplicate detection)
  const contaminated: any[] = []; const duplicates: any[] = []; const clean: string[] = [];
  for (const c of hidden) {
    const id = c.id !== undefined ? String(c.id) : "(unnamed)";
    const fp = fingerprint(c.content);
    if (known.has(fp)) { contaminated.push(Object.freeze({ id, reason: "fingerprint present in the known/public corpus — hidden case has LEAKED (contaminated)" })); continue; }
    if (seen[fp] !== undefined) { duplicates.push(Object.freeze({ id, duplicateOf: seen[fp], reason: "identical content appears earlier in the hidden set — not an independent case" })); continue; }
    seen[fp] = id; clean.push(id);
  }
  const bad = contaminated.length + duplicates.length;
  const total = hidden.length;
  const rate = total > 0 ? Number((bad / total).toFixed(4)) : 0;
  return Object.freeze({
    total, contaminated: Object.freeze(contaminated), duplicates: Object.freeze(duplicates), clean: Object.freeze(clean),
    contaminationRate: rate,
    verdict: bad === 0 ? "CLEAN" : "CONTAMINATED",
    note: bad === 0 ? "hidden eval set is uncontaminated and internally unique" : `${contaminated.length} leaked + ${duplicates.length} duplicate case(s) — the hidden set is compromised (fail-closed: results over it are not valid evidence)`,
  });
}

/**
 * certifyBenchmark({ hiddenSet, knownCorpus, knownFingerprints, significance }) -> { certified, contamination, significance, reasons }.
 * CERTIFIED only if the hidden set is CLEAN AND the result is statistically significant. Contamination ⇒ INVALID regardless of score.
 */
function certifyBenchmark(input: any): any {
  const o = isObj(input) ? input : {};
  const contamination = detectContamination(o);
  const sig = SIG.significanceGate(isObj(o.significance) ? o.significance : {});
  const reasons: string[] = [];
  if (contamination.verdict !== "CLEAN") reasons.push(`hidden eval set CONTAMINATED (${contamination.note}) ⇒ benchmark INVALID — a score over leaked/duplicated data is not evidence (fail-closed)`);
  if (sig.significant !== true) reasons.push(`result not statistically significant (${sig.verdict}: ${sig.reason}) ⇒ not certifiable`);
  const certified = contamination.verdict === "CLEAN" && sig.significant === true;
  return Object.freeze({
    certified,
    contamination,
    significance: sig,
    reasons: Object.freeze(certified ? ["hidden set CLEAN + result statistically significant ⇒ benchmark CERTIFIED"] : reasons),
  });
}

const BENCHMARK_CONTAMINATION_CONTRACT = Object.freeze({
  id: "V5-BENCHMARK-CONTAMINATION",
  source: "ODG Master program M-BENCH-01 — Benchmark Factory hidden eval sets + contamination detector",
  reuses: Object.freeze(["benchmark-factory (suite build/run)", "eval-significance.significanceGate (statistical gate) — composes, builds no new scorer/suite (anti-gas-factory)", "crypto.sha256 (deterministic content fingerprint)"]),
  notAuthority: "detects hidden-eval-set contamination + certifies a benchmark; it runs nothing destructive and grants no authority",
  invariants: Object.freeze([
    "a hidden case whose normalized-content fingerprint appears in the known/public corpus is CONTAMINATED (leaked)",
    "a hidden case whose fingerprint repeats inside the hidden set is a DUPLICATE (not an independent case)",
    "fingerprinting is over NORMALIZED content (lowercase + whitespace-collapsed) so trivial reformatting is still caught; deterministic sha256",
    "a benchmark is CERTIFIED only if the hidden set is CLEAN AND the result is statistically significant — contamination ⇒ INVALID regardless of score (a high number over leaked data is not evidence, fail-closed)",
    "pure/deterministic: hidden set + known corpus + result in → contamination + certification out; no clock/random/network; composes existing pieces (no new scorer/suite engine)",
  ]),
});

module.exports = { fingerprint, detectContamination, certifyBenchmark, BENCHMARK_CONTAMINATION_CONTRACT };

if (require.main === module) {
  const hidden = [{ id: "h1", content: "What is 2+2?" }, { id: "h2", content: "Capital of France" }, { id: "h3", content: "WHAT  IS  2+2?" }];
  const known = ["Capital of France"];   // h2 leaked; h3 duplicates h1 after normalization (case + whitespace)
  const c = detectContamination({ hiddenSet: hidden, knownCorpus: known });
  const cert = certifyBenchmark({ hiddenSet: hidden, knownCorpus: known, significance: { before: { successes: 70, n: 100 }, after: { successes: 85, n: 100 } } });
  process.stdout.write(JSON.stringify({ ...BENCHMARK_CONTAMINATION_CONTRACT, demo: { verdict: c.verdict, contaminated: c.contaminated.length, duplicates: c.duplicates.length, certified: cert.certified } }, null, 2) + "\n");
}

export {};
