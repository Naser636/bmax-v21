#!/usr/bin/env node
"use strict";
/* V137 — 15-métier qualification REGRESSION. Re-derives the whole matrix from the REAL canonical métier modules (via the
 * runner's exported qualifyAll — not a stored flag) and locks that every métier P1..P15 is VALIDATED_LOCAL: its nominal
 * scenario is correct, its boundary scenario is handled, and its controlled-failure scenario is genuinely FAIL-CLOSED. A
 * regression in any métier module (nominal breakage OR a lost fail-closed guard) flips a scenario and fails this suite. */
const RUN = require("../bin/odg-v137-qualification-run.ts");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const { verdicts, summary } = RUN.qualifyAll();

  check("all 15 métiers present, none with a module/fn load error", verdicts.length === 15 && verdicts.every((v: any) => !v._loadError));
  check("every métier QUALIFIED + VALIDATED_LOCAL (nominal+boundary+failure all pass)", summary.total === 15 && summary.qualifiedCount === 15 && summary.byMaturity.VALIDATED_LOCAL === 15 && summary.allQualified === true);
  check("ZERO safety gaps (every controlled-failure scenario is genuinely fail-closed)", summary.safetyGaps.length === 0 && summary.byMaturity.NOT_FAIL_CLOSED === 0);

  // per-métier: the failure scenario MUST have passed (fail-closed) — the load-bearing safety assertion, checked individually.
  for (const v of verdicts) {
    check(`${v.metier}: nominal correct + boundary handled + failure FAIL-CLOSED`, v.scenarios.nominal.passed === true && v.scenarios.boundary.passed === true && v.scenarios.failure.passed === true);
  }

  // honesty: maturity is test-scoped — the matrix must never label a métier ACTIVE_IN_PRODUCTION.
  check("no métier labelled ACTIVE_IN_PRODUCTION (test-scoped maturity only)", verdicts.every((v: any) => v.maturity !== "ACTIVE_IN_PRODUCTION") && /VALIDATED_LOCAL ≠ ACTIVE_IN_PRODUCTION/.test(verdicts[0].note));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — V137: 15/15 métiers VALIDATED_LOCAL (nominal/boundary/controlled-failure, each fail-closed); maturity test-scoped (≠ production)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
