#!/usr/bin/env node
"use strict";
/* Tests for odg-radar-foresight-calibration (V360 §14 C2). Deterministic, zero fs/network. Proves: source re-weighting is
 * driven by REALIZED forecast accuracy over time, fail-closed under minDecided (never on noise); EXPIRED/PENDING excluded;
 * the canonical radar self-eval is re-grounded on resolved outcomes; everything PROPOSED (selfAuthorized:false). */
const M = require("./odg-radar-foresight-calibration.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const prop = (r: any, kind: string, src: string) => r.proposals.some((p: any) => p.kind === kind && p.source === src);

// helper: n resolved forecasts for a source with a given verdict/confidence/outcome
function many(source: string, verdict: string, outcome: number, confidence: number, n: number): any[] {
  return Array.from({ length: n }, (_, k) => ({ forecastId: `${source}:${k}`, source, verdict, confidence, outcome }));
}

function main(): void {
  // a BAD source: 6 resolved, all REFUTED (false signals) at high confidence ⇒ down-weight + overconfident discount
  const bad = many("radar:badsrc", "REFUTED", 0, 0.9, 6);
  // a GOOD source: 6 resolved CONFIRMED at well-matched confidence ⇒ trust (if calibrated)
  const good = many("radar:goodsrc", "CONFIRMED", 1, 0.9, 6);
  // a THIN source: only 2 resolved ⇒ NOT_MEASURED (never re-weighted on noise)
  const thin = many("radar:thinsrc", "REFUTED", 0, 0.9, 2);
  // some EXPIRED (no ground truth) — must NOT create a proposal or count as decided
  const expired = many("radar:badsrc", "EXPIRED_UNRESOLVED", 0, 0.9, 10);

  const r = M.assessForesightCalibration({ resolutions: [...bad, ...good, ...thin, ...expired] }, { minDecided: 5 });

  check("bad source down-weighted (realized hitRate 0 / false signals over time)", prop(r, "down-weight-source", "radar:badsrc"));
  check("bad source confidence discounted (realized OVERCONFIDENT/MISCALIBRATED)", prop(r, "discount-confidence-source", "radar:badsrc"));
  check("thin source NOT re-weighted (fail-closed NOT_MEASURED under minDecided); hitRate withheld (null)", !prop(r, "down-weight-source", "radar:thinsrc") && r.bySource.some((s: any) => s.source === "radar:thinsrc" && s.measurable === false && s.hitRate === null));
  check("EXPIRED did not inflate decided for the bad source (decided = 6, not 16)", r.bySource.some((s: any) => s.source === "radar:badsrc" && s.decided === 6));
  check("good source measurable with realized hitRate 1.0", r.bySource.some((s: any) => s.source === "radar:goodsrc" && s.measurable === true && s.hitRate === 1));

  // the canonical radar self-eval is re-grounded on resolved outcomes (measurable, PROPOSED-only)
  check("radar self-eval re-grounded on realized outcomes (measurable)", r.radarSelfImprovement.measurable === true && r.radarSelfImprovement.selfAuthorized === false);
  check("everything PROPOSED; selfAuthorized false (radar never self-applies)", r.selfAuthorized === false && r.proposals.every((p: any) => p.status === "PROPOSED"));

  // no resolutions ⇒ nothing proposed, radar self-eval NOT_MEASURED (no fabrication)
  const none = M.assessForesightCalibration({ resolutions: [] });
  check("no resolutions ⇒ no proposals; radar self-eval NOT_MEASURED", none.proposals.length === 0 && none.radarSelfImprovement.measurable === false);

  // integrity-gamed ⇒ the canonical guard withholds (passed through assessRadarCycle)
  const gamed = M.assessForesightCalibration({ resolutions: [...good], integritySignals: { contradictions: 5, selfReported: true, independentCorroboration: false } }, { minDecided: 5 });
  check("integrity signals flow to the canonical meta-intelligence guard (integrity surfaced)", typeof gamed.radarSelfImprovement.integrity === "string");

  check("frozen + contract: realized-accuracy-driven, minDecided fail-closed, PROPOSED-only, composes (no 2nd engine)",
    Object.isFrozen(r) &&
    /REALIZED .*accuracy over time/.test(JSON.stringify(M.FORESIGHT_CALIBRATION_CONTRACT.invariants)) &&
    /minDecided/.test(JSON.stringify(M.FORESIGHT_CALIBRATION_CONTRACT.invariants)) &&
    /selfAuthorized:false/.test(JSON.stringify(M.FORESIGHT_CALIBRATION_CONTRACT.invariants)) &&
    /no second radar/.test(JSON.stringify(M.FORESIGHT_CALIBRATION_CONTRACT.invariants)) &&
    /frontier-radar-self-improvement/.test(JSON.stringify(M.FORESIGHT_CALIBRATION_CONTRACT.reuses)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-radar-foresight-calibration (V360 §14 C2: Radar source re-weighting driven by REALIZED forecast accuracy over time; fail-closed under minDecided, EXPIRED/PENDING excluded, PROPOSED-only/selfAuthorized:false; composes forecast-memory + frontier-radar-self-improvement, no 2nd engine)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
