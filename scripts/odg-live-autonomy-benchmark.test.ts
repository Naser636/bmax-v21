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

console.log(`\nLIVE AUTONOMY BENCHMARK — ${passed} assertions passed.`);
export {};
