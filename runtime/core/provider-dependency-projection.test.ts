#!/usr/bin/env node
"use strict";
const assert = require("assert");
const P = require("./provider-dependency-projection");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 23 — PROVIDER-DEPENDENCY PROJECTION (ODG-native)");

// mixed queue: READ_ONLY ⇒ native; IMPLEMENT/requiresEngineering ⇒ provider-dependent.
{
  const r = P.projectProviderDependency({ missions: [
    { id: "a", mode: "AUDIT" }, { id: "b", mode: "REPORT" },      // native
    { id: "c", mode: "IMPLEMENT" }, { id: "d", requiresEngineering: true }, // provider-dependent
  ], providerAvailable: false });
  check(r.nativeGuaranteed === 2 && r.providerDependent === 2, `2 native / 2 provider-dependent (got ${r.nativeGuaranteed}/${r.providerDependent})`);
  check(r.nativeContinuityFloor === 0.5, `continuity floor 0.5 (got ${r.nativeContinuityFloor})`);
  check(r.blockedIfProviderDown === 2, "provider down ⇒ 2 missions blocked");
}

// a mission whose dependency is undeterminable ⇒ UNKNOWN, never counted native.
{
  const r = P.projectProviderDependency({ missions: [{ id: "a", mode: "AUDIT" }, "garbage", { id: "c", mode: "WEIRD_MODE" }], providerAvailable: true });
  // "garbage" ⇒ UNKNOWN; WEIRD_MODE with no authorizedPaths ⇒ needsProvider false ⇒ native. So: native a + native c, unknown garbage.
  check(r.unknown === 1, "non-object mission ⇒ UNKNOWN (1)");
  check(r.nativeContinuityFloor !== null && r.nativeGuaranteed === 2, "UNKNOWN excluded from native numerator");
}

// provider UP ⇒ blockedIfProviderDown is 0 (the block only applies when down).
check(P.projectProviderDependency({ missions: [{ id: "c", mode: "IMPLEMENT" }], providerAvailable: true }).blockedIfProviderDown === 0, "provider up ⇒ 0 blocked");

// empty queue ⇒ measurable:false, no fabricated percentage.
{
  const r = P.projectProviderDependency({ missions: [], providerAvailable: false });
  check(r.measurable === false && r.nativeContinuityFloor === null, "empty queue ⇒ measurable:false, null floor (no fabrication)");
}

// injected canonical predicate is honored.
{
  const r = P.projectProviderDependency({ missions: [{ id: "x" }, { id: "y" }], needsProvider: (m: any) => m.id === "x", providerAvailable: false });
  check(r.providerDependent === 1 && r.nativeGuaranteed === 1, "injected needsProvider predicate honored");
}

// missionNeedsProvider mirrors provider-port: authorizedPaths non-empty ⇒ provider-dependent.
check(P.missionNeedsProvider({ authorizedPaths: ["src/x.ts"] }) === true, "authorizedPaths non-empty ⇒ needs provider");
check(P.missionNeedsProvider({ mode: "READ_ONLY" }) === false, "READ_ONLY ⇒ native");

check(P.PROVIDER_DEPENDENCY_PROJECTION_CONTRACT.invariants.some((i: any) => /GUARANTEED lower bound/.test(i)), "contract: floor is a guaranteed lower bound");

console.log(failures === 0 ? "ALL PASS — SÉRIE 23 PROVIDER-DEPENDENCY PROJECTION" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
