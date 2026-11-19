#!/usr/bin/env node
"use strict";
/* Tests for odg-autonomy-maturity-report (raccords the maturity trichotomy to the mission-ledger). PURE.
   Composes the REAL autonomy-program-aggregate + odg-autonomy-maturity-trichotomy — no mocks. */
const M = require("./odg-autonomy-maturity-report.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  // ledger WITH execution actors ⇒ native/assisted/escalated are measurable
  const withActors = { entries: [
    { mission: "a", state: "ARCHIVED", actor: "ODG", validated: true, recordedAt: "2026-01-02" },
    { mission: "a", state: "PLANNED", recordedAt: "2026-01-01" },               // older ⇒ deduped out (latest-per-mission)
    { mission: "b", state: "ARCHIVED", actor: "ODG", validated: true, recordedAt: "2026-01-01" },
    { mission: "c", state: "ARCHIVED", actor: "TECHNICAL_PROVIDER", validated: true, recordedAt: "2026-01-01" },
    { mission: "d", state: "OWNER_GATED", actor: "ODG", validated: true, recordedAt: "2026-01-01" },
    { mission: "e", state: "ARCHIVED", recordedAt: "2026-01-01" },              // no actor ⇒ NOT_MEASURABLE
  ] };
  const r = M.reportMaturityFromLedger(withActors);
  check("distinct missions = 5 (latest-per-mission dedup applied)", r.distinctMissions === 5);
  check("attribution coverage = 4/5 = 0.8", r.attribution.withExecutionActor === 4 && r.attribution.actorCoverageRate === 0.8);
  check("nativeAutonomyMeasurable true when an actor is present", r.nativeAutonomyMeasurable === true);
  check("buckets: 2 native (ODG+validated), 1 assisted (provider), 1 escalated (OWNER_GATED overrides)", r.maturity.buckets.NATIVE_DEMONSTRATED.count === 2 && r.maturity.buckets.ASSISTED.count === 1 && r.maturity.buckets.ESCALATED.count === 1);
  check("the actor-less mission ⇒ NOT_MEASURABLE (never inferred native)", r.maturity.notMeasurable.count === 1 && r.maturity.measuredDenominator === 4);

  // HONEST LIMIT: a ledger with NO execution actor ⇒ native autonomy NON-MEASURABLE (the real-world case)
  const noActor = { entries: [
    { mission: "x", state: "ARCHIVED", validated: true, proven: true, recordedAt: "2026-01-01" },
    { mission: "y", state: "VERIFIED", validated: true, proven: true, recordedAt: "2026-01-01" },
  ] };
  const n = M.reportMaturityFromLedger(noActor);
  check("no actor anywhere ⇒ nativeAutonomyMeasurable false, coverage 0", n.nativeAutonomyMeasurable === false && n.attribution.actorCoverageRate === 0 && n.attribution.withExecutionActor === 0);
  check("validated/proven present but NOT counted as native (all NOT_MEASURABLE, measured 0)", n.maturity.notMeasurable.count === 2 && n.maturity.measuredDenominator === 0 && n.maturity.buckets.NATIVE_DEMONSTRATED.count === 0);
  check("note surfaces the limit (no execution ACTOR; validation ≠ native autonomy)", /NON-MEASURABLE/.test(n.note) && /validation ≠ demonstrated native autonomy/.test(n.note));

  // escalation read from an explicit gate state even without an actor
  const esc = M.reportMaturityFromLedger({ entries: [{ mission: "g", state: "SIGN_OFF_GATED", recordedAt: "2026-01-01" }] });
  check("owner-gate state ⇒ ESCALATED (even without an actor)", esc.maturity.buckets.ESCALATED.count === 1);

  // mapLedgerEntry mapping
  const m1 = M.mapLedgerEntry({ mission: "z", state: "ARCHIVED", actor: "ODG", validated: true });
  check("mapLedgerEntry: validated ⇒ evidence REAL, actor passed through", m1.evidence === "REAL" && m1.actor === "ODG" && m1.id === "z");
  check("mapLedgerEntry: no validated/proven ⇒ no evidence", M.mapLedgerEntry({ mission: "z", state: "ARCHIVED" }).evidence === undefined);

  // accepts array ledger and the {entries} form; entries without a string mission id are dropped
  check("array ledger form accepted", M.reportMaturityFromLedger([{ mission: "a", state: "ARCHIVED", actor: "ODG", validated: true, recordedAt: "2026-01-01" }]).distinctMissions === 1);
  check("entry without string mission id ⇒ not a distinct mission", M.reportMaturityFromLedger({ entries: [{ state: "ARCHIVED", actor: "ODG" }] }).distinctMissions === 0);

  // fail-closed
  check("null/garbage ledger ⇒ ok, 0 distinct (no throw)", M.reportMaturityFromLedger(null).ok === true && M.reportMaturityFromLedger(null).distinctMissions === 0 && M.reportMaturityFromLedger(42).distinctMissions === 0);

  // honesty + determinism + frozen + contract
  check("note (measurable case): three distinct denominators, no blended score", /three distinct denominators, no blended score/.test(r.note));
  check("deterministic", JSON.stringify(M.reportMaturityFromLedger(withActors)) === JSON.stringify(r));
  check("frozen (report, attribution)", Object.isFrozen(r) && Object.isFrozen(r.attribution));
  check("contract: read-only, validation≠native, coverage-explicit, gate⇒escalated, composes",
    M.AUTONOMY_MATURITY_REPORT_CONTRACT.invariants.some((s: string) => /read-only over the ledger/.test(s)) &&
    M.AUTONOMY_MATURITY_REPORT_CONTRACT.invariants.some((s: string) => /validation ≠ demonstrated native autonomy/.test(s)) &&
    M.AUTONOMY_MATURITY_REPORT_CONTRACT.invariants.some((s: string) => /actor-attribution COVERAGE is reported explicitly/.test(s)) &&
    M.AUTONOMY_MATURITY_REPORT_CONTRACT.invariants.some((s: string) => /composes latestPerMission \+ aggregateMaturity/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-autonomy-maturity-report (raccords trichotomy to the mission-ledger over REAL autonomy-program-aggregate.latestPerMission + aggregateMaturity: with actors ⇒ measurable [coverage 0.8, 2 native/1 assisted/1 escalated/1 NOT_MEASURABLE, latest-per-mission dedup]; NO actor ⇒ nativeAutonomyMeasurable FALSE [validated/proven ≠ native autonomy, all NOT_MEASURABLE] — the HONEST real-ledger case surfaced not masked; gate state ⇒ ESCALATED w/o actor; array+entries forms; null/garbage fail-closed; read-only; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
