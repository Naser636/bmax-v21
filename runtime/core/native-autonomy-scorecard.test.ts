#!/usr/bin/env node
"use strict";
const assert = require("assert");
const S = require("./native-autonomy-scorecard");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V5 PHASE 5 / M-C-01 — NATIVE AUTONOMY SCORECARD");
// no provider needed ⇒ NATIVE_EXECUTION.
check(S.fallbackDecision("PROVIDER_UNAVAILABLE", { missionNeedsProvider: false }).path === "NATIVE_EXECUTION", "needs no provider ⇒ NATIVE_EXECUTION");
// available + validated ⇒ PROVIDER_EXECUTION.
check(S.fallbackDecision("PROVIDER_AVAILABLE", { missionNeedsProvider: true, delegatedResultValid: true }).path === "PROVIDER_EXECUTION", "available + validated ⇒ PROVIDER_EXECUTION");
// available + unvalidated ⇒ NEEDS_VALIDATION (never accept unvalidated).
{
  const r = S.fallbackDecision("PROVIDER_AVAILABLE", { missionNeedsProvider: true });
  check(r.path === "NEEDS_VALIDATION" && r.resultTrusted === false, "available + unvalidated ⇒ NEEDS_VALIDATION (fail-closed)");
}
// unavailable + native capable ⇒ NATIVE_FALLBACK.
check(S.fallbackDecision("PROVIDER_UNAVAILABLE", { missionNeedsProvider: true, nativeCapable: true }).path === "NATIVE_FALLBACK", "unavailable + native ⇒ NATIVE_FALLBACK");
// unavailable + no native ⇒ BLOCKED.
check(S.fallbackDecision("PROVIDER_TIMEOUT", { missionNeedsProvider: true, nativeCapable: false }).path === "BLOCKED", "timeout + no native ⇒ BLOCKED");
// incorrect result + no native ⇒ NEEDS_VALIDATION (never accept bad delegated result).
{
  const r = S.fallbackDecision("PROVIDER_INCORRECT", { missionNeedsProvider: true, nativeCapable: false });
  check(r.path === "NEEDS_VALIDATION" && r.resultTrusted === false, "incorrect + no native ⇒ NEEDS_VALIDATION (never accept)");
}
// incomplete + native ⇒ NATIVE_FALLBACK.
check(S.fallbackDecision("PROVIDER_INCOMPLETE", { missionNeedsProvider: true, nativeCapable: true }).path === "NATIVE_FALLBACK", "incomplete + native ⇒ NATIVE_FALLBACK");
// unknown scenario ⇒ BLOCKED.
check(S.fallbackDecision("BANANA", { missionNeedsProvider: true, nativeCapable: true }).path === "BLOCKED", "unknown scenario ⇒ BLOCKED (fail-closed)");
// scorecard composes retrospective + forward; empty ⇒ not measurable, no fabrication.
{
  const r = S.scorecard({ units: [], queue: [], providerAvailable: false });
  check(r.retrospective.measurable === false && r.forward.measurable === false, "empty inputs ⇒ both not measurable (no fabricated %)");
}
// scorecard forward floor computed from a queue.
{
  const r = S.scorecard({ queue: [{ id: "a", mode: "AUDIT" }, { id: "b", mode: "IMPLEMENT" }], providerAvailable: false });
  check(r.forward.measurable === true && r.forward.nativeContinuityFloor === 0.5 && r.forward.blockedIfProviderDown === 1, "forward floor composes provider-dependency-projection (0.5, 1 blocked)");
}
check(S.NATIVE_AUTONOMY_SCORECARD_CONTRACT.invariants.some((i: any) => /never counted NATIVE/.test(i)), "contract: UNKNOWN never NATIVE");
console.log(failures === 0 ? "ALL PASS — V5 M-C-01 NATIVE AUTONOMY SCORECARD" : "FAILURES: " + failures);
process.exit(failures === 0 ? 0 : 1);
export {};
