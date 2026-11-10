#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V38 LOT I — NATIVE ENGINEERING CYCLE (capstone raccordement). PURE, deterministic, fail-closed. It builds NO
 * new capability — it WIRES the native self-engineering lots into ONE governed loop, the native-engineering analogue of
 * V37's intelligence-loop:
 *   READINESS (H) → ROUTE (native vs provider) → [if native] STRATEGY (F) → BUILD (native-project-builder seam, the
 *   INDEPENDENT verifier arbitrates) → RECORD outcome (G, failure-inclusive) → RE-MEASURE reliability (G).
 *
 * It resolves the real bootstrap tension honestly: the readiness gate (H) DEFERS to the provider until a class has EARNED
 * demonstrated reliability — so evidence can only be gathered in an explicit, EXTERNALLY-authorized EXPLORE mode (never
 * self-authorized; discovery ≠ authorization). In the default GOVERNED mode an un-ready class routes to the provider and
 * no native build is attempted. A native build, when attempted, is still accepted ONLY by the independent verifier. The
 * cycle authorizes nothing and claims no capability it has not earned. Dual export.
 */

const DP = require("./decomposition-planner.js");
const READY = require("./native-engineering-readiness.js");
const NBO = require("./native-build-outcome.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function fn(v: any): boolean { return typeof v === "function"; }

/**
 * runNativeCycle(spec, priorOutcomes, deps, opts) -> { attempted, routedTo, verdict, strategy, buildAccepted, outcome,
 * reliabilityAfter, outcomes, trace }. deps: { build(specWithArch) -> buildOutcome } (the native-project-builder seam).
 * opts: { mode?: "governed"|"explore", exploreAuthorized?: boolean, reliabilityThreshold?, attempt? }.
 * FAIL-CLOSED: GOVERNED + not ATTEMPT_NATIVE ⇒ route to PROVIDER (no native build). EXPLORE requires an EXTERNAL
 * authorization (exploreAuthorized===true); without it, exploration is refused and the cycle defers (no self-authorization).
 */
async function runNativeCycle(spec: any, priorOutcomes: any, deps: any = {}, opts: any = {}): Promise<any> {
  const o = isObj(opts) ? opts : {};
  const mode = o.mode === "explore" ? "explore" : "governed";
  const trace: any[] = [];

  // 1) READINESS (H)
  const readiness = READY.assessReadiness(spec, priorOutcomes, { reliabilityThreshold: o.reliabilityThreshold });
  trace.push({ step: "READINESS", verdict: readiness.verdict, class: readiness.class, reliability: readiness.reliability });

  // 2) ROUTE — decide native vs provider (fail-closed)
  const demonstratedReady = readiness.verdict === "ATTEMPT_NATIVE";
  let willAttempt = demonstratedReady;
  let routeReason = "";
  if (!demonstratedReady) {
    if (mode === "explore") {
      if (o.exploreAuthorized === true) { willAttempt = true; routeReason = "EXPLORE mode (externally authorized) — attempt natively to GATHER evidence (not yet a trusted autonomous capability)"; }
      else { willAttempt = false; routeReason = "EXPLORE requested but NOT externally authorized — refused (discovery ≠ authorization; no self-authorization)"; }
    } else {
      willAttempt = false; routeReason = `GOVERNED mode and class not demonstrably ready (${readiness.verdict}) — route to the PROVIDER (last resort)`;
    }
  } else {
    routeReason = "class has EARNED demonstrated, calibrated reliability — attempt natively (the build is still independently verified)";
  }
  trace.push({ step: "ROUTE", routedTo: willAttempt ? "NATIVE" : "PROVIDER", mode, reason: routeReason });
  if (!willAttempt) {
    return Object.freeze({ attempted: false, routedTo: "PROVIDER", verdict: readiness.verdict, strategy: null, buildAccepted: null, outcome: null, reliabilityAfter: NBO.nativeReliabilityByClass(priorOutcomes), outcomes: priorOutcomes, reason: routeReason, trace: Object.freeze(trace), evidenceGathering: false });
  }

  // 3) STRATEGY (F)
  const strat = DP.chooseStrategy(spec);
  trace.push({ step: "STRATEGY", strategy: strat.strategy, files: (strat.architecture || []).length });

  // 4) BUILD (native-project-builder seam — the INDEPENDENT verifier arbitrates acceptance)
  const specWithArch = { ...(isObj(spec) ? spec : {}), architecture: strat.architecture, writeSet: (strat.architecture || []).map((a: any) => a.path) };
  let buildOutcome: any = null;
  if (fn(deps.build)) { try { buildOutcome = await deps.build(specWithArch); } catch { buildOutcome = null; } }
  trace.push({ step: "BUILD", accepted: buildOutcome && buildOutcome.accepted === true, hasResult: !!buildOutcome });

  // 5) RECORD outcome (G — failure-inclusive; an absent result ⇒ UNKNOWN, never fabricated SUCCESS)
  const attempt = Number.isFinite(Number(o.attempt)) ? Number(o.attempt) : 1;
  const rec = NBO.recordNativeBuild(priorOutcomes, buildOutcome, spec, strat.strategy, attempt);
  trace.push({ step: "RECORD", outcome: rec.outcome, recorded: rec.recorded });

  // 6) RE-MEASURE reliability (G)
  const reliabilityAfter = NBO.nativeReliabilityByClass(rec.outcomes);
  trace.push({ step: "RE-MEASURE", class: readiness.class, reliability: (reliabilityAfter.byClass[readiness.class] || {}).reliability ?? null });

  return Object.freeze({
    attempted: true, routedTo: "NATIVE", verdict: readiness.verdict, strategy: strat.strategy,
    buildAccepted: buildOutcome ? buildOutcome.accepted === true : null, outcome: rec.outcome,
    reliabilityAfter, outcomes: rec.outcomes,
    evidenceGathering: !demonstratedReady,   // honest: an explore attempt is evidence-gathering, not a trusted autonomous success
    reason: demonstratedReady ? "earned native attempt, independently verified, recorded, re-measured" : "authorized exploration — evidence gathered and recorded (capability not yet earned)",
    trace: Object.freeze(trace),
  });
}

const NATIVE_ENGINEERING_CYCLE_CONTRACT = Object.freeze({
  id: "V124-NATIVE-ENGINEERING-CYCLE",
  source: "CTO V38 LOT I — the end-to-end governed native self-engineering loop (capstone) wiring F+G+H+builder",
  reuses: Object.freeze(["native-engineering-readiness (H — route native vs provider)", "decomposition-planner (F — strategy)", "native-project-builder (the build seam; the INDEPENDENT verifier arbitrates)", "native-build-outcome (G — record + re-measure, failure-inclusive)"]),
  notAuthority: "threads the native lots through one loop; it builds no capability and authorizes nothing — exploration requires an EXTERNAL authorization and a native build is accepted only by the independent verifier",
  invariants: Object.freeze([
    "GOVERNED mode: a class not demonstrably ready routes to the PROVIDER (last resort) — no native build is attempted (fail-closed)",
    "evidence is gathered only in an explicit EXPLORE mode that requires an EXTERNAL authorization — never self-authorized (discovery ≠ authorization)",
    "an EXPLORE attempt is flagged evidenceGathering (not a trusted autonomous success); autonomy is EARNED only as recorded reliability becomes CALIBRATED",
    "a native build is accepted ONLY by the independent verifier; its outcome (SUCCESS or FAILURE) is recorded failure-inclusive, then reliability is re-measured",
    "any absent/failed step is handled fail-closed (an absent build result ⇒ UNKNOWN, never a fabricated SUCCESS); pure/deterministic",
  ]),
});

module.exports = { runNativeCycle, NATIVE_ENGINEERING_CYCLE_CONTRACT };

if (require.main === module) {
  const spec = { name: "calc", architecture: [{ path: "src/ops.js", role: "math", contract: "add", dependsOn: [] }, { path: "src/calc.js", role: "uses ops", contract: "ops.add", dependsOn: ["src/ops.js"] }], independentTest: (m: any) => typeof m["src/calc.js"] === "function" && m["src/calc.js"](2, 3) === 5 };
  // GOVERNED cold start ⇒ routes to the provider (no demonstrated readiness).
  (async () => {
    const governed = await runNativeCycle(spec, [], {}, {});
    process.stdout.write(JSON.stringify({ ...NATIVE_ENGINEERING_CYCLE_CONTRACT, demo: { coldStartRoutedTo: governed.routedTo, attempted: governed.attempted } }, null, 2) + "\n");
  })();
}

export {};
