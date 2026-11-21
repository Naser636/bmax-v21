#!/usr/bin/env node
"use strict";
/*
 * V360 §1/§6 — RADAR PROPOSALS → GOVERNED DEFERRED LOTS. PURE, deterministic. Completes the Radar path after
 * collection→qualification (#818): qualified frontier-radar PROPOSALS become DURABLE, GOVERNED campaign-controller lots in
 * the DEFERRED state (authorizationRequired=true). It REUSES frontier-radar-store.integrateIntoRegister (the canonical
 * proposal→lot mapping — NO new store/queue/scheduler/authorizer) and PROVES the governance boundary: selectNextLot NEVER
 * picks a DEFERRED lot, so activation (DEFERRED → READY) stays an EXTERNAL ODG/owner authorization the Radar cannot perform.
 *
 * Boundary (honest): this integrates proposals into the register as governed, non-auto-executable lots; it creates NO
 * mission and grants NO permission. Real activation is owner-gated. Idempotent (re-integration ⇒ no duplicate). Fail-closed:
 * a non-PROPOSED / permission-granting object is REFUSED (never becomes a lot).
 */

const STORE = require("./frontier-radar-store.js");
const CC = require("./campaign-controller.js");

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

/**
 * integrateProposals(proposals, register?, opts?) -> { register, deferred[], idempotent[], refused[], selectableNow,
 *   anyDeferredSelectable, note }. Each PROPOSED proposal → a DEFERRED governed lot (via frontier-radar-store). Proves no
 * DEFERRED lot is selectable (activation owner-gated). Idempotent; refuses non-PROPOSED proposals.
 */
function integrateProposals(proposals: any, register: any = {}, opts: any = {}): any {
  const o = isObj(opts) ? opts : {};
  let reg: any = isObj(register) && Array.isArray(register.items) ? { ...register, items: register.items.slice() } : { items: [] };
  const deferred: string[] = [], idempotent: string[] = [], refused: any[] = [];
  for (const p of arr(proposals)) {
    const r = STORE.integrateIntoRegister(reg, p, { now: o.now });
    if (!r.ok) { refused.push(isObj(p) && p.candidateId ? p.candidateId : null); continue; }
    if (r.added === false) { idempotent.push(r.lot ? r.lot.id : (isObj(p) && p.candidateId ? "frontier-prop:" + p.candidateId : null)); continue; }
    reg = r.register; deferred.push(r.lot.id);
  }
  // GOVERNANCE PROOF: the canonical selector must never pick a DEFERRED lot (activation = external authorization).
  const sel = CC.selectNextLot(reg);
  const selectableNow = sel && sel.lot ? sel.lot.id : null;
  const anyDeferredSelectable = selectableNow !== null && deferred.indexOf(selectableNow) >= 0;
  return freeze({
    register: reg, deferred: freeze(deferred), idempotent: freeze(idempotent), refused: freeze(refused),
    selectableNow, anyDeferredSelectable,
    note: "qualified radar proposals integrated as DEFERRED governed lots (authorizationRequired); selectNextLot NEVER picks a DEFERRED lot — activation (DEFERRED→READY) is an EXTERNAL ODG/owner authorization the Radar cannot perform; no mission created, no permission granted",
  });
}

const RADAR_TO_DEFERRED_LOT_CONTRACT = Object.freeze({
  id: "V360-RADAR-TO-DEFERRED-LOT",
  purpose: "§1/§6 — integrate qualified radar proposals into the canonical register as DEFERRED governed lots; completes collection→qualification→governed-integration; activation stays owner-gated",
  reuses: Object.freeze(["frontier-radar-store.integrateIntoRegister (canonical proposal→DEFERRED lot — no new store/queue/scheduler)", "campaign-controller.selectNextLot (proves DEFERRED is never auto-selected)"]),
  invariants: Object.freeze([
    "each PROPOSED proposal → a DEFERRED lot (authorizationRequired=true); a non-PROPOSED/permission-granting object is REFUSED (fail-closed)",
    "selectNextLot NEVER picks a DEFERRED lot ⇒ anyDeferredSelectable is always false (activation = EXTERNAL owner authorization, not the Radar)",
    "creates NO mission, grants NO permission; idempotent (re-integration ⇒ no duplicate lot)",
    "PURE/deterministic/frozen; reuses the canonical store + selector; no second store/queue/scheduler/authorizer",
  ]),
});

module.exports = { integrateProposals, RADAR_TO_DEFERRED_LOT_CONTRACT };
export {};
