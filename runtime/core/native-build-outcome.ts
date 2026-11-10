#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V38 LOT G — NATIVE BUILD OUTCOME RACCORDEMENT. PURE, deterministic, fail-closed. It builds NO new ledger and
 * NO new builder — it RACCORDE (wires) the native self-engineering loop (native-project-builder, strategy-chosen by
 * decomposition-planner) into ODG's honest measurement/learning stack (mission-outcome-ledger + calibration). The V36
 * lesson: record SUCCESS *and* FAILURE (no survivorship bias). A native build is the ideal unbiased source because its
 * acceptance is decided by an INDEPENDENT verifier, so BOTH a success (built + passed the independent test) and a genuine
 * failure (the independent build/test failed) are independently determined — never the generator's self-claim.
 *
 * It derives a mission-outcome entry from a native-project-builder result, records it (deduped, append-only), and measures
 * the REAL native-build reliability per complexity class × strategy (failure-inclusive). It invents no success: a missing /
 * malformed build result ⇒ UNKNOWN (unverified, censored from calibration), never SUCCESS. Dual export.
 */

const DP = require("./decomposition-planner.js");
const LEDGER = require("./mission-outcome-ledger.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

/**
 * deriveNativeOutcome(buildOutcome, spec, strategy, attempt) -> a mission-outcome entry. FAIL-CLOSED: accepted===true ⇒
 * SUCCESS (independently verified); a real build/verify failure ⇒ FAILURE (independently determined — a technical failure,
 * NOT BLOCKED); an absent/malformed build result ⇒ UNKNOWN + independentlyVerified:false (never fabricated as SUCCESS).
 */
function deriveNativeOutcome(buildOutcome: any, spec: any, strategy: any = "UNSPECIFIED", attempt: any = 1): any {
  const s = isObj(spec) ? spec : {};
  const name = String(s.name || "(native)").replace(/\s+/g, "-");
  const complexity = DP.assessComplexity(s).complexity;
  const strat = String(strategy || "UNSPECIFIED").toUpperCase();
  const missionId = `native:${name}`;
  const type = `native-build:${strat}:${complexity}`;
  if (!isObj(buildOutcome)) {
    return Object.freeze({ missionId, attempt, type, outcome: "UNKNOWN", independentlyVerified: false, evidence: "no canonical build result — not a measurable outcome (fail-closed; a claim is not a build)" });
  }
  const accepted = buildOutcome.accepted === true;
  if (accepted) {
    return Object.freeze({ missionId, attempt, type, outcome: "SUCCESS", independentlyVerified: true, evidence: `native ${strat} build of a ${complexity} project ACCEPTED by the independent verifier (built + passed the independent test)` });
  }
  // a genuine failure: the independent BUILD or the independent TEST failed. Both are independently determined, so the
  // FAILURE is verified — EXCEPT when no build was actually attempted (no build signal at all) ⇒ UNKNOWN, unverified.
  const buildAttempted = ("buildOk" in buildOutcome) || ("accepted" in buildOutcome) || ("verified" in buildOutcome);
  if (!buildAttempted) {
    return Object.freeze({ missionId, attempt, type, outcome: "UNKNOWN", independentlyVerified: false, evidence: "no build/verify signal — not a measurable outcome (fail-closed)" });
  }
  const why = buildOutcome.buildOk === true ? "built but FAILED the independent test" : "FAILED to build";
  return Object.freeze({ missionId, attempt, type, outcome: "FAILURE", independentlyVerified: true, evidence: `native ${strat} build of a ${complexity} project ${why} — recorded as a real FAILURE (no survivorship bias; the independent verifier decided)` });
}

/** recordNativeBuild(priorOutcomes, buildOutcome, spec, strategy, attempt) -> { ok, outcome, recorded, outcomes }. Composes
 *  deriveNativeOutcome + mission-outcome-ledger.recordOutcome (append-only, deduped by (missionId, attempt)). */
function recordNativeBuild(priorOutcomes: any, buildOutcome: any, spec: any, strategy: any = "UNSPECIFIED", attempt: any = 1): any {
  const entry = deriveNativeOutcome(buildOutcome, spec, strategy, attempt);
  const res = LEDGER.recordOutcome(priorOutcomes, entry);
  return Object.freeze({ ok: res.ok === true, outcome: entry.outcome, deduped: res.deduped === true, recorded: res.ok === true && res.deduped !== true, outcomes: res.outcomes });
}

/**
 * nativeReliabilityByClass(outcomes) -> { byClass: { "<STRATEGY>:<COMPLEXITY>": { attempts, successes, failures,
 * reliability } }, overall, note }. Measures REAL native-build reliability per complexity class × strategy from the
 * recorded outcomes — failure-inclusive, over VERIFIED outcomes only (classifyForCalibration). reliability is null when
 * there are no verified attempts in a class (never a fabricated 1.0 on zero data).
 */
function nativeReliabilityByClass(outcomes: any): any {
  const list = arr(outcomes).filter(isObj).filter((o) => String(o.type || "").startsWith("native-build:"));
  const byClass: any = {};
  let okAll = 0, failAll = 0;
  for (const o of list) {
    const key = String(o.type).slice("native-build:".length) || "UNSPECIFIED";
    const c = LEDGER.classifyForCalibration(o);
    if (c.counts !== "SUCCESS" && c.counts !== "FAILURE") continue;        // only VERIFIED outcomes count (censored otherwise)
    const b = (byClass[key] = byClass[key] || { attempts: 0, successes: 0, failures: 0 });
    b.attempts++; if (c.counts === "SUCCESS") { b.successes++; okAll++; } else { b.failures++; failAll++; }
  }
  for (const k of Object.keys(byClass)) { const b = byClass[k]; b.reliability = b.attempts ? Number((b.successes / b.attempts).toFixed(4)) : null; Object.freeze(b); }
  const totalVerified = okAll + failAll;
  return Object.freeze({
    byClass: Object.freeze(byClass),
    overall: Object.freeze({ verifiedAttempts: totalVerified, successes: okAll, failures: failAll, reliability: totalVerified ? Number((okAll / totalVerified).toFixed(4)) : null }),
    note: totalVerified ? `native-build reliability measured over ${totalVerified} VERIFIED attempts (${failAll} failures included — no survivorship bias)` : "no verified native-build attempts yet — reliability NOT measurable (not fabricated as 1.0)",
  });
}

const NATIVE_BUILD_OUTCOME_CONTRACT = Object.freeze({
  id: "V124-NATIVE-BUILD-OUTCOME",
  source: "CTO V38 LOT G — raccorder the native self-engineering loop into the honest outcome-ledger/calibration stack",
  reuses: Object.freeze(["decomposition-planner (assessComplexity — the complexity class)", "native-project-builder (the build result it consumes; the INDEPENDENT verifier already decided acceptance)", "mission-outcome-ledger (recordOutcome / classifyForCalibration — append-only, verified-only calibration)"]),
  notAuthority: "derives + records a native-build outcome and measures reliability; it builds nothing, verifies nothing anew, and authorizes nothing — acceptance was already decided by the independent verifier",
  invariants: Object.freeze([
    "a native build is recorded as SUCCESS *and* FAILURE (the V36 lesson — no survivorship bias); a build/verify failure is a real FAILURE, not BLOCKED",
    "accepted===true ⇒ SUCCESS + independentlyVerified (the independent verifier decided); a genuine build/verify failure is also independently determined ⇒ verified FAILURE",
    "an absent/malformed build result ⇒ UNKNOWN + unverified (never fabricated as SUCCESS) — censored from calibration",
    "reliability is measured per complexity class × strategy over VERIFIED outcomes only; zero verified attempts ⇒ null (never a fabricated 1.0)",
    "pure/deterministic; records via the existing ledger (append-only, deduped) — no second ledger",
  ]),
});

module.exports = { deriveNativeOutcome, recordNativeBuild, nativeReliabilityByClass, NATIVE_BUILD_OUTCOME_CONTRACT };

if (require.main === module) {
  const spec = { name: "symbol detector", architecture: [{ path: "src/d.js", role: "analyze code symbols", contract: "parse references" }] };
  let s = recordNativeBuild([], { accepted: true, buildOk: true, verified: true }, spec, "DECOMPOSED");
  s = recordNativeBuild(s.outcomes, { accepted: false, buildOk: true, verified: false }, { name: "calc", architecture: [{ path: "a.js" }, { path: "b.js", dependsOn: ["a.js"] }] }, "MONOLITHIC", 1);
  const rel = nativeReliabilityByClass(s.outcomes);
  process.stdout.write(JSON.stringify({ ...NATIVE_BUILD_OUTCOME_CONTRACT, demo: { recorded: s.outcomes.length, byClass: rel.byClass, overall: rel.overall } }, null, 2) + "\n");
}

export {};
