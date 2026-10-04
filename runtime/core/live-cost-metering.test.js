#!/usr/bin/env node
"use strict";

/*
 * V5 Stage 3 — D: LIVE COST METERING. Locks the CTO-mandated sequence against an INJECTED/fake provider
 * (no real call): valid budget + real OBSERVED usage ⇒ reserve→commit→spend of EXACTLY the observed
 * amount, admission reservation released (remainder recovered); provider failure / absent observation /
 * unit or scale mismatch / zero usage ⇒ NO fictive spend; budget absent ⇒ provider runs, nothing metered;
 * budget malformed ⇒ clean refusal, provider NOT invoked; overspend ⇒ EXHAUSTED; zero ceiling ⇒ refused
 * before the call; determinism. Composes budget-contract + cost-accounting + economic-unit (reuse).
 *
 * Run directly: node runtime/core/live-cost-metering.test.js
 */
const M = require("./live-cost-metering");

let failures = 0;
function check(cond, label) { if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); } }

// A mission contract that declares a VALID token budget on the "provider" bucket (ceiling 1000 tokens).
const validSpec = (amount = 1000, bucket = "provider", unit = "token") => ({
  budget: { allocations: [{ bucket, unit, kind: "COST_UNIT", amount, scale: 0 }] },
});

// A fake provider outcome carrying an E observation (OBSERVED tokens, or ABSENT when tokens == null).
function outcome(classification, tokens, unit = "token") {
  const observation = tokens == null
    ? { basis: "ABSENT", quantities: [], provenance: null }
    : { basis: "OBSERVED", quantities: [{ unit, kind: "COST_UNIT", minor: tokens, scale: 0 }], provenance: "fake:usage" };
  return { provider: "fake", classification, observation };
}
const exec = (cls, tokens, unit) => () => outcome(cls, tokens, unit);

console.log("V5 — D: LIVE COST METERING");

// 1 — valid budget + real OBSERVED usage ⇒ reserve → spend(observed) → remainder released.
{
  let called = 0;
  const r = M.meterProviderCall({ spec: validSpec(1000), execute: () => { called++; return outcome("OK", 300); } });
  check(called === 1, "provider was actually invoked once (real execution)");
  check(r.decision === "SPENT" && r.spent === true, "clean run + observed usage ⇒ SPENT");
  check(r.snapshot.spent === 300, "SPENT exactly the OBSERVED amount (300), not the ceiling");
  check(r.snapshot.available === 700, "remainder (1000-300=700) returned to AVAILABLE");
  check(r.snapshot.recovered === 1000, "admission reservation (1000) was RELEASED (recovered)");
  check(r.observed && r.observed.minor === 300, "the spent amount is the provider's observation, not a constant");
}

// 2 — provider FAILURE ⇒ no fictive spend; reservation released (full recovery).
{
  const r = M.meterProviderCall({ spec: validSpec(1000), execute: exec("FAILED", 300) });
  check(r.decision === "NO_SPEND_PROVIDER_NOT_OK" && r.spent === false, "provider not OK ⇒ no spend");
  check(r.snapshot.spent === 0 && r.snapshot.available === 1000, "nothing spent; full ceiling restored");
}
// 2b — provider BLOCKED ⇒ same (no spend even though it ran).
{
  const r = M.meterProviderCall({ spec: validSpec(1000), execute: exec("BLOCKED", 500) });
  check(r.decision === "NO_SPEND_PROVIDER_NOT_OK" && r.snapshot.spent === 0, "BLOCKED ⇒ no fictive spend");
}

// 3 — clean run but NO observation ⇒ no spend.
{
  const r = M.meterProviderCall({ spec: validSpec(1000), execute: exec("OK", null) });
  check(r.decision === "NO_SPEND_NO_OBSERVATION" && r.snapshot.spent === 0, "absent observation ⇒ no fictive spend");
}
// 3b — zero observed usage ⇒ nothing to spend.
{
  const r = M.meterProviderCall({ spec: validSpec(1000), execute: exec("OK", 0) });
  check(r.decision === "NO_SPEND_ZERO_USAGE" && r.snapshot.spent === 0, "zero observed usage ⇒ no spend");
}

// 4 — budget ABSENT ⇒ provider runs, nothing metered, no fabricated budget.
{
  let called = 0;
  const r = M.meterProviderCall({ spec: {}, execute: () => { called++; return outcome("OK", 300); } });
  check(r.present === false && r.metered === false && r.decision === "BUDGET_ABSENT", "no budget ⇒ nothing metered");
  check(called === 1 && r.executed === true && r.snapshot === null, "provider still runs (backward compatible); no ledger fabricated");
}

// 5 — budget MALFORMED ⇒ clean refusal, provider NOT invoked.
{
  let called = 0;
  const r = M.meterProviderCall({ spec: { budget: { allocations: [{ bucket: "nope", unit: "", amount: -5 }] } }, execute: () => { called++; return outcome("OK", 10); } });
  check(r.present === true && r.valid === false && r.decision === "BUDGET_MALFORMED", "malformed budget ⇒ refused");
  check(called === 0 && r.executed === false && Array.isArray(r.errors) && r.errors.length > 0, "provider NOT invoked; errors reported");
}

// 6 — unit mismatch ⇒ no implicit conversion, no spend.
{
  const r = M.meterProviderCall({ spec: validSpec(1000, "provider", "token"), execute: exec("OK", 200, "compute-ms") });
  check(r.decision === "NO_SPEND_UNIT_MISMATCH" && r.snapshot.spent === 0, "observation in a different unit ⇒ no spend (no FX)");
}

// 7 — overspend (observed > ceiling) ⇒ EXHAUSTED, no spend.
{
  const r = M.meterProviderCall({ spec: validSpec(1000), execute: exec("OK", 99999) });
  check(r.decision === "EXHAUSTED" && r.spent === false, "observed beyond ceiling ⇒ EXHAUSTED");
  check(r.snapshot.spent === 0 && r.snapshot.available === 1000, "overspend ⇒ nothing spent; ceiling intact");
}

// 8 — zero ceiling ⇒ refused at admission; provider NOT invoked.
{
  let called = 0;
  const r = M.meterProviderCall({ spec: validSpec(0), execute: () => { called++; return outcome("OK", 1); } });
  check(r.decision === "REFUSED_EXHAUSTED" && called === 0, "zero-ceiling budget ⇒ refuse before any call");
}

// 9 — no allocation for the requested bucket ⇒ clean refusal.
{
  const r = M.meterProviderCall({ spec: validSpec(1000, "token"), bucket: "provider", execute: exec("OK", 10) });
  check(r.decision === "NO_BUCKET" && r.executed === false, "valid budget but missing bucket ⇒ NO_BUCKET refusal");
}

// 10 — injected call that throws ⇒ caught, no fictive spend, reservation recovered.
{
  const r = M.meterProviderCall({ spec: validSpec(1000), execute: () => { throw new Error("boom"); } });
  check(r.decision === "NO_SPEND_PROVIDER_ERROR" && r.spent === false && r.snapshot.available === 1000, "thrown provider call ⇒ no spend, reservation recovered");
}

// 11 — determinism: same inputs ⇒ byte-identical snapshot.
{
  const run = () => M.meterProviderCall({ spec: validSpec(1000), execute: exec("OK", 250) }).snapshot;
  check(JSON.stringify(run()) === JSON.stringify(run()), "deterministic: same inputs ⇒ same snapshot");
}

console.log(failures === 0 ? "ALL PASS — D LIVE COST METERING" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
