#!/usr/bin/env node
"use strict";

const BL = require("./metier-baseline");
const M = require("./metier-benchmark-multidim");

let failures = 0;
function check(c: any, label: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + label + "\n"); } }

// roster is the full 15.
check(BL.ROSTER_15.length === 15 && BL.ROSTER_15[0] === "P1" && BL.ROSTER_15[14] === "P15", "roster is P1..P15 (15 métiers)");

// real rollup over the live multidimensional benchmark.
const live = BL.baseline({ multidim: M.runMultidim() });
check(live.summary.roster === 15, "baseline: covers the full roster of 15");
check(live.summary.benchmarked === 15, "baseline: all 15 métiers benchmarked by the live multidim probes (parity gap closed)");
check(live.summary.notBenchmarked === 0, "baseline: 0 métiers NOT_BENCHMARKED — full coverage");
check(live.gaps.filter((g: any) => g.gap === "NOT_BENCHMARKED").length === 0, "baseline: no NOT_BENCHMARKED gap remains (P5/P10/P11/P13/P14 now covered via their real capabilities)");
const nb = live.perMetier.filter((p: any) => !p.benchmarked).map((p: any) => p.metier).sort();
check(JSON.stringify(nb) === JSON.stringify([]), "baseline: every roster métier is benchmarked (no uncovered métier)");

// a NOT_BENCHMARKED métier is never 'effective'.
check(live.perMetier.filter((p: any) => !p.benchmarked).every((p: any) => p.effective === false), "NOT_BENCHMARKED métier is never effective");

// fail-closed: a métier that fails SPECIFICITY (block-everything) is a GAP, not a pass.
const synthetic = { results: [
  { metier: "P1", detected: true, specific: true, robust: true, effective: true, reproducible: true },
  { metier: "P2", detected: true, specific: false, robust: true, effective: false, reproducible: true }, // block-everything
] };
const r = BL.baseline({ multidim: synthetic, expectedMetiers: ["P1", "P2"] });
check(r.summary.effective === 1, "fail-closed: only the truly effective métier counts as effective");
check(r.gaps.some((g: any) => g.metier === "P2" && /SPECIFICITY/.test(g.detail)), "fail-closed: P2 (fails specificity) flagged as a DIMENSION_FAIL gap");
const p2 = r.perMetier.find((p: any) => p.metier === "P2");
check(p2 && p2.effective === false && p2.maturity !== "L3_VALIDATED", "fail-closed: block-everything guard is NOT L3_VALIDATED");

// honest maturity: effective+reproducible ⇒ L3; detected-only ⇒ not L3.
const p1 = r.perMetier.find((p: any) => p.metier === "P1");
check(p1 && p1.maturity === "L3_VALIDATED", "honest maturity: effective+reproducible ⇒ L3_VALIDATED");

// contract invariants.
check(/NOT_BENCHMARKED/i.test(JSON.stringify(BL.METIER_BASELINE_CONTRACT.invariants)), "contract: NOT_BENCHMARKED is a gap");
check(/READ-ONLY|does NOT modify any métier/i.test(JSON.stringify(BL.METIER_BASELINE_CONTRACT.invariants)), "contract: read-only, no métier logic rewrite");

if (failures === 0) process.stdout.write("ALL PASS — V5 M-CH2-01 MÉTIER BASELINE\n");
process.exit(failures === 0 ? 0 : 1);

export {};
