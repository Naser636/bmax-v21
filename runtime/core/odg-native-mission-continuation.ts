#!/usr/bin/env node
"use strict";
/*
 * V326 §9 — NATIVE MISSION CONTINUATION. Composes the PROVEN continuation engine (campaign-loop.runCampaignLoop +
 * campaign-controller, V160 — already tested; see odg-continuation-diagnostic) with REAL ODG-native execution
 * (odg-native-engineering.runNativeCycle) and genuine provenance (odg-native-execution-provenance, #761).
 *
 * THE GAP (honest): the continuation LOGIC was proven, but every demonstration drove it with a STUB executor
 * (`execute: () => ({status:"ACCEPTED"})`) — never a real execution. §9 warns "do not mistake scheduler activity or
 * planning for execution." This module provides the REAL executor: each lot's execute() runs a bounded deterministic
 * native cycle, resolves its actor through the production resolver, and returns ACCEPTED *only* when the cycle genuinely
 * reached green AND the actor is ODG. The loop then drives selection → native execution → result+provenance → dependency
 * recompute → next selection → continuation, to a justified stop — a real multi-mission lifecycle, not a stub.
 *
 * Builds NO second scheduler/queue/engine and no 10th primitive — it only wires three existing, tested components.
 * Deterministic given an injected clock (campaign-loop timestamps); the control-flow + provenance are clock-independent.
 */

const L = require("./campaign-loop.js");
const NE = require("./odg-native-engineering.js");
const PROV = require("./odg-native-execution-provenance.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
const GREEN = Object.freeze(new Set(["NATIVE_GREEN", "NATIVE_REPAIRED_GREEN"]));

function completedIds(transitions: any[]): string[] { return (Array.isArray(transitions) ? transitions : []).filter((t: any) => t && t.event === "COMPLETED").map((t: any) => t.lot); }

/**
 * executeNativeLot(lot, sink?) -> a campaign-loop verdict, by genuinely executing the lot's bounded native spec.
 *   lot: a register item carrying { id, spec:{ fnName, kind, examples }, injectFault? }.
 *   sink (optional): a mutable map the caller passes to CAPTURE per-lot provenance {actor, verdict, tests}.
 * ACCEPTED only when the native cycle reached green AND actor-provenance resolves actor=ODG (no green/ODG ⇒ not accepted).
 * A novel (out-of-catalog) kind honestly DEFERS (WAITING_FOR_PROVIDER ⇒ the loop BLOCKS that lot, continues others).
 */
function executeNativeLot(lot: any, sink?: any): any {
  if (!isObj(lot) || !isObj(lot.spec)) return { status: "FAILED", reason: "lot carries no native spec { fnName, kind, examples }" };
  const cyc = NE.runNativeCycle({ id: lot.id, spec: lot.spec, injectFault: lot.injectFault === true });
  const att = PROV.attributeNativeCycle(cyc, lot.id);
  const actor = att && att.provenance ? att.provenance.actor : null;
  if (isObj(sink)) sink[lot.id] = Object.freeze({ actor, verdict: cyc.verdict, testsPass: cyc.testsPass, testsTotal: cyc.testsTotal });
  if (cyc.nativeCycle === true && GREEN.has(cyc.verdict) && actor === "ODG")
    return { status: "ACCEPTED", evidence: `native ${cyc.verdict}; executor=ODG_NATIVE (actor=ODG via actor-provenance); tests ${cyc.testsPass}/${cyc.testsTotal}` };
  if (cyc.verdict === "ESCALATED_TO_PROVIDER")
    return { status: "WAITING_FOR_PROVIDER", reason: `kind '${lot.spec.kind}' outside the native deterministic catalog ⇒ provider mandate (honest defer, not a native success)`, blockReason: "novel codegen ⇒ provider mandate" };
  return { status: "FAILED", reason: `native cycle did not reach green-with-ODG-provenance (verdict=${cyc.verdict}, actor=${actor})` };
}

/**
 * runNativeMissionCampaign({ register, now?, maxIterations? }) -> { ok, stopped, campaignComplete, iterations, completed[],
 * provenanceByLot, acceptedNativelyCount, loopResult }. Drives the REAL continuation engine with the native executor.
 * NOTE: runCampaignLoop MUTATES register.items in place — pass a FRESH register per call. now is injectable for determinism.
 */
function runNativeMissionCampaign(opts: any): any {
  const o = isObj(opts) ? opts : {};
  if (!isObj(o.register) || !Array.isArray(o.register.items)) return Object.freeze({ ok: false, code: "BAD_REGISTER", detail: "register { version, items[] } required" });
  const provenanceByLot: any = {};
  const loopResult = L.runCampaignLoop({
    register: o.register,
    execute: (lot: any) => executeNativeLot(lot, provenanceByLot),
    now: typeof o.now === "function" ? o.now : undefined,
    maxIterations: Number.isFinite(o.maxIterations) ? o.maxIterations : 100,
  });
  const completed = completedIds(loopResult.transitions);
  // Honest cross-check: EVERY completed (ACCEPTED) lot must carry actor=ODG — acceptance is gated on it in the executor.
  const acceptedNativelyCount = completed.filter((id: string) => provenanceByLot[id] && provenanceByLot[id].actor === "ODG").length;
  const allCompletedAreOdg = completed.length === acceptedNativelyCount;
  return Object.freeze({
    ok: true,
    stopped: loopResult.stopped,
    campaignComplete: loopResult.campaignComplete === true,
    lifecycleState: loopResult.lifecycleState,
    iterations: loopResult.iterations,
    completed: Object.freeze(completed),
    provenanceByLot: Object.freeze(provenanceByLot),
    acceptedNativelyCount,
    allCompletedAreOdg,
    loopResult,
  });
}

// Fresh register factories (runCampaignLoop mutates in place — never reuse a register object across runs).
function allNativeRegister(): any {
  return { version: "native-continuation-demo", items: [
    { id: "A", status: "READY", deps: [], priority: 1, spec: { fnName: "a", kind: "sum", examples: [{ args: [2, 3], expect: 5 }] }, injectFault: true },
    { id: "B", status: "READY", deps: ["A"], priority: 2, spec: { fnName: "b", kind: "max", examples: [{ args: [2, 3], expect: 3 }] } },
    { id: "C", status: "READY", deps: ["A"], priority: 2, spec: { fnName: "c", kind: "isEven", examples: [{ args: [4], expect: true }] } },
    { id: "D", status: "READY", deps: ["B", "C"], priority: 3, spec: { fnName: "d", kind: "clampNonNegative", examples: [{ args: [-5], expect: 0 }] } },
  ] };
}
function withNovelLotRegister(): any {
  return { version: "native-continuation-defer-demo", items: [
    { id: "NAT1", status: "READY", deps: [], priority: 1, spec: { fnName: "n1", kind: "sum", examples: [{ args: [1, 1], expect: 2 }] } },
    { id: "NOVEL", status: "READY", deps: [], priority: 1, spec: { fnName: "nv", kind: "a-novel-kind-not-in-catalog", examples: [] } },
    { id: "NAT2", status: "READY", deps: [], priority: 2, spec: { fnName: "n2", kind: "absMinor", examples: [{ args: [-7], expect: 7 }] } },
    { id: "DEPNOVEL", status: "READY", deps: ["NOVEL"], priority: 3, spec: { fnName: "dn", kind: "max", examples: [{ args: [1, 2], expect: 2 }] } },
  ] };
}

/** demonstrate(now) -> two scenarios proving real native continuation + honest defer. now injectable for determinism. */
function demonstrate(now?: any): any {
  const clk = typeof now === "function" ? now : (() => { let t = 0; return () => (t += 1000); })();
  const full = runNativeMissionCampaign({ register: allNativeRegister(), now: clk });
  const defer = runNativeMissionCampaign({ register: withNovelLotRegister(), now: clk });
  return Object.freeze({
    allNativeContinues: Object.freeze({
      stopped: full.stopped, completed: full.completed, allOdg: full.allCompletedAreOdg,
      proven: full.campaignComplete === true && full.completed.length === 4 && full.allCompletedAreOdg === true,
    }),
    novelDefersWithoutFreezing: Object.freeze({
      stopped: defer.stopped, completed: defer.completed, provenanceByLot: defer.provenanceByLot,
      // NAT1 + NAT2 execute natively (ODG); NOVEL defers to provider (BLOCKED); DEPNOVEL can't run (dep blocked) ⇒
      // loop stops IDLE_BLOCKED (not COMPLETED) — honest: a provider-dependent mission is unfinished.
      proven: defer.completed.includes("NAT1") && defer.completed.includes("NAT2") && !defer.completed.includes("NOVEL") && !defer.completed.includes("DEPNOVEL") && defer.stopped === "IDLE_BLOCKED",
    }),
  });
}

const NATIVE_MISSION_CONTINUATION_CONTRACT = Object.freeze({
  id: "V326-NATIVE-MISSION-CONTINUATION",
  purpose: "§9 — drive the PROVEN continuation engine (campaign-loop) with REAL ODG-native execution + genuine provenance, proving selection→native-execution→result/provenance→dependency-recompute→next-selection→continuation (not a stub, not planning)",
  reuses: Object.freeze(["campaign-loop.runCampaignLoop + campaign-controller (EXISTING continuation engine — NOT reimplemented)", "odg-native-engineering.runNativeCycle (real ODG-native execution)", "odg-native-execution-provenance (genuine actor=ODG resolution, #761)"]),
  invariants: Object.freeze([
    "ACCEPTED ONLY when the native cycle reached green AND actor-provenance resolves actor=ODG — never a stub/planning accept",
    "a novel (out-of-catalog) kind honestly DEFERS (WAITING_FOR_PROVIDER ⇒ BLOCKED) and never freezes independent native lots; the campaign is then IDLE_BLOCKED (not COMPLETED) — a provider-dependent mission is unfinished",
    "every COMPLETED lot carries actor=ODG (acceptance is gated on it) — allCompletedAreOdg is an honest cross-check",
    "builds NO second scheduler/queue/engine and no 10th primitive — wires three existing, tested components",
    "cross-session resident DRIVER remains OWNER_GATED (per odg-continuation-diagnostic) — this is the WITHIN-run real-execution lifecycle, not a resident process",
    "register is MUTATED in place by the loop (fresh register per run); deterministic given an injected clock",
  ]),
});

module.exports = { executeNativeLot, runNativeMissionCampaign, demonstrate, allNativeRegister, withNovelLotRegister, NATIVE_MISSION_CONTINUATION_CONTRACT };
export {};
