#!/usr/bin/env node
"use strict";
const assert = require("assert");
const S = require("./frontier-radar-store");
const R = require("./frontier-radar");
const CC = require("./campaign-controller");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("WI-FR-02 — FRONTIER RADAR STORE (persistence + canonical integration)");

// In-memory store adapter with the SAME { read, readStrict, write } shape as autonomy-store (zero disk I/O).
function fakeStore(): any {
  const m = new Map();
  return {
    read: (name: string, fb: any) => (m.has(name) ? m.get(name) : (fb === undefined ? null : fb)),
    readStrict: (name: string) => {
      if (!m.has(name)) return { present: false, corrupt: false, value: null };
      const v = m.get(name);
      if (v === "__CORRUPT__") return { present: true, corrupt: true, value: null };
      return { present: true, corrupt: false, value: v };
    },
    write: (name: string, obj: any) => { m.set(name, obj); return obj; },
    _corrupt: (name: string) => m.set(name, "__CORRUPT__"),
    _has: (name: string) => m.has(name),
  };
}
const allowedUrl = "https://api.ted.europa.eu/v3/notices/search";
function realCandidate(opts?: any): any {
  const sig = R.normalizeSignal({ title: (opts && opts.title) || "Faster parser", categories: ["parsing"], claims: ["2x"] }, { sourceId: "ted" });
  const q = R.qualify(sig, { sourceReliability: 0.9, impactHint: 0.9, baseline: { focusAreas: ["parsing"], crossChecked: true } });
  return R.toCandidate(sig, q, { now: 1 });
}
function realProposal(): any {
  const cand = realCandidate();
  const gap = R.compareWithOdg(cand, { capabilities: [] });
  return R.toMissionProposal(cand, gap, { now: 1 });
}

// (1) PERSISTENCE roundtrip — sources.
{
  const store = fakeStore();
  const reg = R.registerSource({}, { id: "ted", owner: "EU", url: allowedUrl, type: "api", reliability: 0.9 }, { now: 1 }).registry;
  const fresh = S.loadSources({ store });
  check(fresh.ok === true && fresh.fresh === true, "loadSources on empty store ⇒ fresh");
  const p = S.persistSources(reg, { store });
  check(p.ok === true && p.count === 1, "persistSources writes the source registry");
  check(S.loadSources({ store }).sources.ted.owner === "EU", "loadSources reads back the persisted source");
}

// (2) CANDIDATE idempotence + (3) SIGNAL ≠ FACT refusal.
{
  const store = fakeStore();
  const cand = realCandidate();
  const first = S.persistCandidate(cand, { store, now: 2 });
  check(first.ok === true && first.decision === "PROCEED" && first.added === true, "first persistCandidate ⇒ PROCEED (added)");
  const dup = S.persistCandidate(cand, { store, now: 2 });
  check(dup.decision === "DUPLICATE" && dup.added === false && S.loadCandidates({ store }).candidates.length === 1, "same candidate id again ⇒ DUPLICATE (idempotent, one entry)");
  const asFact = S.persistCandidate({ id: "x", epistemicStatus: "PROVEN" }, { store });
  check(asFact.ok === false && asFact.decision === "REJECTED" && /FACT/.test(asFact.reason), "candidate persisted as PROVEN/OBSERVED ⇒ REJECTED (SIGNAL ≠ FACT)");
}

// (4) PROPOSAL fail-closed: proposition ≠ autorisation.
{
  const store = fakeStore();
  const good = S.recordProposal(realProposal(), { store, now: 3 });
  check(good.ok === true && good.decision === "PROCEED", "a PROPOSED, permission-granting-nothing proposal is recorded");
  const tampered = { ...realProposal(), status: "AUTHORIZED" };
  check(S.recordProposal(tampered, { store }).decision === "REJECTED", "a proposal tampered to AUTHORIZED ⇒ REJECTED (Radar cannot authorize)");
  const grants = { ...realProposal(), grantsNoPermission: false };
  check(S.recordProposal(grants, { store }).decision === "REJECTED", "a proposal that would grant permission ⇒ REJECTED");
  // (5) proposal idempotence
  check(S.recordProposal(realProposal(), { store }).decision === "DUPLICATE", "same proposal again ⇒ DUPLICATE (idempotent)");
}

// (6) toRegisterLot: PROPOSED ⇒ DEFERRED lot; tampered ⇒ null (cannot emit READY/ACCEPTED).
{
  const lot = S.toRegisterLot(realProposal(), { now: 4 });
  check(lot && lot.status === "DEFERRED" && lot.authorizationRequired === true && lot.grantsNoPermission === true, "toRegisterLot ⇒ DEFERRED lot, authorizationRequired, grants no permission");
  check(S.toRegisterLot({ ...realProposal(), status: "AUTHORIZED" }, {}) === null, "a non-PROPOSED proposal ⇒ no lot (null)");
}

// (7) CANONICAL INTEGRATION — the Radar lot is NEVER auto-selected; only an EXTERNAL authorization (advance→READY) admits it.
{
  const base = { items: [] };
  const r = S.integrateIntoRegister(base, realProposal(), { now: 5 });
  check(r.ok === true && r.added === true && r.register.items.length === 1, "integrateIntoRegister appends the DEFERRED lot");
  check(base.items.length === 0, "input register NOT mutated (pure at register level)");
  const sel = CC.selectNextLot(r.register);
  check(sel.lot === null, "selectNextLot NEVER selects the DEFERRED Radar lot (proposition ≠ autorisation)");
  // EXTERNAL authorization the Radar cannot perform: advance DEFERRED → READY, then it becomes admissible.
  const adv = CC.advance(r.register, "frontier-prop:" + realProposal().candidateId, { status: "READY" });
  check(adv.ok === true, "an external ODG/owner authorization advances the lot DEFERRED → READY");
  const sel2 = CC.selectNextLot(r.register);
  check(sel2.lot && sel2.lot.id === "frontier-prop:" + realProposal().candidateId, "after authorization the lot is selectable by the EXISTING campaign-controller (no second scheduler)");
  // idempotent integration
  check(S.integrateIntoRegister(r.register, realProposal(), {}).added === false, "integrating the same proposal twice ⇒ idempotent (no duplicate lot)");
}

// (8) RESUME after interruption — durable state reconstructed; journal survives (no double-apply on replay).
{
  const store = fakeStore();
  S.persistSources(R.registerSource({}, { id: "ted", owner: "EU", url: allowedUrl, type: "api", reliability: 0.9 }, {}).registry, { store });
  S.persistCandidate(realCandidate(), { store, now: 6 });
  S.recordProposal(realProposal(), { store, now: 6 });
  const resumed = S.resume({ store });
  check(resumed.ok === true && Object.keys(resumed.sources).length === 1 && resumed.candidates.length === 1 && resumed.proposals.length === 1, "resume() reconstructs sources+candidates+proposals from the durable store");
  check(resumed.journalKeys.length >= 2, "idempotency journal is durable (survives the simulated restart)");
  // replay AFTER restart (same store) ⇒ reconciled DUPLICATE, not a double entry
  check(S.persistCandidate(realCandidate(), { store }).decision === "DUPLICATE", "replay of a persisted candidate after restart ⇒ DUPLICATE (no double-apply)");
}

// (9) FAIL-CLOSED on a corrupt (torn) store — never clobber.
{
  const store = fakeStore();
  store._corrupt(S.STORE_KEYS.sources);
  const ls = S.loadSources({ store });
  check(ls.ok === false && ls.corrupt === true, "corrupt source store ⇒ loadSources fail-closed");
  check(S.persistSources({ ted: {} }, { store }).ok === false, "persistSources REFUSES to overwrite a corrupt store (no silent clobber)");
  store._corrupt(S.STORE_KEYS.candidates);
  check(S.resume({ store }).corrupt.includes("sources") && S.resume({ store }).corrupt.includes("candidates"), "resume() surfaces every corrupt partition");
}

// (10) determinism / non-regression: toRegisterLot is a pure function of its input.
check(JSON.stringify(S.toRegisterLot(realProposal(), { now: 7 })) === JSON.stringify(S.toRegisterLot(realProposal(), { now: 7 })), "toRegisterLot deterministic");

console.log(failures === 0 ? "ALL PASS — WI-FR-02 FRONTIER RADAR STORE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
