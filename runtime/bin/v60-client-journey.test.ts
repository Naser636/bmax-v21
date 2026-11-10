#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V60 (§3) — client-journey simulation test. Verifies: the engine is deterministic (same input ⇒ identical
 * journey), fail-closed on malformed input, delegates cost to the canonical cost-engine, keeps every figure SIMULATED
 * (never observed/validated), penalises SLA-miss / unresolved incident in satisfaction, and the runner artifact holds
 * reproducible per-métier journeys. Positive + negative + regression.
 */

const path = require("path");
const fs = require("fs");
const CJ = require("../core/client-journey-sim.js");
const ART = path.join(__dirname, "..", "..", "docs", "odg", "V60_CLIENT_JOURNEY_SIM.json");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

const base = { metier: "P9", profile: { segment: "SaaS", size: "PME" }, need: { description: "FinOps" }, order: { units: 2, unitPriceEur: 5000 }, manualMinutesPerUnit: 1200, automatedMinutesPerUnit: 60, manualRateEurPerHour: 90, automatedCostPerUnitEur: 150, qualityScore: 0.9, slaDays: 20, incident: { severity: "NONE", resolvedWithinSla: true } };

function main(): void {
  // POSITIVE — a valid journey
  const j = CJ.simulateJourney(base);
  check("valid input ⇒ ok journey", j.ok === true && j.metier === "P9");
  check("savings = manual − automated (positive here)", j.savingsEur === Number((j.manualCostEur - j.automatedCostEur).toFixed(2)) && j.savingsEur > 0);
  check("every figure basis SIMULATED (never observed)", /SIMULATED/.test(j.basis) && /never a real sale or observed/i.test(j.basis));

  // DETERMINISM — same input ⇒ byte-identical journey
  check("deterministic (same input ⇒ identical journey)", JSON.stringify(CJ.simulateJourney(base)) === JSON.stringify(j));

  // NEGATIVE / fail-closed — malformed input
  check("malformed input ⇒ ok:false (fail-closed)", CJ.simulateJourney(null).ok === false && CJ.simulateJourney({ metier: "X" }).ok === false);

  // SATISFACTION penalties — SLA miss and unresolved incident reduce satisfaction
  const slaMiss = CJ.simulateJourney({ ...base, automatedMinutesPerUnit: 100000, slaDays: 1 });
  check("SLA miss penalises satisfaction", slaMiss.slaMet === false && slaMiss.satisfaction < base.qualityScore);
  const incident = CJ.simulateJourney({ ...base, incident: { severity: "HIGH", resolvedWithinSla: false } });
  check("unresolved HIGH incident penalises satisfaction", incident.satisfaction < base.qualityScore);

  // SCALE — linear, labelled synthetic
  const sc = CJ.scaleJourney(j, 10);
  check("scaleJourney ⇒ linear over N synthetic clients", sc.ok === true && sc.totalSavingsEur === Number((j.savingsEur * 10).toFixed(2)) && /SIMULATED/.test(sc.basis));

  // RUNNER ARTIFACT — reproducible per-métier journeys
  let art: any = null; try { art = JSON.parse(fs.readFileSync(ART, "utf8")); } catch { /* null */ }
  check("runner artifact exists & has journeys", !!art && Array.isArray(art.journeys) && art.journeys.length >= 4);
  check("artifact journeys all SIMULATED + ok", !!art && art.journeys.every((x: any) => x.journey.ok === true && /SIMULATED/.test(x.journey.basis)));
  check("artifact limits disclaim observed/validated savings", !!art && /never observed or client-validated/i.test(JSON.stringify(art.report.limits)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V60 client-journey simulation (deterministic, fail-closed, SIMULATED-only)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
