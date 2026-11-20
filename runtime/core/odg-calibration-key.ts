#!/usr/bin/env node
"use strict";
/*
 * V327 §3 — CALIBRATION-KEY RECONCILIATION (the safe fix for the #794 taxonomy mismatch). PURE, deterministic,
 * fail-closed. #794 flagged that native-build-outcome keys outcomes by COMPLEXITY CLASS while a policy query used the
 * mission DOMAIN-TYPE. Resolution (impact-studied, no central change, no 2nd taxonomy): unify calibration on the EXISTING
 * complexity taxonomy the store already uses. The store key is `native-build:<STRATEGY>:<COMPLEXITY>`, and that key
 * reconstructs EXACTLY from decomposition-planner.chooseStrategy + assessComplexity (the SAME classifier
 * native-build-outcome uses). So a mission's calibration key is derivable + traceable, aligned with the store.
 *
 * Confidence is explicit (§3): KNOWN (spec has an architecture ⇒ the classifier is confident), INFERRED (classifiable
 * but without a declared architecture), UNKNOWN (unclassifiable). Calibration is REFUSED when confidence is UNKNOWN
 * (usable:false) — never consumed by the policy on an insufficient/ambiguous mapping. Provenance (the classifier outputs)
 * is carried. Composes decomposition-planner + odg-calibrated-psuccess; no new taxonomy, no central modification.
 */

const DP = require("./decomposition-planner.js");
const CP = require("./odg-calibrated-psuccess.js");

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

const CONFIDENCE = Object.freeze({ KNOWN: "KNOWN", INFERRED: "INFERRED", UNKNOWN: "UNKNOWN" });

/** calibrationKey(spec) -> { key, confidence, usable, provenance, reason }. The store-aligned complexity key, or UNKNOWN
 *  (usable:false ⇒ refuse calibration). Reuses the SAME classifier (decomposition-planner) the store uses. */
function calibrationKey(spec: any): any {
  if (!isObj(spec)) return freeze({ key: null, confidence: CONFIDENCE.UNKNOWN, usable: false, provenance: null, reason: "spec not an object — unclassifiable (refuse calibration)" });
  let strat: any = null, cx: any = null;
  try { strat = DP.chooseStrategy(spec).strategy; cx = DP.assessComplexity(spec).complexity; } catch { /* classifier failure ⇒ UNKNOWN */ }
  if (typeof strat !== "string" || !strat || typeof cx !== "string" || !cx)
    return freeze({ key: null, confidence: CONFIDENCE.UNKNOWN, usable: false, provenance: freeze({ strategy: strat || null, complexity: cx || null }), reason: "classifier could not determine strategy+complexity — refuse calibration (fail-closed)" });
  const hasArch = Array.isArray(spec.architecture) && spec.architecture.length > 0;
  const confidence = hasArch ? CONFIDENCE.KNOWN : CONFIDENCE.INFERRED;
  return freeze({ key: `native-build:${String(strat).toUpperCase()}:${cx}`, confidence, usable: true, provenance: freeze({ strategy: String(strat).toUpperCase(), complexity: cx, architectureDeclared: hasArch }), reason: hasArch ? "classified from a declared architecture (KNOWN)" : "classified without a declared architecture (INFERRED) — usable but lower confidence" });
}

/** storeHistoryFor(storeOutcomes, key) -> calibrated-P history rows tagged with `key`, from the store's verified
 *  SUCCESS/FAILURE outcomes of that key (UNKNOWN censored). The rows align with a policy query by `key`. */
function storeHistoryFor(storeOutcomes: any, key: string): any[] {
  const all = Array.isArray(storeOutcomes) ? storeOutcomes.filter(isObj) : [];
  const rows: any[] = [];
  for (const o of all) {
    if (o.type !== key) continue;
    if (o.outcome === "SUCCESS" && o.independentlyVerified === true) rows.push(freeze({ missionType: key, verified: true, at: o.at === null ? undefined : o.at }));
    else if (o.outcome === "FAILURE" && o.independentlyVerified === true) rows.push(freeze({ missionType: key, verified: false, at: o.at === null ? undefined : o.at }));
    // UNKNOWN / unverified ⇒ censored
  }
  return rows;
}

/**
 * beliefFromStore(spec, storeOutcomes, opts?) -> { usable, key, confidence, history, belief, reason }. The SAFE
 * consumption path: derive the store-aligned key, refuse if UNKNOWN, else map the store's outcomes for that key into a
 * calibrated-P history and compute the (survivorship-guarded) belief. The policy consumes `history` keyed by `key`.
 */
function beliefFromStore(spec: any, storeOutcomes: any, opts: any = {}): any {
  const ck = calibrationKey(spec);
  if (!ck.usable) return freeze({ usable: false, key: ck.key, confidence: ck.confidence, history: freeze([]), belief: null, reason: `calibration refused: ${ck.reason} (compatibility validated BEFORE consumption, §3)` });
  const history = storeHistoryFor(storeOutcomes, ck.key);
  const belief = CP.derivePsuccess(ck.key, history, isObj(opts) ? opts : {});
  return freeze({ usable: true, key: ck.key, confidence: ck.confidence, history: freeze(history), belief, reason: `calibration key ${ck.confidence}; ${history.length} store outcome(s) mapped for ${ck.key}` });
}

const CALIBRATION_KEY_CONTRACT = Object.freeze({
  id: "V327-CALIBRATION-KEY-RECONCILIATION",
  purpose: "§3 — reconcile the native-build-outcome complexity-class store with calibration consumption WITHOUT a second taxonomy or a central change: derive a mission's store-aligned key from the SAME classifier the store uses, with explicit KNOWN/INFERRED/UNKNOWN confidence and refuse-on-UNKNOWN",
  reuses: Object.freeze(["decomposition-planner.chooseStrategy+assessComplexity (the SAME classifier native-build-outcome uses to key outcomes)", "odg-calibrated-psuccess.derivePsuccess (survivorship-guarded belief)", "native-build-outcome accumulated store (read-only; no modification)"]),
  invariants: Object.freeze([
    "the calibration key reconstructs EXACTLY the store's `native-build:<STRATEGY>:<COMPLEXITY>` key — NO second taxonomy",
    "confidence is explicit: KNOWN (declared architecture) | INFERRED (classifiable, no architecture) | UNKNOWN (unclassifiable); UNKNOWN ⇒ REFUSE calibration (usable:false), never consumed on an insufficient/ambiguous mapping",
    "compatibility is validated BEFORE the policy consumes the belief; provenance (strategy/complexity) is carried",
    "read-only over the store + classifier; NO central modification; PURE/deterministic/frozen/fail-closed",
  ]),
});

module.exports = { calibrationKey, storeHistoryFor, beliefFromStore, CONFIDENCE, CALIBRATION_KEY_CONTRACT };
export {};
