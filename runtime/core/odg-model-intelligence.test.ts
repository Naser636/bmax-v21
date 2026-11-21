#!/usr/bin/env node
"use strict";
/* Tests for odg-model-intelligence (V360 §14 C3 / §8). Deterministic, zero fs/network. Proves: WHICH route = calibrated
 * P(success) (not popularity); DID IT WIN = reproducible before/after (never a one-off); activity ≠ intelligence (a WIN needs
 * BOTH calibrated selection AND a reproducible gain); regression surfaced; recommends only (selfAuthorized/authorizes false). */
const M = require("./odg-model-intelligence.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

const hist = (n: number, s: number) => Array.from({ length: n }, (_, k) => ({ missionType: "eng", verified: k < s }));
const lat = (n: number, base: number) => Array.from({ length: n }, (_, k) => base + (k % 4 === 0 ? 2 : 0)); // low variance (p95/p50 ~1.02)
const CAL_HI = hist(40, 32); // 80% ⇒ CALIBRATED NATIVE_LOCAL

function main(): void {
  // (1) MEASURED_WIN: calibrated selection + reproducible faster latency vs baseline
  const win = M.assessModelIntelligence({ missionType: "eng", history: CAL_HI, selected: { route: "native-local", latencyMs: lat(24, 50) }, baseline: { route: "provider", latencyMs: lat(24, 100) } }, { minSampleN: 20 });
  check("WHICH: calibrated selection (NATIVE_LOCAL, evidence not popularity)", win.selection.calibrated === true && win.selection.tier === "NATIVE_LOCAL");
  check("DID IT WIN: reproducible faster ⇒ MEASURED_WIN", win.measuredPerformance === "FASTER_REPRODUCIBLE" && win.verdict === "MEASURED_WIN" && win.comparison.reductionPct > 0);
  check("recommends only (authorizes:false, selfAuthorized:false)", win.authorizes === false && win.selfAuthorized === false);

  // (2) MEASURED_REGRESSION: calibrated-preferred route is reproducibly SLOWER
  const reg = M.assessModelIntelligence({ missionType: "eng", history: CAL_HI, selected: { route: "native-local", latencyMs: lat(24, 150) }, baseline: { route: "provider", latencyMs: lat(24, 100) } });
  check("reproducible SLOWER ⇒ MEASURED_REGRESSION (not hidden, not a win)", reg.measuredPerformance === "SLOWER_REPRODUCIBLE" && reg.verdict === "MEASURED_REGRESSION");

  // (3) activity ≠ intelligence: a NOISY one-off is NOT a win (high variance ⇒ NOT_REPRODUCIBLE)
  const noisy = M.assessModelIntelligence({ missionType: "eng", history: CAL_HI, selected: { route: "native-local", latencyMs: [10, 10, 10, 10, 1000, 10, 10, 10] }, baseline: { route: "provider", latencyMs: lat(24, 100) } });
  check("high-variance one-off ⇒ NOT_REPRODUCIBLE ⇒ SELECTED_UNMEASURED (no credited win)", noisy.measuredPerformance === "NOT_REPRODUCIBLE" && noisy.verdict === "SELECTED_UNMEASURED");

  // (4) NO baseline ⇒ performance NOT_MEASURED (calibrated selection stands, no fabricated gain)
  const noBase = M.assessModelIntelligence({ missionType: "eng", history: CAL_HI, selected: { route: "native-local", latencyMs: lat(24, 50) } });
  check("no baseline ⇒ NOT_MEASURED ⇒ SELECTED_UNMEASURED (no fabricated gain)", noBase.measuredPerformance === "NOT_MEASURED" && noBase.verdict === "SELECTED_UNMEASURED");

  // (5) NO calibrated evidence (thin history) ⇒ INSUFFICIENT_EVIDENCE / PROBE (never a confident pick)
  const probe = M.assessModelIntelligence({ missionType: "eng", history: hist(3, 2), selected: { route: "native-local", latencyMs: lat(24, 50) }, baseline: { route: "provider", latencyMs: lat(24, 100) } });
  check("thin history ⇒ INSUFFICIENT_EVIDENCE, PROBE (not a confident pick) even if latency looks faster", probe.verdict === "INSUFFICIENT_EVIDENCE" && probe.selection.calibrated === false && /PROBE/.test(probe.recommendation));

  // (5b) RELIABILITY OVERRIDES SPEED: calibrated routing escalates AWAY from native (low P), native selected + faster ⇒ NOT a win
  const misaligned = M.assessModelIntelligence({ missionType: "eng", history: hist(40, 8), selected: { route: "native-local", kind: "native", latencyMs: lat(24, 40) }, baseline: { route: "provider", latencyMs: lat(24, 100) } });
  check("faster but calibrated favors escalation ⇒ RELIABILITY_OVERRIDES_SPEED (speed ≠ reliability)", misaligned.selection.tier === "ESCALATE_PROVIDER" && misaligned.selection.reliabilityAligned === "MISALIGNED" && misaligned.verdict === "RELIABILITY_OVERRIDES_SPEED");

  // (5c) unknown route class + faster ⇒ alignment UNVERIFIED, not promoted to a full win
  const unk = M.assessModelIntelligence({ missionType: "eng", history: CAL_HI, selected: { route: "mystery-engine", latencyMs: lat(24, 40) }, baseline: { route: "provider", latencyMs: lat(24, 100) } });
  check("unknown route class + faster ⇒ MEASURED_FASTER_RELIABILITY_UNVERIFIED (not a full win)", unk.selection.reliabilityAligned === "UNKNOWN" && unk.verdict === "MEASURED_FASTER_RELIABILITY_UNVERIFIED");

  // (5d) AMBIGUOUS route name (both native-ish and provider-ish tokens) ⇒ fail-closed UNKNOWN (not resolved by regex order)
  const ambig = M.assessModelIntelligence({ missionType: "eng", history: CAL_HI, selected: { route: "local-cloud-proxy-provider", latencyMs: lat(24, 40) }, baseline: { route: "provider", latencyMs: lat(24, 100) } });
  check("ambiguous route name ⇒ reliabilityAligned UNKNOWN (fail-closed, not a false native win)", ambig.selection.reliabilityAligned === "UNKNOWN" && ambig.verdict === "MEASURED_FASTER_RELIABILITY_UNVERIFIED");

  // (6) NO_DIFFERENCE: identical latency ⇒ no claimed win
  const same = M.assessModelIntelligence({ missionType: "eng", history: CAL_HI, selected: { route: "native-local", latencyMs: lat(24, 100) }, baseline: { route: "provider", latencyMs: lat(24, 100) } });
  check("identical latency ⇒ NO_DIFFERENCE ⇒ SELECTED_NO_MEASURED_GAIN (no claimed win)", same.measuredPerformance === "NO_DIFFERENCE" && same.verdict === "SELECTED_NO_MEASURED_GAIN");

  // frozen + contract
  check("frozen result", Object.isFrozen(win) && Object.isFrozen(win.selection));
  check("contract: calibrated-not-popularity; activity≠intelligence reproducible-win; recommends-only; composes (no 2nd engine)",
    /NOT popularity\/recency/.test(JSON.stringify(M.MODEL_INTELLIGENCE_CONTRACT.invariants)) &&
    /activity ≠ intelligence/.test(JSON.stringify(M.MODEL_INTELLIGENCE_CONTRACT.invariants)) &&
    /recommends only/.test(JSON.stringify(M.MODEL_INTELLIGENCE_CONTRACT.invariants)) &&
    /odg-execution-routing/.test(JSON.stringify(M.MODEL_INTELLIGENCE_CONTRACT.reuses)) &&
    /performance-observability/.test(JSON.stringify(M.MODEL_INTELLIGENCE_CONTRACT.reuses)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-model-intelligence (V360 §14 C3/§8: which route = calibrated P(success) not popularity; did-it-win = reproducible before/after; activity≠intelligence — a WIN needs calibrated selection AND a reproducible gain; regression surfaced; NOT_MEASURED honest; recommends only; composes odg-execution-routing + performance-observability + latency-measure, no 2nd engine)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
