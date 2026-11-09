#!/usr/bin/env node
"use strict";

/*
 * V12.4 / ODG LOCAL INTELLIGENCE ENGINE — PHASE 0 (§3/§6). PURE, deterministic SCORING harness for qualifying a LOCAL
 * coding LLM. It does NOT call the model here (that is a live, non-deterministic, environment-dependent step kept OUT of
 * the gate — §5 no silent cloud fallback, and no flaky/NOT_RUN-as-PASS): it scores a RECORDED generation result against
 * a verifiable check, and assesses a maturity level L0..L4 — never declaring a level without the MEASURED proof.
 * Exploitability is fail-closed: generated code counts only if it COMPILES and PASSES the test; an explanation-only or
 * non-compiling output is NOT exploitable. Composes the real evidence (compiled/executed/testPassed flags produced by
 * running tsc + the test in an isolated workspace). Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

const LEVELS = Object.freeze(["L0", "L1", "L2", "L3", "L4"]);

/**
 * scoreGeneration({ hasCode, compiled, executed, testPassed }) -> { exploitable, reason }.
 * A generation is EXPLOITABLE only if it produced code that COMPILED and PASSED its test (fail-closed).
 */
function scoreGeneration(input: any): any {
  const o = isObj(input) ? input : {};
  if (o.hasCode !== true) return Object.freeze({ exploitable: false, reason: "no code produced (explanation-only) ⇒ not exploitable" });
  if (o.compiled !== true) return Object.freeze({ exploitable: false, reason: "generated code does not compile ⇒ not exploitable" });
  if (o.testPassed !== true) return Object.freeze({ exploitable: false, reason: "generated code compiled but failed its test ⇒ not exploitable" });
  return Object.freeze({ exploitable: true, reason: "code compiled AND passed its test ⇒ exploitable" });
}

/**
 * assessLevel({ modelOperational, generations, realFileApplied, fullMissionVerified, longCampaign }) -> { level, reasons }.
 * L0 model operational · L1 ≥1 exploitable generation · L2 a real repo file modified+tested · L3 a full engineering
 * mission verified · L4 long campaign + autonomous recovery. A level is NEVER declared without its measured proof.
 */
function assessLevel(input: any): any {
  const o = isObj(input) ? input : {};
  const gens = arr(o.generations).map(scoreGeneration);
  const exploitableCount = gens.filter((g) => g.exploitable).length;
  const reasons: string[] = [];
  let level = o.modelOperational === true ? "L0" : "NONE";
  if (level === "NONE") reasons.push("local model not operational ⇒ below L0");
  if (level === "L0" && exploitableCount >= 1) { level = "L1"; } else if (level === "L0") reasons.push("no exploitable generation (compiled+tested) ⇒ stays L0");
  if (level === "L1" && o.realFileApplied === true) { level = "L2"; } else if (level === "L1") reasons.push("no real repo file modified+tested ⇒ stays L1");
  if (level === "L2" && o.fullMissionVerified === true) { level = "L3"; } else if (level === "L2") reasons.push("no full engineering mission independently verified ⇒ stays L2");
  if (level === "L3" && o.longCampaign === true) { level = "L4"; } else if (level === "L3") reasons.push("no long campaign + autonomous recovery ⇒ stays L3");
  return Object.freeze({
    level, exploitableCount, totalGenerations: gens.length,
    reasons: Object.freeze(reasons.length ? reasons : [`level ${level} reached with measured proof`]),
    note: "a level is never declared without its measured proof; exploitable = compiled AND tested (fail-closed)",
  });
}

const LOCAL_CODING_QUALIFICATION_CONTRACT = Object.freeze({
  id: "V124-LOCAL-CODING-QUALIFICATION",
  source: "ODG Local Intelligence Engine Phase 0 (§3/§6) — qualify the local coding model",
  levels: LEVELS,
  reuses: Object.freeze(["ollama-provider.generate (live call, OUT of the gate)", "tsc + isolated-workspace test execution (the real compiled/tested evidence)"]),
  notAuthority: "scores a recorded generation + assesses a maturity level; it calls no model here and grants no authority",
  invariants: Object.freeze([
    "a generation is EXPLOITABLE only if it COMPILED and PASSED its test — an explanation-only or non-compiling output is NOT exploitable (fail-closed)",
    "a level L0..L4 is NEVER declared without its measured proof (model operational / exploitable generation / real file modified+tested / full mission verified / long campaign)",
    "the live model call is kept OUT of the gate (non-deterministic, environment-dependent) — no flaky/NOT_RUN presented as PASS; no silent cloud fallback",
    "pure/deterministic scoring: recorded generation result + verifiable check in → exploitability + level out; no clock/random/network here",
  ]),
});

module.exports = { LEVELS, scoreGeneration, assessLevel, LOCAL_CODING_QUALIFICATION_CONTRACT };

if (require.main === module) {
  const demo = assessLevel({ modelOperational: true, generations: [{ hasCode: true, compiled: true, testPassed: true }], realFileApplied: false });
  process.stdout.write(JSON.stringify({ ...LOCAL_CODING_QUALIFICATION_CONTRACT, demo: { level: demo.level, exploitable: demo.exploitableCount } }, null, 2) + "\n");
}

export {};
