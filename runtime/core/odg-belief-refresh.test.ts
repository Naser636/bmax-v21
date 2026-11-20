#!/usr/bin/env node
"use strict";
/* Tests for odg-belief-refresh (V327 §4/§5 anti self-reinforcing error). A calibrated belief is trusted only while FRESH;
 * stale ⇒ RE_PROBE (overturn-able); not-calibrated ⇒ PROBE. Deterministic. */
const M = require("./odg-belief-refresh.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  // fresh calibrated-low ⇒ TRUST_LOW (act, e.g. escalate), not overturnable now
  check("fresh CALIBRATED low ⇒ TRUST_LOW", (() => { const r = M.classifyBelief({ quality: "CALIBRATED", pForPlanner: 0.2, evidenceAgeDays: 10, maxAgeDays: 90 }); return r.action === "TRUST_LOW" && r.overturnable === false; })());
  // STALE calibrated-low ⇒ RE_PROBE_STALE (the anti self-reinforcing-error guard), overturn-able
  check("STALE CALIBRATED low ⇒ RE_PROBE_STALE (overturn-able, never permanent avoidance)", (() => { const r = M.classifyBelief({ quality: "CALIBRATED", pForPlanner: 0.2, evidenceAgeDays: 120, maxAgeDays: 90 }); return r.action === "RE_PROBE_STALE" && r.overturnable === true && /self-reinforcing error/.test(r.reason); })());
  // fresh calibrated-high ⇒ TRUST_HIGH
  check("fresh CALIBRATED high ⇒ TRUST_HIGH", M.classifyBelief({ quality: "CALIBRATED", pForPlanner: 0.9, evidenceAgeDays: 5 }).action === "TRUST_HIGH");
  // not calibrated ⇒ PROBE regardless of p
  check("not CALIBRATED ⇒ PROBE (no settled belief)", M.classifyBelief({ quality: "DEGRADED", pForPlanner: 0.2 }).action === "PROBE" && M.classifyBelief({ quality: "BIASED", pForPlanner: 1 }).action === "PROBE");
  // no age supplied ⇒ treated as fresh (backward-compatible) — a low belief TRUSTs
  check("no age ⇒ fresh (backward-compatible): calibrated-low ⇒ TRUST_LOW", M.classifyBelief({ quality: "CALIBRATED", pForPlanner: 0.2 }).action === "TRUST_LOW");
  // threshold boundary: exactly lowThreshold ⇒ not low (TRUST_HIGH)
  check("p == lowThreshold ⇒ TRUST_HIGH (not low)", M.classifyBelief({ quality: "CALIBRATED", pForPlanner: 0.5, evidenceAgeDays: 1 }).action === "TRUST_HIGH");

  // frozen + contract cites the world reference + guard
  check("frozen", Object.isFrozen(M.classifyBelief({ quality: "CALIBRATED", pForPlanner: 0.2 })));
  check("contract cites Reflexion + self-reinforcing-error guard; composes calibration staleness",
    M.BELIEF_REFRESH_CONTRACT.reference.some((s: string) => /Reflexion/.test(s)) &&
    M.BELIEF_REFRESH_CONTRACT.reference.some((s: string) => /self-reinforcing error/.test(s)) &&
    M.BELIEF_REFRESH_CONTRACT.invariants.some((s: string) => /TRUSTED only while FRESH/.test(s)) &&
    M.BELIEF_REFRESH_CONTRACT.reference.some((s: string) => /calibration.ts staleness/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-belief-refresh (V327 §4/§5 anti self-reinforcing error: fresh CALIBRATED-low⇒TRUST_LOW, STALE⇒RE_PROBE_STALE [overturn-able], high⇒TRUST_HIGH, not-calibrated⇒PROBE; no-age⇒fresh backward-compatible; composes calibration staleness; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
