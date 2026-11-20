#!/usr/bin/env node
"use strict";
/*
 * V327 §2 — EXECUTION ROUTING. PURE, deterministic, fail-closed. Makes the REAL calibrated-P(success) signal CHANGE
 * native selection decisions — WITHOUT a second orchestrator: it adjusts each candidate's `priority` from the signal and
 * then REUSES campaign-controller.selectNextLot for the actual pick (same layering/deps/no-repeat gates; only the
 * priority tie-break is informed by calibrated evidence).
 *
 * Per mission-type, odg-calibrated-psuccess.derivePsuccess yields a verdict over REAL observed outcomes:
 *   - CALIBRATED & pForPlanner ≥ NATIVE_THRESHOLD  ⇒ tier NATIVE_LOCAL   (trust native local-model execution ⇒ prefer).
 *   - CALIBRATED & pForPlanner <  NATIVE_THRESHOLD  ⇒ tier ESCALATE_PROVIDER (calibrated evidence of low native success
 *       ⇒ route AWAY from native, deprioritise the native attempt). Escalation is driven ONLY by CALIBRATED evidence.
 *   - NOT CALIBRATED (thin/biased/unknown)          ⇒ tier NATIVE_PROBE   (insufficient evidence ⇒ attempt natively to
 *       GATHER data; NEVER escalate on no evidence, NEVER deprioritise on a flattering/biased rate). No priority change.
 * Decisions therefore change ONLY when the data justifies it (a CALIBRATED verdict); thin/empty history ⇒ selectNextLot's
 * baseline is preserved exactly. No network/clock/randomness; builds NO registry/engine; the estimate AUTHORIZES NOTHING.
 */

const CP = require("./odg-calibrated-psuccess.js");
const CC = require("./campaign-controller.js");

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

const TIER = Object.freeze({ NATIVE_LOCAL: "NATIVE_LOCAL", ESCALATE_PROVIDER: "ESCALATE_PROVIDER", NATIVE_PROBE: "NATIVE_PROBE" });
const NATIVE_THRESHOLD = 0.5;
// Priority deltas (lower priority = selected earlier by selectNextLot). Prefer a calibrated-reliable type; deprioritise a
// calibrated-unreliable one so a sibling native candidate is chosen instead; leave un-calibrated candidates untouched.
const DELTA = Object.freeze({ NATIVE_LOCAL: -1, ESCALATE_PROVIDER: 100, NATIVE_PROBE: 0 });

/** routeType(missionType, history, opts) -> { missionType, tier, quality, pForPlanner, priorityDelta, reason }. */
function routeType(missionType: any, history: any, opts: any = {}): any {
  const d = CP.derivePsuccess(missionType, Array.isArray(history) ? history : [], isObj(opts) ? opts : {});
  let tier: string;
  if (d.quality === "CALIBRATED") tier = (d.pForPlanner != null && d.pForPlanner >= NATIVE_THRESHOLD) ? TIER.NATIVE_LOCAL : TIER.ESCALATE_PROVIDER;
  else tier = TIER.NATIVE_PROBE;
  return freeze({
    missionType: missionType == null ? null : missionType,
    tier, quality: d.quality, pForPlanner: d.pForPlanner, observations: d.observations,
    priorityDelta: DELTA[tier as keyof typeof DELTA],
    authorizes: false,
    reason: tier === TIER.NATIVE_LOCAL ? `calibrated P=${d.pForPlanner} ≥ ${NATIVE_THRESHOLD} ⇒ trust native local-model execution (prefer)`
      : tier === TIER.ESCALATE_PROVIDER ? `calibrated P=${d.pForPlanner} < ${NATIVE_THRESHOLD} ⇒ native unreliable, escalate to provider (deprioritise native)`
      : `no CALIBRATED evidence (${d.quality}) ⇒ probe natively to gather data; never escalate/deprioritise on insufficient/biased evidence`,
  });
}

/**
 * prioritizeAndSelect(register, history, opts) -> { baselineSelected, routedSelected, changed, routing[], note }.
 * Computes a routed COPY of the register (per-candidate priority adjusted by routeType, keyed on item.missionType|id),
 * then calls the EXISTING selectNextLot on both the original and the routed register. `changed` is whether the routed
 * selection differs from the baseline — i.e. the calibrated signal actually changed the decision.
 */
function prioritizeAndSelect(register: any, history: any, opts: any = {}): any {
  if (!isObj(register) || !Array.isArray(register.items)) return freeze({ ok: false, code: "BAD_REGISTER", detail: "register { items[] } required" });
  const routing: any[] = [];
  const routedItems = register.items.map((it: any) => {
    const type = it && typeof it.missionType === "string" ? it.missionType : (it && it.id);
    const r = routeType(type, history, opts);
    routing.push(freeze({ id: it && it.id, missionType: type, tier: r.tier, quality: r.quality, pForPlanner: r.pForPlanner, priorityDelta: r.priorityDelta }));
    return { ...it, priority: (typeof it.priority === "number" ? it.priority : 999) + r.priorityDelta, routedTier: r.tier };
  });
  const baseline = CC.selectNextLot(register);
  const routed = CC.selectNextLot(freeze({ ...register, items: routedItems }));
  const baselineSelected = baseline && baseline.lot ? baseline.lot.id : null;
  const routedSelected = routed && routed.lot ? routed.lot.id : null;
  return freeze({
    ok: true,
    baselineSelected, routedSelected,
    changed: baselineSelected !== routedSelected,
    routedTier: routed && routed.lot ? routed.lot.routedTier : null,
    routing: freeze(routing),
    note: "selection REUSES campaign-controller.selectNextLot on a priority-adjusted register copy; the calibrated signal changes the decision ONLY when a CALIBRATED verdict justifies it (thin/biased/unknown ⇒ no change, baseline preserved). Routing AUTHORIZES NOTHING; it informs native-vs-escalate + priority only.",
  });
}

const EXECUTION_ROUTING_CONTRACT = Object.freeze({
  id: "V327-EXECUTION-ROUTING",
  purpose: "§2 — make the REAL calibrated-P(success) signal change native selection decisions by adjusting priority and REUSING campaign-controller.selectNextLot (no second orchestrator); escalate ONLY on CALIBRATED evidence of low native success",
  tiers: TIER,
  reuses: Object.freeze(["campaign-controller.selectNextLot (the canonical selector — reused, not replaced)", "odg-calibrated-psuccess.derivePsuccess (CALIBRATED/BIASED/DEGRADED/UNKNOWN verdict — not reimplemented)"]),
  invariants: Object.freeze([
    "decisions change ONLY on a CALIBRATED verdict; thin/biased/unknown ⇒ NATIVE_PROBE ⇒ no priority change ⇒ selectNextLot baseline preserved exactly",
    "escalation is driven ONLY by CALIBRATED evidence of low native success (P < threshold); never escalate on no/insufficient/biased evidence",
    "REUSES selectNextLot on a priority-adjusted register COPY — builds NO second selector/orchestrator/registry; same layer/deps/no-repeat gates",
    "routing AUTHORIZES NOTHING (informs native-vs-escalate + priority only); a plan/estimate is not a result",
    "PURE/deterministic/frozen; fail-closed on a bad register",
  ]),
});

module.exports = { routeType, prioritizeAndSelect, TIER, NATIVE_THRESHOLD, EXECUTION_ROUTING_CONTRACT };
export {};
