#!/usr/bin/env node
"use strict";
/*
 * V327 §3 — DECOMPOSED EXECUTION with INTERMEDIATE VERIFICATION. Deterministic, fail-closed. §3 found that a hard task
 * (topo) is unsolved by a bigger model AND by more blind repair, and that naive file-splitting (one whole-task test)
 * STILL fails — because a single whole-task verdict can't tell WHICH sub-problem is wrong. This drives the task through
 * its ORDERED sub-problems, VERIFYING EACH INDEPENDENTLY (its own independentTest) before moving on, so a failure is
 * LOCALISED to a specific sub-problem (targeted repair / targeted escalation) instead of a blind whole-task retry.
 *
 * It REUSES native-project-builder.buildProject per sub-problem (each with its own maxRepair-bounded, independent-test-
 * guided repair) — it builds NO second orchestrator and no new executor. The verified module(s) of an earlier sub-problem
 * are threaded forward as `builtContracts`, so a later sub-problem composes on PROVEN parts. A sub-problem that fails after
 * its own repair budget STOPS the chain (required) and is returned as the exact unit to escalate (provider/decomposition)
 * — honesty over blind persistence. PURE given an injected builder (default = the real buildProject); no network here.
 */

const BUILDER = require("./native-project-builder.js");

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/**
 * runDecomposed(subproblems, deps) -> { ok, results[], verifiedCount, total, allVerified, firstFailure, escalate, note }.
 *   subproblems: ORDERED [{ id, spec:{ name, architecture, independentTest }, required?=true }]. Each spec is a
 *     native-project-builder project with its OWN independentTest (the intermediate verification).
 *   deps: { generateFile, maxRepair?=2, buildProject?=BUILDER.buildProject }.
 * Runs each in order; a verified sub-problem's modules thread forward as builtContracts; a REQUIRED sub-problem that
 * fails after repair STOPS the chain and is surfaced as `escalate` (the exact unit to hand to provider/further
 * decomposition). Blind whole-task retries are never issued.
 */
async function runDecomposed(subproblems: any, deps: any): Promise<any> {
  if (!Array.isArray(subproblems) || subproblems.length === 0) return freeze({ ok: false, code: "BAD_SUBPROBLEMS", detail: "ordered non-empty subproblems[] required" });
  const d = isObj(deps) ? deps : {};
  const build = typeof d.buildProject === "function" ? d.buildProject : BUILDER.buildProject;
  if (typeof d.generateFile !== "function") return freeze({ ok: false, code: "NO_GENERATOR", detail: "deps.generateFile required" });
  const maxRepair = Number.isFinite(d.maxRepair) ? d.maxRepair : 2;

  const results: any[] = [];
  let builtContracts: any = {};        // accumulated verified modules, threaded to later sub-problems
  let firstFailure: string | null = null;
  for (const sp of subproblems) {
    const id = sp && (typeof sp.id === "string" ? sp.id : (sp.spec && sp.spec.name)) || "subproblem";
    const required = !sp || sp.required !== false;
    let bo: any;
    try { bo = await build(sp.spec, { generateFile: d.generateFile, maxRepair, builtContracts }); }
    catch (e: any) { bo = { verified: false, buildOk: false, repairs: null, error: String((e && e.message) || e) }; }
    const verified = bo && bo.verified === true;
    results.push(freeze({ id, verified, repairs: bo ? bo.repairs : null, buildOk: bo ? bo.buildOk === true : false, required }));
    if (verified) { if (bo.modules && isObj(bo.modules)) builtContracts = { ...builtContracts, ...bo.modules }; }
    else if (required) { firstFailure = id; break; }   // LOCALISED failure ⇒ stop; no blind whole-task retry
  }

  const verifiedCount = results.filter((r) => r.verified).length;
  const allVerified = firstFailure === null && verifiedCount === subproblems.length;
  return freeze({
    ok: true,
    results: freeze(results),
    verifiedCount, total: subproblems.length,
    allVerified,
    firstFailure,
    // the EXACT sub-problem to escalate (provider / further decomposition) — targeted, not a blind whole-task retry.
    escalate: firstFailure,
    note: firstFailure
      ? `sub-problem "${firstFailure}" failed its OWN independent verification after ${maxRepair} repair(s) ⇒ LOCALISED failure; escalate this unit (provider/decomposition) — earlier sub-problems are verified + reused; no blind whole-task retry issued`
      : "all sub-problems independently verified + composed on proven parts (decomposition with intermediate verification)",
  });
}

const DECOMPOSED_EXECUTION_CONTRACT = Object.freeze({
  id: "V327-DECOMPOSED-EXECUTION",
  purpose: "§3 — drive a hard task through ORDERED sub-problems with INTERMEDIATE independent verification, so a failure is LOCALISED to one sub-problem (targeted repair/escalation) instead of a blind whole-task retry",
  reuses: Object.freeze(["native-project-builder.buildProject per sub-problem (independent-test-guided, maxRepair-bounded repair — not reimplemented)", "threads verified modules forward as builtContracts (compose on proven parts)"]),
  invariants: Object.freeze([
    "each sub-problem is verified by its OWN independentTest BEFORE the next — a whole-task verdict cannot hide which part is wrong",
    "a REQUIRED sub-problem failing after its repair budget STOPS the chain and is surfaced as the EXACT unit to escalate (provider/decomposition) — no blind whole-task retry",
    "verified sub-problem modules thread forward as builtContracts ⇒ later sub-problems compose on PROVEN parts",
    "REUSES buildProject; builds NO second orchestrator/executor; the real builder is injectable for deterministic tests",
    "fail-closed on empty subproblems / missing generator; AUTHORIZES NOTHING; frozen results",
  ]),
});

module.exports = { runDecomposed, DECOMPOSED_EXECUTION_CONTRACT };
export {};
