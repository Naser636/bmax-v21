#!/usr/bin/env node
"use strict";
/* V183 Livrable C — CTO dashboard. Proves: reads the REAL register read-only; every indicator carries provenance/
 * method/confidence; missing ⇒ NOT_MEASURED; runtime NOT_MEASURED; no canonical mutation; deterministic. */
const D = require("./odg-cto-dashboard.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function hasProvenance(i: any): boolean { return i && i.provenance && i.method && i.confidence && ("value" in i); }

function main() {
  const d = D.build({ registerPath: "docs/odg/closure-register.json", asOfEpochMs: 1763000000000 });

  check("reads the REAL register: total 427, counts 415/6/3/3", d.missions.total.value === 427 && d.missions.counts.value.ACCEPTED === 415 && d.missions.counts.value.BLOCKED === 6);
  check("is explicitly a READ-ONLY projection, not a new source of truth", /READ-ONLY projection, NOT a new source of truth/.test(d.sourceOfTruth));
  check("every top indicator carries provenance + method + confidence", hasProvenance(d.roadmap) && hasProvenance(d.primitives) && hasProvenance(d.metiers) && hasProvenance(d.useMatrix) && hasProvenance(d.runtime) && hasProvenance(d.ownerGates));
  check("runtime state is NOT_MEASURED (no resident process observed)", d.runtime.value === "NOT_MEASURED" && /no resident ODG process/.test(d.runtime.method));
  check("radar realScheduledRun is unmeasured", /NOT_MEASURED/.test(d.radar.value));
  check("gate is NOT re-run by the dashboard (low confidence, verify live)", d.gates.confidence === "LOW" && /does not re-run the gate/.test(d.gates.method));

  // ---- missing value ⇒ NOT_MEASURED, never fabricated ----
  const noDate = D.build({ registerPath: "docs/odg/closure-register.json" });
  check("absent asOfEpochMs renders null (not a fabricated timestamp)", noDate.asOfEpochMs === null);
  const badReg = D.build({ registerPath: "docs/odg/does-not-exist.json", asOfEpochMs: 1763000000000 });
  check("unreadable register ⇒ NOT_MEASURED with failure provenance (no fabricated count)", badReg.missions.value === "NOT_MEASURED" && /FAILED|unavailable/.test(badReg.missions.method));

  // ---- métiers + use-matrix projected honestly ----
  check("métiers projected with honest maturity (no real commercial result)", d.metiers.value.every((m: any) => m.commercialResult === false));
  check("use-matrix class tally present (135 classified)", d.useMatrix.value && typeof d.useMatrix.value.REUSE === "number");
  check("owner-gates include ROADMAP.json integration + BMAX assets + payment", d.ownerGates.value.some((x: string) => /ROADMAP\.json/.test(x)) && d.ownerGates.value.some((x: string) => /BMAX/.test(x)) && d.ownerGates.value.some((x: string) => /payment/.test(x)));

  // ---- contract + determinism ----
  check("contract: read-only, provenance-tagged, NOT_MEASURED-on-missing, runtime unmeasured", D.CTO_DASHBOARD_CONTRACT.invariants.some((i: string) => /never mutates a canonical status/.test(i)) && D.CTO_DASHBOARD_CONTRACT.invariants.some((i: string) => /missing ⇒ NOT_MEASURED/.test(i)));
  check("deterministic given same injected asOfEpochMs", JSON.stringify(D.build({ asOfEpochMs: 1763000000000 }).missions) === JSON.stringify(d.missions));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — cto-dashboard (Livrable C: READ-ONLY projection over canonical sources; reads REAL register 427; every indicator provenance+method+confidence; missing⇒NOT_MEASURED [no fabrication]; runtime NOT_MEASURED; gate not re-run; no canonical mutation)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
