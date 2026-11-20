#!/usr/bin/env node
"use strict";
/*
 * V324 §5/§12 — NATIVE-EXECUTION → PROVENANCE CONNECTOR (the missing caller the "0 native actors" root-cause pointed to).
 *
 * ROOT CAUSE (proven, not assumed): ODG already performs genuine native execution (odg-native-engineering.runNativeCycle
 * and odg-native-engineering-loop.{driveSource,run} drive the deterministic odg-transform-catalog / closed-executor —
 * real in-process computation, no LLM, no provider), AND the honest provenance resolver already exists
 * (actor-provenance.resolveMissionActor stamps actor=ODG ONLY on concordant authoredBy∈{ODG_CAPABILITY,ODG_RULES} +
 * appliedBy===ODG_EXECUTOR evidence). But NOTHING mapped a native-execution RESULT into the patch-execution evidence
 * SHAPE the resolver consumes — so a real native execution was never RECORDED as ODG provenance. That disconnection is
 * exactly why the mission-ledger showed 0 native actors. This module is that connector — nothing more, no 2nd engine.
 *
 * HONESTY (hard rules — this must NEVER fabricate native provenance):
 *  - An entry is stamped authoredBy=ODG_CAPABILITY / appliedBy=ODG_EXECUTOR ONLY for a step whose executor the native
 *    engine itself tagged ODG_NATIVE_EXECUTION (odg-native-engineering.EXEC.NATIVE) — i.e. ODG's own deterministic code
 *    genuinely authored (selected a registered op) AND applied (executed it via the CLOSED executor).
 *  - A non-native cycle (ESCALATED_TO_PROVIDER / invalid / nativeCycle!==true) yields NO executed[] entry ⇒ the resolver
 *    returns actor:null (no attribution) — honest.
 *  - The HUMAN_VALIDATION follow-up (real-repo write) is EXCLUDED from executed[] (it has NOT happened; it is OWNER_GATED)
 *    and surfaced separately as ownerGatedFollowups. Including it would (correctly) make the resolver report AMBIGUOUS —
 *    but it is not part of what ODG executed, so it is declared, not buried.
 *  - CLAUDE_CODE_EXECUTION / local-model / simulated steps are NEVER mapped to an ODG entry; they are surfaced as
 *    nonNativeSteps so a mixed cycle can never be laundered into pure-ODG provenance.
 *  - PURE / deterministic / frozen. No fs / clock / network / randomness (the resolver + caller inject everything).
 */

const AP = require("./actor-provenance.js");            // the REAL honest resolver (reuse; no re-implementation)
const NE = require("./odg-native-engineering.js");      // EXEC tags (ODG_NATIVE_EXECUTION etc.) — single source of truth

const EXEC = NE.EXEC;                                    // { NATIVE, LOCAL, CLAUDE, HUMAN, SIM, NM }
// The exact author/executor tokens actor-provenance recognises as a concordant ODG signal (mirrors its ODG_AUTHORS set).
const ODG_AUTHOR = "ODG_CAPABILITY";
const ODG_EXECUTOR = "ODG_EXECUTOR";

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function freeze<T>(o: T): T { return Object.freeze(o) as T; }

// A single honest executed[] entry for a genuinely-ODG-native action.
function odgEntry(action: string, detail: string): any {
  return freeze({ action, authoredBy: ODG_AUTHOR, appliedBy: ODG_EXECUTOR, status: "EXECUTED", detail });
}

/**
 * fromNativeCycle(cycle, missionId) — map an odg-native-engineering.runNativeCycle() RESULT into patch-execution evidence.
 * Returns { ok, mission, executed[], attributable, ownerGatedFollowups[], nonNativeSteps[], verdict, reason }. Only
 * ODG_NATIVE_EXECUTION steps become ODG executed[] entries; HUMAN follow-ups and any non-native steps are surfaced, never
 * mapped to ODG. A non-native cycle ⇒ executed:[] (resolver will return actor:null).
 */
function fromNativeCycle(cycle: any, missionId: any): any {
  if (!isObj(cycle)) return freeze({ ok: false, code: "BAD_CYCLE", detail: "cycle result object required" });
  const mission = isStr(missionId) ? missionId : (isStr(cycle.missionId) ? cycle.missionId : null);
  if (!mission) return freeze({ ok: false, code: "BAD_MISSION", detail: "missionId (string) required" });

  const steps = arr(cycle.steps);
  const executed: any[] = [];
  const ownerGatedFollowups: any[] = [];
  const nonNativeSteps: any[] = [];
  // A genuine native cycle is the ONLY source of ODG executed[] entries. Anything else ⇒ no ODG attribution.
  const nativeCycle = cycle.nativeCycle === true;
  for (const s of steps) {
    const ex = s && typeof s.executor === "string" ? s.executor : "";
    const name = s && typeof s.step === "string" ? s.step : "step";
    const detail = s && typeof s.detail === "string" ? s.detail : "";
    if (nativeCycle && ex === EXEC.NATIVE) executed.push(odgEntry(name, detail));
    else if (ex === EXEC.HUMAN) ownerGatedFollowups.push(freeze({ step: name, detail, gate: "OWNER_GATED" }));
    else if (ex && ex !== EXEC.NATIVE) nonNativeSteps.push(freeze({ step: name, executor: ex, detail }));
  }
  const attributable = executed.length > 0 && nonNativeSteps.length === 0;
  return freeze({
    ok: true, mission, executed: freeze(executed), attributable,
    ownerGatedFollowups: freeze(ownerGatedFollowups), nonNativeSteps: freeze(nonNativeSteps),
    verdict: isStr(cycle.verdict) ? cycle.verdict : null,
    testsPass: typeof cycle.testsPass === "number" ? cycle.testsPass : null,
    testsTotal: typeof cycle.testsTotal === "number" ? cycle.testsTotal : null,
    reason: !nativeCycle ? "cycle was NOT an ODG-native execution (escalated/invalid) ⇒ no ODG executed[] entry (honest)"
      : nonNativeSteps.length > 0 ? "mixed cycle: non-native steps present ⇒ not purely-ODG attributable (surfaced, never laundered)"
      : executed.length > 0 ? "ODG-native steps mapped to concordant ODG_CAPABILITY/ODG_EXECUTOR evidence; owner-gated write excluded"
      : "no ODG-native step to attribute",
  });
}

// Loop dispositions that mean ODG genuinely executed the deterministic transform itself (odg-native-engineering-loop).
const LOOP_NATIVE_DISPOSITIONS = Object.freeze(new Set(["NATIVE_REPAIRED", "ALREADY_CLEAN"]));

/**
 * fromLoopResult(loopResult, missionId) — map an odg-native-engineering-loop RESULT (a run() aggregate with rows[], a
 * single driveTask/driveSource row, or a {rows:[...]} shape) into patch-execution evidence. A row with
 * nativelyExecuted===true AND a native disposition becomes an ODG executed[] entry; DEFERRED_TO_PROVIDER /
 * REFUSED_OUT_OF_SCOPE / anything not natively executed is surfaced (deferred/refused), never stamped ODG.
 */
function fromLoopResult(loopResult: any, missionId: any): any {
  if (!isObj(loopResult)) return freeze({ ok: false, code: "BAD_LOOP_RESULT", detail: "loop result object required" });
  const mission = isStr(missionId) ? missionId : null;
  if (!mission) return freeze({ ok: false, code: "BAD_MISSION", detail: "missionId (string) required" });
  const rows = Array.isArray(loopResult.rows) ? loopResult.rows
    : (typeof loopResult.disposition === "string" ? [loopResult] : []);

  const executed: any[] = [];
  const deferred: any[] = [];
  const refused: any[] = [];
  for (const r of rows) {
    if (!isObj(r)) continue;
    const disp = typeof r.disposition === "string" ? r.disposition : "";
    const id = isStr(r.id) ? r.id : (isStr(r.filePath) ? r.filePath : "task");
    if (r.nativelyExecuted === true && LOOP_NATIVE_DISPOSITIONS.has(disp)) executed.push(odgEntry("native:" + disp + ":" + id, r.reason || ""));
    else if (disp === "DEFERRED_TO_PROVIDER") deferred.push(freeze({ id, reason: r.reason || "", providerMandate: r.providerMandate || null }));
    else if (disp === "REFUSED_OUT_OF_SCOPE") refused.push(freeze({ id, reason: r.reason || "" }));
    // FAILED / anything else ⇒ not a clean native execution ⇒ not attributed (surfaced via counts only).
  }
  const attributable = executed.length > 0;
  return freeze({
    ok: true, mission, executed: freeze(executed), attributable,
    deferredToProvider: freeze(deferred), refusedOutOfScope: freeze(refused),
    reason: executed.length > 0 ? "natively-executed deterministic rows mapped to concordant ODG evidence; deferred/refused rows surfaced, never stamped ODG"
      : "no natively-executed row to attribute",
  });
}

/**
 * resolveActor(evidence) — CLOSE the loop: feed the built evidence through the REAL production resolver
 * (actor-provenance.resolveMissionActor) and return its verdict. This is the connection whose absence caused the
 * 0-native-actors gap: a genuine native cycle now resolves to { actor:"ODG", ... }. Fail-closed on a bad evidence object.
 */
function resolveActor(evidence: any): any {
  if (!isObj(evidence) || evidence.ok !== true || !isStr(evidence.mission)) return freeze({ actor: null, executedBy: null, reason: "invalid/failed evidence ⇒ no attribution", unresolvedCount: 0 });
  // Honest gate: a cycle contaminated by non-native EXECUTED work (attributable:false) can NEVER resolve to pure ODG,
  // even if its executed[] happens to hold only ODG entries — this forecloses laundering a mixed/forged cycle.
  if (evidence.attributable !== true) return freeze({ actor: null, executedBy: null, reason: "evidence not purely-ODG-attributable (no native executed[] entry, or non-native steps present) ⇒ no attribution", unresolvedCount: 0 });
  const r = AP.resolveMissionActor({ mission: evidence.mission, executed: arr(evidence.executed) }, evidence.mission);
  return freeze({ actor: r.actor, executedBy: r.executedBy, reason: r.reason, unresolvedCount: r.unresolvedCount });
}

/**
 * attributeNativeCycle(cycle, missionId) — one-call convenience: build evidence from a native cycle AND resolve the actor,
 * returning { evidence, provenance }. The honest end-to-end: real native execution → evidence → actor=ODG.
 */
function attributeNativeCycle(cycle: any, missionId: any): any {
  const evidence = fromNativeCycle(cycle, missionId);
  return freeze({ evidence, provenance: evidence.ok === true ? resolveActor(evidence) : freeze({ actor: null, executedBy: null, reason: evidence.detail || "bad evidence", unresolvedCount: 0 }) });
}

const NATIVE_EXECUTION_PROVENANCE_CONTRACT = Object.freeze({
  id: "V324-NATIVE-EXECUTION-PROVENANCE-CONNECTOR",
  purpose: "connect a genuine ODG-native execution RESULT to the honest provenance evidence shape actor-provenance/mission-ledger consume — the missing caller behind '0 native actors'",
  reuses: Object.freeze(["actor-provenance.resolveMissionActor (honest resolver — NOT re-implemented)", "odg-native-engineering.EXEC (executor tags — single source of truth)", "odg-native-engineering / -loop native-execution results (real ODG_NATIVE_EXECUTION)"]),
  invariants: Object.freeze([
    "ODG executed[] entry ONLY for a step the native engine tagged ODG_NATIVE_EXECUTION (concordant ODG_CAPABILITY + ODG_EXECUTOR); never fabricates native provenance",
    "non-native cycle (ESCALATED/invalid/nativeCycle!==true) ⇒ empty executed[] ⇒ resolver returns actor:null (no attribution)",
    "HUMAN_VALIDATION follow-ups (real-repo write) are EXCLUDED from executed[] (not yet executed; OWNER_GATED) and declared in ownerGatedFollowups — never buried, never stamped ODG",
    "CLAUDE_CODE/local-model/simulated steps are surfaced in nonNativeSteps and make a cycle not-purely-attributable; they are never laundered into ODG",
    "resolveActor delegates to the REAL actor-provenance resolver (the connection itself is proven through the production resolver, not a mock)",
    "PURE / deterministic / frozen; no fs/clock/network; builds NO 2nd engine/orchestrator, no 10th primitive",
  ]),
});

module.exports = { fromNativeCycle, fromLoopResult, resolveActor, attributeNativeCycle, NATIVE_EXECUTION_PROVENANCE_CONTRACT };
export {};
