#!/usr/bin/env node
// @ts-nocheck — L5 bulk test migration (runtime/core): runs under tsx unchanged; suppresses tsc
// typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.
"use strict";

/*
 * IMPROVEMENT BASELINE (§V S4) — hermetic unit proof. PURE: injected collectors, NO fs/clock/network.
 * Proves: baseline capture (fail-closed null on collector throw), signal-by-signal delta with correct
 * direction under per-signal SENSE (higher-is-better vs lower-is-better debt), non-numeric change
 * detection, and the §V S4→S2 bridge — a measured before≠after delta drives learning-chain to EFFECTIVE.
 *
 * Run: node runtime/core/improvement-baseline.test.js   (or via tsx under `npm test`)
 */

const path = require("path");
const REPO = process.cwd();
const { captureBaseline, measureDelta, DEFAULT_SENSE } = require(path.join(REPO, "runtime", "core", "improvement-baseline.js"));
const { classifyLearningState } = require(path.join(REPO, "runtime", "core", "learning-chain.js"));

let failures = 0;
const check = (c, l) => { if (c) console.log(`  PASS ${l}`); else { failures++; console.log(`  FAIL ${l}`); } };

console.log("IMPROVEMENT BASELINE (§V S4) — hermetic unit proof");

// (1) captureBaseline calls each collector; a throw ⇒ null (honest unmeasured, never fabricated 0)
const base = captureBaseline({ dualPorts: () => 76, jsRemaining: () => 90, boom: () => { throw new Error("x"); } });
check(base.signals.dualPorts === 76 && base.signals.jsRemaining === 90 && base.signals.boom === null, "capture: collectors read; a throwing collector ⇒ null (fail-closed)");

// (2) measureDelta direction honors SENSE: higher-is-better vs lower-is-better debt
const before = { signals: { dualPorts: 76, jsRemaining: 90, hazardBlocked: 7, passRate: 1.0 } };
const after = { signals: { dualPorts: 78, jsRemaining: 88, hazardBlocked: 8, passRate: 1.0 } };
const d = measureDelta(before, after, DEFAULT_SENSE);
check(d.metrics.dualPorts.delta === 2 && d.metrics.dualPorts.direction === "improved", "higher-is-better: dualPorts +2 ⇒ improved");
check(d.metrics.jsRemaining.delta === -2 && d.metrics.jsRemaining.direction === "improved", "lower-is-better: jsRemaining -2 ⇒ improved (debt reduced)");
check(d.metrics.hazardBlocked.delta === 1 && d.metrics.hazardBlocked.direction === "regressed", "lower-is-better: hazardBlocked +1 ⇒ regressed (debt grew)");
check(d.metrics.passRate.direction === "flat", "unchanged numeric ⇒ flat");
check(d.summary.improved === 2 && d.summary.regressed === 1 && d.summary.flat === 1, "summary tallies improved/regressed/flat");

// (3) unmeasured + non-numeric
const u = measureDelta({ signals: { a: null } }, { signals: { a: 5 } }, {});
check(u.metrics.a.direction === "unmeasured", "a null-on-one-side signal ⇒ unmeasured (never scored)");
const nn = measureDelta({ signals: { verdict: "NO_RECURRENCE" } }, { signals: { verdict: "FROZEN_LOOP" } }, {});
check(nn.metrics.verdict.changed === true && nn.metrics.verdict.direction === "changed", "non-numeric signal change detected");

// (4) §V S4→S2 BRIDGE: a measured delta drives a learning record to EFFECTIVE via learning-chain
const delta = measureDelta({ signals: { dualPorts: 73 } }, { signals: { dualPorts: 76 } }, DEFAULT_SENSE).metrics.dualPorts;
const record = {
  id: "finance-cluster",
  captured: { description: "FINANCE/§6B simulation cluster migration" },
  persisted: { commit: "0652292" },
  discoverable: { index: "roadmap §U-CHECKPOINT V64l" },
  reused: { refs: ["odg migrate-ts gate"] },
  effective: { metric: "dual ports", baseline: delta.before, after: delta.after },
};
const cls = classifyLearningState(record);
check(delta.direction === "improved" && cls.complete === true && cls.state === "EFFECTIVE", "S4→S2 bridge: a real improved delta (73→76) ⇒ learning-chain EFFECTIVE");
// and a FLAT delta must NOT reach EFFECTIVE (no fabricated effect)
const flatRec = { ...record, effective: { metric: "x", baseline: 76, after: 76 } };
check(classifyLearningState(flatRec).complete === false, "S4→S2 bridge: a flat delta ⇒ NOT EFFECTIVE (no fabricated effect)");

console.log(failures === 0 ? "ALL PASS — improvement-baseline (§V S4)" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
