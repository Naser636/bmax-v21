#!/usr/bin/env node
"use strict";
const assert = require("assert");
const C = require("./compounding-loop");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("WI-FR-08 — COMPOUNDING LOOP (global learning)");

function asset(over?: any): any {
  return Object.assign({ id: "a1", kind: "resolution", signature: "sig1", evidenceRefs: ["e1"], provenance: "mission-x", domain: { domainKey: "parsing", goal: "g", scope: "s" }, sourceMissionId: "m1", benefit: 10, storageCost: 1, retrievalCost: 1, maintenanceCost: 1, uses: 2, reliability: 1, freshness: 1 }, over || {});
}
const newDomainTarget = { domainKey: "networking", evidenceRefs: ["e2"], baseline: { signals: { throughput: 1.0 } }, after: { signals: { throughput: 2.0 } }, senseMap: { throughput: "higher" }, inDomainDelta: 1.0, heldOutDelta: 0.8 };

// (1) VERIFIED_RESULT gate: evidence+domain+provenance ⇒ registered; missing evidence ⇒ REJECTED.
{
  const ok = C.registerAsset(asset(), { now: 1 });
  check(ok.ok === true && ok.asset.state === "REGISTERED" && ok.asset.domain.domainKey === "parsing", "asset with evidence+domain+provenance ⇒ REGISTERED");
  const noEv = C.registerAsset(asset({ evidenceRefs: [] }), {});
  check(noEv.ok === false && noEv.problems.some((p: any) => /VERIFIED_RESULT|evidenceRefs/.test(p)), "no evidenceRefs ⇒ REJECTED (synthetic/unverified is NOT an asset)");
  check(C.registerAsset(asset({ domain: {} }), {}).ok === false, "no validity domain ⇒ REJECTED");
}

// (2) NET-VALUE gate (Memory Tax / CURATOR).
{
  check(C.assetNetValue(asset()).keepEligible === true, "positive benefit − costs ⇒ keepEligible");
  check(C.assetNetValue(asset({ benefit: 0, storageCost: 50 })).keepEligible === false, "high cost / no benefit ⇒ NOT keepEligible (memory tax)");
}

// (3) TRANSFER TEST — new domain, measured improvement, no leakage ⇒ transferred.
{
  const t = C.transferTest(asset(), newDomainTarget, { now: 1 });
  check(t.transferred === true && t.leakage === false && t.outcome === "REUSE_VALIDATED" && t.generalizationGap === 0.2, "held-out transfer to a NEW domain with measured gain ⇒ transferred (gap reported)");
}
// (4) LEAKAGE — same domain ⇒ not a transfer.
{
  const t = C.transferTest(asset(), { ...newDomainTarget, domainKey: "parsing" }, {});
  check(t.leakage === true && t.sameDomain === true && t.transferred === false, "target == source domain ⇒ leakage ⇒ NOT a transfer");
}
// (5) LEAKAGE — shared evidence ⇒ leakage.
{
  const t = C.transferTest(asset(), { ...newDomainTarget, evidenceRefs: ["e1"] }, {});
  check(t.leakage === true && t.sharedEvidence === true, "shared evidence between source and target ⇒ leakage");
}

// (6) REWARD-HACKING gate.
{
  check(C.rewardHackingCheck({ integritySignals: { gaming: { metric: { before: 1, after: 2 }, manipulationMarker: true } } }).clean === false, "integrity DETECTED ⇒ not clean");
  check(C.rewardHackingCheck({ inDomainScore: 0.9, heldOutScore: 0 }).clean === false, "in-domain up while held-out flat ⇒ metric-gaming flag");
  check(C.rewardHackingCheck({ builder: "x", validator: "x" }).clean === false, "builder == validator ⇒ self-certification flag");
  check(C.rewardHackingCheck({ evidenceOverlap: true }).clean === false, "evidence overlap ⇒ leakage flag");
  check(C.rewardHackingCheck({ builder: "x", validator: "y" }).clean === true, "independent + no gaming ⇒ clean");
}

// (7) VALIDATE_CAPABILITY gate — fail-closed matrix.
{
  const good = C.validateCapability(asset(), C.transferTest(asset(), newDomainTarget, {}), { clean: true }, C.assetNetValue(asset()));
  check(good.capability === "VALIDATED_CAPABILITY", "transferred + clean + net value ≥ 0 ⇒ VALIDATED_CAPABILITY");
  check(C.validateCapability(asset(), { leakage: true }, { clean: true }, {}).capability === "REJECTED", "leakage ⇒ REJECTED");
  check(C.validateCapability(asset(), C.transferTest(asset(), newDomainTarget, {}), { clean: false, flags: ["gaming"] }, {}).capability === "REJECTED", "reward-hacking ⇒ REJECTED");
  check(C.validateCapability(asset(), { measured: false }, { clean: true }, {}).capability === "INCONCLUSIVE", "not measurable ⇒ INCONCLUSIVE (fail-closed)");
  check(C.validateCapability(asset(), C.transferTest(asset(), newDomainTarget, {}), { clean: true }, { keepEligible: false }).capability === "REJECTED", "negative net value ⇒ REJECTED");
}

// (8) REWARD-GATED CONSOLIDATION (SLEEP) + reversibility.
{
  const validated = { ...asset(), capability: { capability: "VALIDATED_CAPABILITY" } };
  const con = C.consolidate(validated, { now: 2 });
  check(con.ok === true && con.asset.state === "CONSOLIDATED" && con.asset.consolidated === true, "VALIDATED capability consolidates into protected memory");
  check(C.consolidate(validated, { priorRegression: true }).ok === false, "a prior regression blocks consolidation (reward-gated)");
  check(C.consolidate({ ...asset(), capability: { capability: "REJECTED" } }).ok === false, "only a VALIDATED_CAPABILITY may consolidate");
  const rb = C.rollback(con.asset, { now: 3 });
  check(rb.consolidated === false && rb.rolledBack === true && rb.state === "VALIDATED", "consolidation is reversible (rollback)");
}

// (9) MEASURED_COMPOUNDING aggregate — only validated, measured assets count.
{
  const v1 = C.runCompoundingCycle(asset({ id: "a1" }), { target: newDomainTarget, rewardHacking: { builder: "b", validator: "v" }, now: 1 }).asset;
  const v2 = C.runCompoundingCycle(asset({ id: "a2", benefit: 20 }), { target: { ...newDomainTarget, evidenceRefs: ["e3"] }, rewardHacking: { builder: "b", validator: "v" }, now: 1 }).asset;
  const rejected = C.runCompoundingCycle(asset({ id: "a3" }), { target: { ...newDomainTarget, domainKey: "parsing" }, now: 1 }).asset; // leakage ⇒ rejected
  const agg = C.measuredCompounding([v1, v2, rejected]);
  check(agg.validatedCount === 2 && agg.cumulativeNetBenefit > 0 && agg.meanGeneralizationGap === 0.2, "MEASURED_COMPOUNDING counts only VALIDATED assets; cumulative benefit + mean gap");
  check(C.measuredCompounding([]).cumulativeNetBenefit === 0, "empty/unvalidated set ⇒ 0 (no fabricated compounding)");
}

// (10) COMPUTE-BUDGET STOP.
{
  check(C.budgetStop({ experiments: 5, budget: { maxExperiments: 5 } }).stop === true, "maxExperiments reached ⇒ stop");
  check(C.budgetStop({ marginalYield: 0.001, budget: { minMarginalYield: 0.01 } }).stop === true, "marginal yield below threshold ⇒ stop");
  check(C.budgetStop({ experiments: 1, budget: { maxExperiments: 10 } }).stop === false, "within budget ⇒ continue");
}

// (11) E2E runCompoundingCycle — positive / adversarial(leakage) / adversarial(reward-hack) / contradictory(regression).
{
  const pos = C.runCompoundingCycle(asset(), { target: newDomainTarget, rewardHacking: { builder: "b", validator: "v" }, now: 1 });
  check(pos.capability === "VALIDATED_CAPABILITY", "E2E positive ⇒ VALIDATED_CAPABILITY");
  const leak = C.runCompoundingCycle(asset(), { target: { ...newDomainTarget, domainKey: "parsing" }, now: 1 });
  check(leak.capability === "REJECTED", "E2E leakage ⇒ REJECTED");
  const hack = C.runCompoundingCycle(asset(), { target: newDomainTarget, rewardHacking: { builder: "x", validator: "x" }, now: 1 });
  check(hack.capability === "REJECTED", "E2E self-certification ⇒ REJECTED");
  const regr = C.runCompoundingCycle(asset(), { target: { ...newDomainTarget, after: { signals: { throughput: 0.5 } } }, rewardHacking: { builder: "b", validator: "v" }, now: 1 });
  check(regr.capability === "REJECTED", "E2E contradictory (regression) ⇒ REJECTED (no net held-out improvement)");
}

// (12) persistence: idempotent + resume + corrupt fail-closed.
{
  const m = new Map();
  const store = { read: (n: any, f: any) => (m.has(n) ? m.get(n) : (f === undefined ? null : f)), readStrict: (n: any) => m.has(n) ? { present: true, corrupt: false, value: m.get(n) } : { present: false, corrupt: false, value: null }, write: (n: any, o: any) => { m.set(n, o); return o; } };
  const a = C.runCompoundingCycle(asset(), { target: newDomainTarget, rewardHacking: { builder: "b", validator: "v" }, now: 1 }).asset;
  check(C.persistAsset(a, { store, now: 1 }).added === true, "persistAsset writes the asset snapshot");
  check(C.persistAsset(a, { store }).decision === "DUPLICATE", "re-persist same id:state ⇒ DUPLICATE (idempotent)");
  check(C.resume({ store }).assets["a1"].state === "VALIDATED", "resume() reconstructs the latest asset state");
  const storeC = { read: () => null, readStrict: (_n: any) => ({ present: true, corrupt: true, value: null }), write: () => {} };
  check(C.resume({ store: storeC }).ok === false && C.persistAsset(a, { store: storeC }).ok === false, "corrupt store ⇒ resume + persist fail-closed");
}

console.log(failures === 0 ? "ALL PASS — WI-FR-08 COMPOUNDING LOOP" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
