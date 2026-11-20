#!/usr/bin/env node
"use strict";
/*
 * V327 §6/§9 — MISSION-COMPLETENESS (missing-information) PRE-FLIGHT. PURE, deterministic, fail-closed. §6 asks ODG to
 * DETECT MISSING INFORMATION before acting; §9 asks it to remove useless operations. native-engineering-readiness gates
 * on demonstrated RELIABILITY but never checks whether the spec is STRUCTURALLY EXECUTABLE — a spec with no acceptance
 * criterion (independentTest) can NEVER be accepted (the independent verifier is the sole arbiter), so attempting it wastes
 * a local build. This classifies a mission spec as EXECUTABLE vs UNDERSPECIFIED before the readiness/attempt, so ODG asks
 * for the missing inputs instead of burning a doomed attempt. It is a READ of the spec; it executes nothing, lowers no gate.
 *
 * A native mission is EXECUTABLE only if it has (1) an architecture of ≥1 file each with a path + a contract (what to
 * build) AND (2) an acceptance criterion — a typeof-function independentTest (how acceptance is decided). Anything missing
 * ⇒ UNDERSPECIFIED with the precise missing list. NOT over-broad: write-set is optional (derived from architecture paths),
 * repairExamples are optional (repair hints, not acceptance).
 */

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/**
 * assessCompleteness(spec) -> { complete, verdict:"EXECUTABLE"|"UNDERSPECIFIED", missing:string[], reason }.
 * Fail-closed: a non-object spec, or one missing architecture/contract/acceptance, is UNDERSPECIFIED (never EXECUTABLE).
 */
function assessCompleteness(spec: any): any {
  const missing: string[] = [];
  if (!isObj(spec)) return freeze({ complete: false, verdict: "UNDERSPECIFIED", missing: freeze(["spec (not an object)"]), reason: "spec is not an object — cannot determine what to build or how to verify it" });

  const arch = Array.isArray(spec.architecture) ? spec.architecture : [];
  if (arch.length === 0) missing.push("architecture (≥1 file to build)");
  else {
    const bad = arch.filter((f: any) => !isObj(f) || typeof f.path !== "string" || !f.path.trim() || typeof f.contract !== "string" || !f.contract.trim());
    if (bad.length > 0) missing.push(`file contract(s) (${bad.length} architecture entr${bad.length === 1 ? "y" : "ies"} missing path or contract)`);
  }

  // acceptance criterion: the independent verifier is the SOLE arbiter — without it, acceptance is impossible.
  if (typeof spec.independentTest !== "function") missing.push("acceptance criterion (independentTest) — without it the mission can never be accepted");

  const complete = missing.length === 0;
  return freeze({
    complete, verdict: complete ? "EXECUTABLE" : "UNDERSPECIFIED", missing: freeze(missing),
    reason: complete
      ? "spec has an architecture with per-file contracts AND an acceptance criterion — executable (attempt is still independently verified)"
      : `missing required input(s): ${missing.join("; ")} — request clarification/inputs instead of attempting a doomed build (no wasted local work)`,
  });
}

const MISSION_COMPLETENESS_CONTRACT = Object.freeze({
  id: "V327-MISSION-COMPLETENESS",
  purpose: "§6/§9 — pre-flight detection of missing information: classify a mission spec EXECUTABLE vs UNDERSPECIFIED (no acceptance criterion / no buildable architecture) BEFORE the readiness gate, so ODG asks for inputs instead of wasting a doomed local attempt",
  reuses: Object.freeze(["reads the SAME spec shape native-project-builder consumes (architecture + independentTest arbiter) — no new schema", "complements native-engineering-readiness (reliability) with the ORTHOGONAL structural-completeness axis it does not check"]),
  invariants: Object.freeze([
    "EXECUTABLE requires BOTH a buildable architecture (≥1 file with path+contract) AND an acceptance criterion (independentTest) — acceptance is impossible without the independent verifier",
    "fail-closed: a non-object spec or any missing required input ⇒ UNDERSPECIFIED (never EXECUTABLE); the precise missing list is reported",
    "NOT over-broad: write-set (derived from architecture) and repairExamples (repair hints) are optional — they never make a spec UNDERSPECIFIED",
    "PURE/deterministic/frozen; reads the spec only; executes nothing; lowers no gate; is not a second readiness engine",
  ]),
});

module.exports = { assessCompleteness, MISSION_COMPLETENESS_CONTRACT };
export {};
