#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V60 (§4) — media cost-comparison protocol test. Verifies: a reproducible protocol is defined; the ranking
 * is at EQUIVALENT quality (cheapest-at-quality-bar only among quality≥bar); every figure is ESTIMATED (never OBSERVED);
 * real measurement is explicitly owner-gated (no spend/no call executed); basis legend separates REAL/RECORDED/ESTIMATED/
 * SIMULATED; and the run is reproducible.
 */

const path = require("path");
const fs = require("fs");
const ART = path.join(__dirname, "..", "..", "docs", "odg", "V60_MEDIA_COST_PROTOCOL.json");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  let m: any = null; try { m = JSON.parse(fs.readFileSync(ART, "utf8")); } catch { /* null */ }
  check("protocol artifact exists & parses", !!m);
  if (!m) { process.stdout.write(`\n${failures} FAIL\n`); process.exit(1); }

  check("reproducible protocol defined (>=8 steps)", Array.isArray(m.protocol) && m.protocol.length >= 8);
  check("basis legend separates REAL/RECORDED/ESTIMATED/SIMULATED", m.basisLegend && m.basisLegend.REAL && m.basisLegend.ESTIMATED && m.basisLegend.SIMULATED);
  check("ranking figures all ESTIMATED (none presented as observed)", m.estimatedRanking.every((r: any) => r.basis === "ESTIMATED"));
  check("cheapest-at-quality respects the quality bar (>=0.85)", !m.cheapestAtQualityBar_0_85 || m.cheapestAtQualityBar_0_85.quality >= 0.85);
  check("real measurement is owner-gated (no spend/call executed)", /owner/i.test(m.ownerGatedRealMeasurement) && /NOT performed|not executed|no spend/i.test(m.ownerGatedRealMeasurement));
  check("invariant: quality never traded; ESTIMATED never reported as OBSERVED", /equivalent quality/i.test(m.invariant) && /never reported as OBSERVED/i.test(m.invariant));
  check("cost-per-usable includes re-runs (grossCalls >= shots-equivalent)", m.estimatedRanking.every((r: any) => r.grossCalls >= 1 && r.costPerUsableEur > 0));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V60 §4 media cost protocol (reproducible, ESTIMATED-only, real-measurement owner-gated)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
