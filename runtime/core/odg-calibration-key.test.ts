#!/usr/bin/env node
"use strict";
/* Tests for odg-calibration-key (V327 §3). The SAFE reconciliation of the #794 taxonomy mismatch: a mission's calibration
 * key reconstructs EXACTLY the native-build-outcome store key (`native-build:<STRAT>:<COMPLEXITY>`) via the SAME
 * classifier the store uses; explicit KNOWN/INFERRED/UNKNOWN; UNKNOWN ⇒ refuse calibration; aligned history feeds the
 * policy. Deterministic; cross-checks the key against the real store + classifier (no hard-coded taxonomy). */
const K = require("./odg-calibration-key.js");
const DP = require("./decomposition-planner.js");
const NBO = require("./native-build-outcome.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  const spec = { name: "add", architecture: [{ path: "f.js", role: "add", contract: "module.exports=(a,b)=>a+b" }] };

  // (1) the derived key reconstructs EXACTLY the store's key — cross-checked against the REAL store (no hard-coded string)
  const strat = DP.chooseStrategy(spec).strategy;
  const storeKey = NBO.recordNativeBuild([], { accepted: true, verified: true, buildOk: true }, spec, strat, 1).outcomes[0].type;
  const ck = K.calibrationKey(spec);
  check("key reconstructs EXACTLY the native-build-outcome store key (same classifier; no 2nd taxonomy)", ck.key === storeKey && ck.usable === true);
  check("a declared architecture ⇒ KNOWN confidence, provenance carried", ck.confidence === "KNOWN" && ck.provenance.complexity === "TRIVIAL" && ck.provenance.architectureDeclared === true);

  // (2) classifiable WITHOUT a declared architecture ⇒ INFERRED (usable, lower confidence)
  const inf = K.calibrationKey({ name: "x" });
  check("no declared architecture but classifiable ⇒ INFERRED (usable:true, confidence INFERRED)", inf.usable === true && inf.confidence === "INFERRED");

  // (3) unclassifiable ⇒ UNKNOWN ⇒ REFUSE (usable:false) — fail-closed, never a fabricated key
  check("non-object spec ⇒ UNKNOWN, usable:false (refuse calibration)", (() => { const r = K.calibrationKey(null); return r.confidence === "UNKNOWN" && r.usable === false && r.key === null; })());

  // (4) storeHistoryFor maps only this key's verified SUCCESS/FAILURE (UNKNOWN censored; wrong key excluded)
  const outcomes = [
    { type: storeKey, outcome: "SUCCESS", independentlyVerified: true, at: "2026-11-01T00:00:00Z" },
    { type: storeKey, outcome: "FAILURE", independentlyVerified: true, at: null },
    { type: storeKey, outcome: "UNKNOWN", independentlyVerified: false },           // censored
    { type: "native-build:MONOLITHIC:COMPLEX", outcome: "SUCCESS", independentlyVerified: true }, // other key, excluded
  ];
  const hist = K.storeHistoryFor(outcomes, storeKey);
  check("storeHistoryFor: only this key's verified outcomes mapped (UNKNOWN censored, other key excluded), tagged with key", hist.length === 2 && hist.every((r: any) => r.missionType === storeKey) && hist[0].verified === true && hist[1].verified === false);
  check("`at` carried through for belief-refresh staleness; null `at` omitted", hist[0].at === "2026-11-01T00:00:00Z" && hist[1].at === undefined);

  // (5) beliefFromStore: usable key + aligned history ⇒ a belief keyed by the store key (the policy can consume it)
  const bf = K.beliefFromStore(spec, outcomes);
  check("beliefFromStore (usable): produces a calibrated belief keyed by the store key over the mapped history", bf.usable === true && bf.key === storeKey && bf.history.length === 2 && bf.belief !== null && typeof bf.belief === "object");

  // (6) beliefFromStore REFUSES on an UNKNOWN key — compatibility validated BEFORE consumption (§3)
  const bfR = K.beliefFromStore(null, outcomes);
  check("beliefFromStore (UNKNOWN): REFUSES — usable:false, belief:null, empty history (no consumption on insufficient mapping)", bfR.usable === false && bfR.belief === null && bfR.history.length === 0 && /refus/i.test(bfR.reason));

  // (7) frozen + contract (no 2nd taxonomy, read-only, no central change)
  check("frozen results", Object.isFrozen(ck) && Object.isFrozen(bf));
  check("contract: NO second taxonomy; refuse-on-UNKNOWN; read-only; no central modification",
    /NO second taxonomy/.test(JSON.stringify(K.CALIBRATION_KEY_CONTRACT.invariants)) &&
    /REFUSE calibration/.test(JSON.stringify(K.CALIBRATION_KEY_CONTRACT.invariants)) &&
    /NO central modification/.test(JSON.stringify(K.CALIBRATION_KEY_CONTRACT.invariants)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-calibration-key (V327 §3: SAFE taxonomy reconciliation — key reconstructs the store's `native-build:<STRAT>:<COMPLEXITY>` via the SAME classifier [cross-checked vs the real store], KNOWN/INFERRED/UNKNOWN, UNKNOWN⇒refuse, aligned history feeds the policy; no 2nd taxonomy, no central change)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
