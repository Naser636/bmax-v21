#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V73 — cost-instrumentation + 15-axis radar benchmark test. Lot A: resource-meter yields OBSERVED
 * wall/cpu/memory and keeps tokens/monetary NOT_MEASURED (never fabricated). Lot B: the 15-axis suite executes the
 * locally-runnable axes (all PASS) and honestly marks network-gated axes DESIGNED; world-superiority fail-closed.
 */

const path = require("path");
const fs = require("fs");
const RM = require("../core/resource-meter.js");
const D = path.join(__dirname, "..", "..", "docs", "odg");
function j(f: string): any { try { return JSON.parse(fs.readFileSync(path.join(D, f), "utf8")); } catch { return null; } }

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  // Lot A — resource meter (live)
  const m = RM.meter(() => { let x = 0; for (let i = 0; i < 1e5; i++) x += i; return x; });
  check("A: meter runs + returns a result", m.ok === true && typeof m.result === "number");
  check("A: wall/cpu/memory OBSERVED", m.resources.wallMs.basis === "OBSERVED" && m.resources.cpuUserMs.basis === "OBSERVED" && m.resources.rssBytes.basis === "OBSERVED");
  check("A: tokens/monetary NOT_MEASURED (never fabricated)", m.resources.tokens.basis === "NOT_MEASURED" && m.resources.monetaryEur.basis === "NOT_MEASURED" && m.resources.monetaryEur.value === null);
  const run = j("V73_COST_INSTRUMENTATION.json");
  check("A: instrumentation run exists + lifts duration NOT_MEASURED→OBSERVED", !!run && run.observed.wallMs.basis === "OBSERVED" && /NOT_MEASURED → OBSERVED/.test(run.liftsNotMeasured));
  check("A: compute-cost tokens/€ stays NOT_MEASURED in the run", !!run && run.notMeasured.tokens.basis === "NOT_MEASURED" && run.notMeasured.monetaryEur.basis === "NOT_MEASURED");

  // Lot B — 15-axis radar benchmark
  const b = j("V73_RADAR_BENCHMARK_15AXIS.json");
  check("B: 15 axes", !!b && b.axisCount === 15 && b.axes.length === 15);
  check("B: locally-executable axes all PASS", !!b && b.passedLocal === b.executableLocally && b.executableLocally >= 6);
  check("B: network-gated axes honestly DESIGNED (not faked executed)", !!b && b.designedNetworkGated >= 1 && b.axes.filter((a: any) => !a.executableLocally).every((a: any) => /DESIGNED|NETWORK_GATED/.test(a.status) && a.result === null));
  check("B: prompt-injection axis PASS (QUARANTINE)", !!b && b.axes.find((a: any) => a.axis === 9).result === true);
  check("B: non-binary source eval axis PASS", !!b && b.axes.find((a: any) => a.axis === 6).result === true);
  check("B: world-superiority FAIL-CLOSED (no external comparison)", !!b && /NOT DEMONSTRATED/i.test(b.superiorityVsWorld));
  check("B: invariant — network-gated never reported as executed", !!b && /never reported as executed/i.test(b.invariant));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V73 cost instrumentation (OBSERVED, tokens NOT_MEASURED) + 15-axis radar benchmark (8 run, 7 designed, superiority fail-closed)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
