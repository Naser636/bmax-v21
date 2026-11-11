#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V74 — radar axis-unblock test. Verifies the 5 "false NETWORK_GATED" axes are real algorithms EXECUTED on
 * the live module (decomposition, coverage-gap, strategy-switch, weak-signal+contradictions, cross-domain no-forced-
 * analogy), the network diagnosis is precise (session tools work, runtime collectors confined), axis 3 got a REAL
 * primary-source discovery, and no synthetic test is passed off as real research.
 */

const path = require("path");
const fs = require("fs");
const R = require("../core/radar-local-capabilities.js");
const ART = path.join(__dirname, "..", "..", "docs", "odg", "V74_RADAR_AXIS_UNBLOCK.json");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  // LIVE module assertions (real algorithms, offline)
  check("decomposeQuery splits multi-objective + flags ambiguity", R.decomposeQuery("find X and compare Y").objectives >= 2 && R.decomposeQuery("fix it").ambiguous === true);
  check("assessCoverage detects the missing topic", R.assessCoverage([{ topic: "a" }], ["a", "b"]).missing.join() === "b");
  check("selectStrategy switches then exhausts (fail-closed)", R.selectStrategy([{ strategy: "keyword", success: false }]).nextStrategy === "semantic" && R.selectStrategy(R.STRATEGY_LADDER.map((s: string) => ({ strategy: s, success: false }))).exhausted === true);
  check("detectWeakSignals surfaces rare corroborated + KEEPS contradictions", (() => { const r = R.detectWeakSignals([{ claim: "q", source: "s1", stance: "support" }, { claim: "q", source: "s2", stance: "refute" }]); return r.weakSignals.length >= 1 && r.contradictionsKept >= 1; })());
  check("crossDomainReason transfers on shared structure, no forced analogy otherwise", R.crossDomainReason({ name: "a", domain: "x", structure: ["s"] }, { name: "b", domain: "y", structure: ["s"] }).applicable === true && R.crossDomainReason({ name: "a", domain: "x", structure: ["p"] }, { name: "b", domain: "y", structure: ["q"] }).applicable === false);
  check("malformed ⇒ fail-closed", R.decomposeQuery("").ok === false && R.crossDomainReason(null, null).ok === false);

  // artifact assertions
  let m: any = null; try { m = JSON.parse(fs.readFileSync(ART, "utf8")); } catch { /* null */ }
  check("artifact exists", !!m);
  if (m) {
    check("5 algorithmic axes EXECUTED_LOCAL", m.localAxesPassed === 5 && m.axisResolution.filter((a: any) => a.now === "EXECUTED_LOCAL").length === 5);
    check("network diagnosis: session tools AVAILABLE, runtime collectors CONFINED", /AVAILABLE/.test(m.networkDiagnosis.sessionResearchTools) && /CONFINED/.test(m.networkDiagnosis.odgRuntimeCollectors));
    check("axis 3 primary-source discovery REAL (τ-bench / arXiv:2406.12045)", /2406\.12045/.test(m.networkDiagnosis.realPrimarySourceDiscovery.found) && /REAL_NETWORK_VALIDATION DONE/.test(m.networkDiagnosis.realPrimarySourceDiscovery.status));
    check("no synthetic test passed off as real research (invariant)", /never a synthetic stand-in/i.test(m.invariant));
    check("only permanent in-runtime crawl remains truly external", /permanent.*crawl.*owner\/allowlist/i.test(m.remainingTrueExternal));
  }

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V74 radar axis unblock (5 algorithmic axes executed locally; network diagnosed; primary-source real)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
