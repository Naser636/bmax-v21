#!/usr/bin/env node
"use strict";
/* Tests for odg-autonomy-maturity-trichotomy (native/assisted/escalated maturity, 3 explicit denominators, no
   blended score). PURE. Composes the REAL autonomy-claim-guard (actor→claim) — no mocks. */
const M = require("./odg-autonomy-maturity-trichotomy.js");
const G = require("./autonomy-claim-guard.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const B = M.BUCKET;
const bucket = (m: any) => M.classifyMissionAutonomy(m).bucket;

function main(): void {
  // NATIVE_DEMONSTRATED requires ODG actor AND independent REAL evidence
  check("ODG + REAL evidence ⇒ NATIVE_DEMONSTRATED", bucket({ actor: "ODG", evidence: "REAL" }) === B.NATIVE_DEMONSTRATED);
  check("ODG + independentlyVerified ⇒ NATIVE_DEMONSTRATED", bucket({ actor: "ODG", independentlyVerified: true }) === B.NATIVE_DEMONSTRATED);
  // capability ≠ demonstrated autonomy: ODG claim WITHOUT real evidence is NOT native
  check("ODG + SIMULATED evidence ⇒ NOT_MEASURABLE (capability ≠ demonstrated)", bucket({ actor: "ODG", evidence: "SIMULATED" }) === B.NOT_MEASURABLE);
  check("ODG + DECLARED evidence ⇒ NOT_MEASURABLE", bucket({ actor: "ODG", evidence: "DECLARED" }) === B.NOT_MEASURABLE);
  check("ODG + NO evidence ⇒ NOT_MEASURABLE (not optimistically native)", bucket({ actor: "ODG" }) === B.NOT_MEASURABLE);

  // ASSISTED = provider or human execution
  check("TECHNICAL_PROVIDER ⇒ ASSISTED", bucket({ actor: "TECHNICAL_PROVIDER", evidence: "REAL" }) === B.ASSISTED);
  check("HUMAN ⇒ ASSISTED", bucket({ actor: "HUMAN" }) === B.ASSISTED);
  // unattributable ⇒ NOT_MEASURABLE (never inferred native)
  check("AUTOMATED_SYSTEM (UNATTRIBUTED) ⇒ NOT_MEASURABLE", bucket({ actor: "AUTOMATED_SYSTEM" }) === B.NOT_MEASURABLE);
  check("UNKNOWN actor ⇒ NOT_MEASURABLE", bucket({ actor: "UNKNOWN" }) === B.NOT_MEASURABLE);

  // ESCALATED overrides the actor (even ODG + REAL)
  check("escalated:true overrides ODG+REAL ⇒ ESCALATED", bucket({ actor: "ODG", evidence: "REAL", escalated: true }) === B.ESCALATED);
  check("ownerGated:true ⇒ ESCALATED", bucket({ actor: "ODG", evidence: "REAL", ownerGated: true }) === B.ESCALATED);
  check("status OWNER_GATED ⇒ ESCALATED", bucket({ actor: "ODG", evidence: "REAL", status: "OWNER_GATED" }) === B.ESCALATED);
  check("status DEFERRED_TO_OWNER ⇒ ESCALATED", bucket({ actor: "TECHNICAL_PROVIDER", status: "DEFERRED_TO_OWNER" }) === B.ESCALATED);

  // composition fidelity: the claim comes from the REAL autonomy-claim-guard
  check("claim reuses autonomy-claim-guard.honestClaimFor", M.classifyMissionAutonomy({ actor: "ODG", evidence: "REAL" }).claim === G.honestClaimFor("ODG") && M.classifyMissionAutonomy({ actor: "TECHNICAL_PROVIDER" }).claim === G.CLAIM.PROVIDER_ASSISTED);

  // fail-closed classification
  check("non-object mission ⇒ NOT_MEASURABLE", bucket(null) === B.NOT_MEASURABLE && bucket(42) === B.NOT_MEASURABLE);

  // ---- aggregate: three explicit denominators, NO blended score ----
  const agg = M.aggregateMaturity([
    { id: "a", actor: "ODG", evidence: "REAL" },
    { id: "b", actor: "ODG", evidence: "REAL" },
    { id: "c", actor: "TECHNICAL_PROVIDER", evidence: "REAL" },
    { id: "d", actor: "ODG", status: "OWNER_GATED", evidence: "REAL" }, // escalated
    { id: "e", actor: "ODG" },                                           // claimed native, no evidence ⇒ NOT_MEASURABLE
    { id: "f", actor: "UNKNOWN" },                                       // NOT_MEASURABLE
  ]);
  check("aggregate total=6, measuredDenominator=4 (2 native + 1 assisted + 1 escalated)", agg.total === 6 && agg.measuredDenominator === 4);
  check("NATIVE_DEMONSTRATED count 2, rateOfMeasured 0.5", agg.buckets.NATIVE_DEMONSTRATED.count === 2 && agg.buckets.NATIVE_DEMONSTRATED.rateOfMeasured === 0.5);
  check("ASSISTED 1, ESCALATED 1", agg.buckets.ASSISTED.count === 1 && agg.buckets.ESCALATED.count === 1);
  check("NOT_MEASURABLE 2, reported separately (NOT in the measured denominator)", agg.notMeasurable.count === 2 && agg.measuredDenominator === 4);
  check("ids attributed to the right bucket", JSON.stringify(agg.buckets.NATIVE_DEMONSTRATED.ids) === JSON.stringify(["a", "b"]) && JSON.stringify(agg.buckets.ESCALATED.ids) === JSON.stringify(["d"]) && JSON.stringify(agg.notMeasurable.ids) === JSON.stringify(["e", "f"]));
  // three measured rates sum to 1 over the measured set (no blending into one number)
  check("three bucket rates sum to 1 over measured (no blended score)", Number((agg.buckets.NATIVE_DEMONSTRATED.rateOfMeasured + agg.buckets.ASSISTED.rateOfMeasured + agg.buckets.ESCALATED.rateOfMeasured).toFixed(4)) === 1);
  // all NOT_MEASURABLE ⇒ measured denominator 0, rates null (never a 0-denominator rate)
  const none = M.aggregateMaturity([{ id: "x", actor: "UNKNOWN" }, { id: "y", actor: "ODG" }]);
  check("0 measured ⇒ rateOfMeasured null (never a 0-denominator rate)", none.measuredDenominator === 0 && none.buckets.NATIVE_DEMONSTRATED.rateOfMeasured === null);
  // missions without id ⇒ positional id
  check("mission without id ⇒ positional #index id", M.aggregateMaturity([{ actor: "ODG", evidence: "REAL" }]).buckets.NATIVE_DEMONSTRATED.ids[0] === "#0");

  // fail-closed aggregate
  check("non-array ⇒ BAD_INPUT", M.aggregateMaturity("x").ok === false && M.aggregateMaturity("x").code === "BAD_INPUT");

  // honesty + determinism + frozen + contract
  check("note: capability≠demonstrated, escalated own bucket, no blended score", /CAPABILITY ≠ DEMONSTRATED AUTONOMY/.test(agg.note) && /ESCALATED mission is NOT native and NOT assisted/.test(agg.note) && /NO blended autonomy score/.test(agg.note));
  check("deterministic", JSON.stringify(M.aggregateMaturity([{ id: "a", actor: "ODG", evidence: "REAL" }])) === JSON.stringify(M.aggregateMaturity([{ id: "a", actor: "ODG", evidence: "REAL" }])));
  check("frozen (agg, buckets, a bucket, its ids)", Object.isFrozen(agg) && Object.isFrozen(agg.buckets) && Object.isFrozen(agg.buckets.NATIVE_DEMONSTRATED) && Object.isFrozen(agg.buckets.NATIVE_DEMONSTRATED.ids));
  check("contract: capability≠demonstrated, escalated-own-bucket, no-blend, share-of-measured, explicit-fields",
    M.AUTONOMY_MATURITY_CONTRACT.invariants.some((s: string) => /CAPABILITY ≠ DEMONSTRATED AUTONOMY/.test(s)) &&
    M.AUTONOMY_MATURITY_CONTRACT.invariants.some((s: string) => /ESCALATED mission .* is its OWN bucket/.test(s)) &&
    M.AUTONOMY_MATURITY_CONTRACT.invariants.some((s: string) => /NO blended global score/.test(s)) &&
    M.AUTONOMY_MATURITY_CONTRACT.invariants.some((s: string) => /share of MEASURED missions/.test(s)) &&
    M.AUTONOMY_MATURITY_CONTRACT.invariants.some((s: string) => /EXPLICIT fields only/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-autonomy-maturity-trichotomy (native/assisted/escalated over REAL autonomy-claim-guard: ODG+REAL/verified⇒NATIVE_DEMONSTRATED; ODG+simulated/declared/no-evidence⇒NOT_MEASURABLE [capability≠demonstrated]; provider/human⇒ASSISTED; automated/unknown⇒NOT_MEASURABLE; escalated/ownerGated/OWNER_GATED/DEFERRED_TO_OWNER⇒ESCALATED [overrides actor]; aggregate 3 counts over ONE measured denominator + separate NOT_MEASURABLE, rates sum to 1, 0-denominator⇒null, NO blended score; non-array/non-object fail-closed; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
