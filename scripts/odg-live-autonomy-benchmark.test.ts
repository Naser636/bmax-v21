/*
 * odg-live-autonomy-benchmark.test.ts — deterministic unit tests for the LIVE autonomy-measurability
 * benchmark's PURE core (classifyPlan / oracleCheck / aggregate / provenance) + JS/TS dual-port parity.
 * Uses fixtures only (no mission-loader spawn) so it is fast and reproducible; the live driver (runLive) is
 * exercised by the operator/CLI, not here. REUSES the real measurer + oracle via the module under test.
 */
"use strict";
const assert = require("assert");
const path = require("path");
const B = require(path.resolve(__dirname, "odg-live-autonomy-benchmark.ts"));
const BJS = require(path.resolve(__dirname, "odg-live-autonomy-benchmark.js"));

let passed = 0;
function ok(name: string, cond: any) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const elig = (id: string, goal = "internal task") => ({ id, goal, authorization: { eligible: true, authorized: true } });
const excl = (id: string, goal: string, reason = "reserved/human-gated") => ({ id, goal, authorization: { excluded: true, reason } });
const undeclared = (id: string, goal = "ambiguous") => ({ id, goal });

// ---- 1. classifyPlan: a fully-declared eligible plan is MEASURABLE. -----------------------------
(function allEligible() {
  const c = B.classifyPlan([elig("a1"), elig("a2")]);
  ok("all-eligible ⇒ measurable", c.measurable === true);
  ok("all-eligible ⇒ eligible=2, excluded=0, undeclared=0", c.eligible === 2 && c.excluded === 0 && c.undeclared === 0);
  ok("all-eligible ⇒ no missing", c.missing.length === 0);
})();

// ---- 2. classifyPlan: an undeclared objective makes the plan NOT measurable (fail-closed). -------
(function withUndeclared() {
  const c = B.classifyPlan([elig("b1"), undeclared("b2")]);
  ok("undeclared objective ⇒ NOT measurable", c.measurable === false);
  ok("undeclared objective ⇒ reported in missing", c.missing.includes("b2"));
  ok("undeclared objective ⇒ undeclared=1", c.undeclared === 1);
})();

// ---- 3. classifyPlan: justified exclusion keeps the plan measurable; excluded never counts eligible. -
(function mixedExclusion() {
  const c = B.classifyPlan([elig("c1"), excl("c2", "deploy to production")]);
  ok("eligible + justified-exclusion ⇒ measurable", c.measurable === true);
  ok("excluded objective counted as excluded, not eligible", c.eligible === 1 && c.excluded === 1);
})();

// ---- 4. oracleCheck anti-inflation: an oracle-excluded objective stamped eligible is FLAGGED. ----
// Empty goal ⇒ declareAuthorization excludes it DETERMINISTICALLY (no classifier-text dependency).
(function antiInflationCatch() {
  const inflated = [{ id: "i1", goal: "", authorization: { eligible: true, authorized: true } }];
  const o = B.oracleCheck(inflated);
  ok("oracle catches inflation (empty-goal stamped eligible)", o.antiInflationOk === false && o.conflicts.length === 1);
})();

// ---- 5. oracleCheck: correctly-excluded objective raises NO conflict. ----------------------------
(function antiInflationClean() {
  const clean = [{ id: "i1", goal: "", authorization: { excluded: true, reason: "empty/absent goal" } }, elig("g1", "refactor an internal module")];
  const o = B.oracleCheck(clean);
  ok("no inflation conflict when exclusion is honest", o.antiInflationOk === true && o.conflicts.length === 0);
})();

// ---- 6. aggregate over mission rows. -------------------------------------------------------------
(function aggregateRows() {
  const rows = [
    B.rowFor("M_OK", [elig("a1"), elig("a2")]),
    B.rowFor("M_NOT", [elig("b1"), undeclared("b2")]),
    B.rowFor("M_RESERVED", [excl("d1", "deploy to production")]),
  ];
  const s = B.aggregate(rows);
  ok("aggregate counts measurable missions", s.total === 3 && s.measurable === 2 && s.notMeasurable === 1);
  // eligibleObjectives sums validly-eligible objectives across ALL rows (M_OK:2 + M_NOT.b1:1 + M_RESERVED:0),
  // independent of per-mission measurability; excludedObjectives = M_RESERVED.d1:1.
  ok("aggregate sums eligible/excluded objectives", s.eligibleObjectives === 3 && s.excludedObjectives === 1);
  ok("aggregate antiInflationOk true when no row conflicts", s.antiInflationOk === true);
})();

// ---- 7. provenance is deterministic and input-sensitive. -----------------------------------------
(function provenanceStable() {
  const rows1 = [B.rowFor("M", [elig("a1")])];
  const rows2 = [B.rowFor("M", [elig("a1")])];
  const rows3 = [B.rowFor("M", [elig("a1"), elig("a2")])];
  ok("provenance deterministic for identical input", B.provenance(rows1) === B.provenance(rows2));
  ok("provenance changes when classification changes", B.provenance(rows1) !== B.provenance(rows3));
  ok("provenance is a 16-hex digest", /^[0-9a-f]{16}$/.test(B.provenance(rows1)));
})();

// ---- 8. JS/TS dual-port parity on the pure core. -------------------------------------------------
(function dualPortParity() {
  const objs = [elig("a1"), excl("c2", "deploy to production"), undeclared("b2")];
  ok("classifyPlan parity (ts≡js)", JSON.stringify(B.classifyPlan(objs)) === JSON.stringify(BJS.classifyPlan(objs)));
  ok("oracleCheck parity (ts≡js)", JSON.stringify(B.oracleCheck([{ id: "x", goal: "", authorization: { eligible: true, authorized: true } }])) === JSON.stringify(BJS.oracleCheck([{ id: "x", goal: "", authorization: { eligible: true, authorized: true } }])));
  const rows = [B.rowFor("M", objs)];
  const rowsJs = [BJS.rowFor("M", objs)];
  ok("aggregate parity (ts≡js)", JSON.stringify(B.aggregate(rows)) === JSON.stringify(BJS.aggregate(rowsJs)));
  ok("provenance parity (ts≡js)", B.provenance(rows) === BJS.provenance(rowsJs));
  ok("MISSION_SET parity (ts≡js)", JSON.stringify(B.MISSION_SET) === JSON.stringify(BJS.MISSION_SET));
})();

// ================= EXECUTED-AUTONOMY LAYER =================
const vPlan = { mission: "M", objectives: [{ id: "o1" }, { id: "o2" }] };
const vExec = { mission: "M", executed: [{ objectiveId: "o1", status: "RECORDED" }, { objectiveId: "o2", status: "RECORDED" }] };
// Injected stub measurer so oracle-gating is tested WITHOUT coupling to buildAutonomyRate internals.
const stubRate = () => ({ measure: { measurable: true, denominator: 2, numerator: 1, categories: { ODG_EXECUTED_VERIFIED: 1, ODG_EXECUTED_UNVERIFIED: 0, OPERATOR_OR_EXTERNAL: 0, BLOCKED_REFUSED_FAILED: 0, HUMAN_MANDATORY: 0, NOT_EXECUTED: 1 } } });

// ---- 9. executedOracle flags cross-mission / orphan / duplicate; passes a clean pairing. ----------
(function executedOracleCases() {
  ok("clean pairing ⇒ oracle ok", B.executedOracle(vPlan, vExec).ok === true);
  ok("cross-mission ⇒ CROSS_MISSION conflict", B.executedOracle(vPlan, { mission: "OTHER", executed: [{ objectiveId: "o1" }] }).conflicts.some((c: any) => c.kind === "CROSS_MISSION"));
  ok("orphan evidence ⇒ ORPHAN_EVIDENCE conflict", B.executedOracle(vPlan, { mission: "M", executed: [{ objectiveId: "ZZZ" }] }).conflicts.some((c: any) => c.kind === "ORPHAN_EVIDENCE"));
  ok("duplicate evidence ⇒ DUPLICATE_EVIDENCE conflict", B.executedOracle(vPlan, { mission: "M", executed: [{ objectiveId: "o1" }, { objectiveId: "o1" }] }).conflicts.some((c: any) => c.kind === "DUPLICATE_EVIDENCE"));
  ok("unidentified mission ⇒ MISSION_UNIDENTIFIED conflict", B.executedOracle({ objectives: [{ id: "o1" }] }, { executed: [{ objectiveId: "o1" }] }).conflicts.some((c: any) => c.kind === "MISSION_UNIDENTIFIED"));
})();

// ---- 10. executedRow: oracle-fail EXCLUDES (measurer never consulted); oracle-ok measures. --------
(function executedRowGate() {
  const bad = B.executedRow("M", vPlan, { mission: "OTHER", executed: [{ objectiveId: "o1" }] }, { buildRate: stubRate });
  ok("oracle-fail ⇒ excluded, not measured", bad.excluded === true && bad.measurable === false && !bad.measure);
  const good = B.executedRow("M", vPlan, vExec, { buildRate: stubRate });
  ok("oracle-ok ⇒ measured via (stub) measurer", good.excluded === false && good.measurable === true && good.measure.numerator === 1);
})();

// ---- 11. executedBenchmark: justified denominator; excluded/notMeasurable published; null when 0. -
(function executedBenchmarkAgg() {
  const r = B.executedBenchmark([
    { mission: "M_OK", plan: vPlan, execution: vExec },
    { mission: "M_CROSS", plan: vPlan, execution: { mission: "OTHER", executed: [{ objectiveId: "o1" }] } },
  ], { buildRate: stubRate });
  ok("only oracle-clean+measurable counted", r.countedMissions === 1 && r.totalPairs === 2);
  ok("justified denominator/numerator/percent", r.denominator === 2 && r.numerator === 1 && r.executedAutonomyPercent === 50);
  ok("excluded pair published, not counted", r.excluded.length === 1 && r.excluded[0].mission === "M_CROSS");
  const empty = B.executedBenchmark([{ mission: "M_CROSS", plan: vPlan, execution: { mission: "OTHER", executed: [{ objectiveId: "o1" }] } }], { buildRate: stubRate });
  ok("zero justified denominator ⇒ executedAutonomyPercent null (never fabricated)", empty.denominator === 0 && empty.executedAutonomyPercent === null);
})();

// ---- 12. ANTI-FALSE-POSITIVE: a bad pairing can NEVER inflate executed autonomy even if the measurer
// would claim a high score — the oracle gate wins (fail-closed). ----------------------------------
(function antiFalsePositive() {
  const liar = () => ({ measure: { measurable: true, denominator: 5, numerator: 5, categories: { ODG_EXECUTED_VERIFIED: 5 } } });
  const r = B.executedBenchmark([{ mission: "M_CROSS", plan: vPlan, execution: { mission: "OTHER", executed: [{ objectiveId: "o1" }] } }], { buildRate: liar });
  ok("cross-mission excluded despite a measurer claiming 5/5", r.countedMissions === 0 && r.numerator === 0 && r.executedAutonomyPercent === null);
})();

// ---- 12b. HERMETIC CAPABILITY FIXTURE (NOT a real pipeline run): proves the executed-autonomy chain
// registers a GENUINE verified execution — i.e. the numerator is not stuck-at-0 by construction. Uses the
// REAL buildAutonomyRate (no stub). A properly-evidenced ODG execution (status EXECUTED, authoredBy
// ODG_CAPABILITY, appliedBy ODG_EXECUTOR, attribution verdict EVIDENCED, eligible+authorized) ⇒ 100%. This
// is a controlled capability demonstration, explicitly distinct from the §AA.4 real-pipeline runs. --------
(function hermeticVerifiedExecutionMovesNumerator() {
  const pair = {
    mission: "CAP_HERMETIC",
    plan: { mission: "CAP_HERMETIC", objectives: [{ id: "CAP1", goal: "hermetic verifiable action", authorization: { eligible: true, authorized: true } }] },
    execution: { mission: "CAP_HERMETIC", executed: [{ objectiveId: "CAP1", status: "EXECUTED", authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR" }] },
  };
  const attribution = { objectives: [{ objectiveId: "CAP1", verdict: "EVIDENCED" }] };
  const r = B.executedBenchmark([pair], { attribution }); // REAL buildAutonomyRate (no stub)
  ok("hermetic verified execution ⇒ oracle-clean + measurable (countedMissions 1)", r.countedMissions === 1);
  ok("hermetic verified execution ⇒ numerator 1 / denominator 1", r.numerator === 1 && r.denominator === 1);
  ok("hermetic verified execution ⇒ executedAutonomyPercent 100 (numerator CAN move; not stuck-at-0)", r.executedAutonomyPercent === 100);
  ok("hermetic verified execution ⇒ classified ODG_EXECUTED_VERIFIED", r.categories.ODG_EXECUTED_VERIFIED === 1);
  // Negative control: strip the EVIDENCED attribution ⇒ executed-but-UNVERIFIED, never the numerator.
  const rNoEvid = B.executedBenchmark([pair], {});
  ok("same execution without EVIDENCED attribution ⇒ NOT verified (0% numerator)", rNoEvid.numerator === 0 && rNoEvid.categories.ODG_EXECUTED_UNVERIFIED === 1);
})();

// ---- 13. JS/TS dual-port parity on the executed-autonomy layer. ----------------------------------
(function executedDualPort() {
  ok("executedOracle parity (ts≡js)", JSON.stringify(B.executedOracle(vPlan, vExec)) === JSON.stringify(BJS.executedOracle(vPlan, vExec)));
  const a = B.executedBenchmark([{ mission: "M", plan: vPlan, execution: vExec }], { buildRate: stubRate });
  const b = BJS.executedBenchmark([{ mission: "M", plan: vPlan, execution: vExec }], { buildRate: stubRate });
  ok("executedBenchmark parity (ts≡js)", JSON.stringify(a) === JSON.stringify(b));
})();

console.log(`\nLIVE AUTONOMY BENCHMARK — ${passed} assertions passed.`);
export {};
