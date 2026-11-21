#!/usr/bin/env node
"use strict";
/*
 * V360 Chantier B (C2 cognitive reasoning) — DECOMPOSITION → SELECTION chain. PURE, deterministic, select-only. The C2 audit
 * found mission-decomposer DORMANT (no consumer): it splits a parent mission into standard sub-missions
 * (implementation/tests/evidence/dossier/sign-off) classified ALREADY_DONE | LOCAL_REMAINING | SIGN_OFF_GATED — a real
 * capability with no operational consumer. This closes the rupture by routing the result to the NEXT link: the canonical
 * selector. It feeds the LOCAL_REMAINING (Level-A executable) sub-missions to campaign-controller.selectNextLot and returns
 * the selected next sub-mission, so the decomposition is demonstrably consumed. No second scheduler / registry / decomposer.
 *
 * SAFETY: SELECT-ONLY (it executes nothing — execution stays governed). SIGN_OFF_GATED sub-missions are RESERVED (human /
 * controller lock) and are NEVER offered to the selector. ALREADY_DONE (evidence-qualified) sub-missions are not re-selected.
 * mission-decomposer fabricates no completion (ALREADY_DONE requires a resolving evidence pointer) — that discipline is kept.
 */

const DEC = require("./mission-decomposer.js");
const CC = require("./campaign-controller.js");

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

/**
 * decomposeAndSelect(parent, control?) -> { parent, subMissions, executable, signOffGated, alreadyDone, selected, note }.
 * control: { qualify?(ref)->"VALID"|..., resolve?(ref)->bool } (mission-decomposer's evidence oracle). LOCAL_REMAINING →
 * campaign-controller.selectNextLot (the canonical selector); SIGN_OFF_GATED reserved (never selected); select-only.
 */
function decomposeAndSelect(parent: any, control: any = {}): any {
  if (!isObj(parent) || typeof parent.id !== "string") return freeze({ ok: false, code: "BAD_PARENT", detail: "parent mission with a string id required (fail-closed)" });
  const d = DEC.decompose(parent, isObj(control) ? control : {});
  const localRemaining = arr(d.localRemaining);   // mission-decomposer returns arrays of sub-mission IDs (strings)
  const alreadyDone = arr(d.subMissions).filter((s: any) => s && s.status === "ALREADY_DONE").map((s: any) => s.id);
  // route the executable sub-missions (Level-A) to the canonical selector (NOT a new scheduler); SIGN_OFF_GATED are excluded.
  const items = localRemaining.map((id: any) => ({ id, status: "READY", deps: [], layer: "A" }));
  const selection = items.length > 0 ? CC.selectNextLot({ items }) : { lot: null, reason: "no LOCAL_REMAINING sub-mission (all done or sign-off-gated)" };
  return freeze({
    ok: true, parent: parent.id,
    subMissions: freeze(arr(d.subMissions).map((s: any) => freeze({ id: s.id, name: s.name, status: s.status }))),
    executable: freeze(localRemaining.slice()),
    signOffGated: freeze(arr(d.signOffGated).slice()),   // reserved: human/controller lock, never auto-selected
    alreadyDone: freeze(alreadyDone),
    selected: selection.lot ? selection.lot.id : null,
    selectionReason: selection.lot ? "canonical selectNextLot chose the next executable sub-mission" : (selection.reason || null),
    note: "C2 decomposition → selection: LOCAL_REMAINING routed to campaign-controller.selectNextLot (canonical selector, no new scheduler); SIGN_OFF_GATED reserved (human lock honored); SELECT-ONLY — execution stays governed",
  });
}

const MISSION_DECOMPOSE_CHAIN_CONTRACT = Object.freeze({
  id: "V360-MISSION-DECOMPOSE-CHAIN",
  purpose: "Chantier B / C2 — give mission-decomposer a real consumer by routing its LOCAL_REMAINING sub-missions to the canonical selector; closes the decomposition→selection rupture without a second scheduler/decomposer",
  reuses: Object.freeze(["mission-decomposer.decompose (parent → classified sub-missions)", "campaign-controller.selectNextLot (the canonical selector — no new scheduler)"]),
  invariants: Object.freeze([
    "SELECT-ONLY: executes nothing (execution stays governed); routes work to the EXISTING selector, creating no second scheduler/registry/decomposer",
    "SIGN_OFF_GATED sub-missions are RESERVED (human/controller lock) and NEVER offered to the selector; ALREADY_DONE are not re-selected",
    "no fabricated completion: ALREADY_DONE requires a resolving evidence pointer (mission-decomposer discipline kept)",
    "PURE/deterministic/frozen; fail-closed on a parent without a string id",
  ]),
});

module.exports = { decomposeAndSelect, MISSION_DECOMPOSE_CHAIN_CONTRACT };
export {};
