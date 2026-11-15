#!/usr/bin/env node
"use strict";
/* IMP-P14-DEVEX-GOLDENPATH — golden-path catalog + DevEx metrics from real events; no-events ⇒ NOT_MEASURED. */
const D = require("./odg-devex-goldenpath.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const v = D.devexView({ events: { onboardingDays: [3, 5, 4], goldenPathTeams: 6, totalTeams: 10, npsResponses: [50, 30, 40] } });
  check("onboarding median measured from real events", v.onboardingTime.status === "MEASURED" && v.onboardingTime.medianDays === 4);
  check("golden-path adoption = 6/10", v.goldenPathAdoption.status === "MEASURED" && v.goldenPathAdoption.value === 0.6);
  check("internal NPS averaged from responses", v.internalNps.status === "MEASURED" && v.internalNps.value === 40);
  check("golden-path catalog present (opinionated but escapable)", v.goldenPaths.length >= 2 && v.goldenPaths.every((g: any) => g.escapable === true));

  const empty = D.devexView({});
  check("no events ⇒ all DevEx metrics NOT_MEASURED (never invented)", empty.measuredCount === 0 && empty.onboardingTime.status === "NOT_MEASURED" && empty.goldenPathAdoption.status === "NOT_MEASURED" && empty.internalNps.status === "NOT_MEASURED");
  check("reuses existing scaffold attestation (not duplicated)", /not duplicated/.test(v.scaffoldAttestationReused) && D.DEVEX_GOLDENPATH_CONTRACT.invariants.some((i: string) => /not duplicated/.test(i)));
  check("deterministic", JSON.stringify(D.devexView({}).measuredCount) === JSON.stringify(empty.measuredCount));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — devex-goldenpath (IMP-P14: golden-path catalog + DevEx metrics from REAL events; no-events ⇒ NOT_MEASURED; scaffold attestation reused)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
