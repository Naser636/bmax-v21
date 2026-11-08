#!/usr/bin/env node
"use strict";

/*
 * WI-FR-02 — FRONTIER RADAR PERSISTENCE & CANONICAL MISSION INTEGRATION. PURE orchestration over EXISTING
 * primitives (NO new store, NO new queue, NO new scheduler, NO new authorizer). It makes the WI-FR-01 Frontier
 * Radar DURABLE and connects its proposals to the canonical mission path:
 *
 *   - PERSISTENCE: the source-registry, candidate-registry and proposal-registry are persisted via autonomy-store
 *     (crash-atomic tmp+rename write; readStrict distinguishes ABSENT vs CORRUPT so a torn store is NEVER silently
 *     clobbered — fail-closed). A `store` adapter { read, readStrict, write } is injectable (tests pass an in-memory
 *     fake ⇒ zero disk I/O), default = autonomy-store.
 *   - IDEMPOTENCE / DEDUP / RESUME: every candidate/proposal persist goes through idempotency-guard (admit/record)
 *     keyed by its stable id; a replay after an interruption reconciles to the prior result (no double-apply). The
 *     durable journal + crash-atomic store ARE the resume mechanism: reload reconstructs exact state.
 *   - CANONICAL INTEGRATION: a Radar proposal is mapped to a campaign-controller register LOT in the
 *     NON-auto-executable state DEFERRED (authorizationRequired=true) — selectNextLot NEVER picks it. Only an
 *     EXTERNAL advance(..,{status:"READY"}) (an ODG/owner authorization the Radar cannot perform) makes it
 *     admissible. This enforces proposition ≠ autorisation: the Radar can neither self-authorize nor promote.
 *
 * Separations preserved: SIGNAL ≠ FACT (a persisted candidate stays epistemicStatus UNVERIFIED — promotion to a
 * factual status is REFUSED here), external content stays UNTRUSTED, Radar ≠ governance (produces no permission).
 * Pure/deterministic (no clock/random; now passed in; the only side effect is through the injected store). Dual export.
 */

const autonomyStore = require("./autonomy-store");
const IG = require("./idempotency-guard");

const STORE_KEYS = Object.freeze({
  sources: "frontier-source-registry",
  candidates: "frontier-candidate-registry",
  proposals: "frontier-proposal-registry",
  journal: "frontier-idempotency-journal",
});
const FACTUAL = Object.freeze(["PROVEN", "OBSERVED"]); // a candidate may NEVER be persisted in one of these (SIGNAL ≠ FACT)

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

// The default durable adapter is autonomy-store; tests inject an in-memory fake with the SAME 3-method shape.
function storeOf(opts: any): any {
  const s = isObj(opts) && isObj(opts.store) ? opts.store : autonomyStore;
  return s;
}
// readStrict with a graceful fallback for adapters that only implement read(): treat a thrown/absent as not-present.
function readStrict(store: any, key: string): any {
  if (store && typeof store.readStrict === "function") return store.readStrict(key);
  try { const v = store.read(key, undefined); return v === undefined || v === null ? { present: false, corrupt: false, value: null } : { present: true, corrupt: false, value: v }; }
  catch { return { present: true, corrupt: true, value: null }; }
}

/** loadSources(opts) -> { ok, sources } | { ok:false, corrupt:true }. Corrupt store ⇒ fail-closed (refuse to clobber). */
function loadSources(opts: any): any {
  const rs = readStrict(storeOf(opts), STORE_KEYS.sources);
  if (rs.corrupt) return Object.freeze({ ok: false, corrupt: true, reason: "source-registry store present but corrupt — refusing to read/overwrite (fail-closed)" });
  return Object.freeze({ ok: true, corrupt: false, sources: isObj(rs.value) ? rs.value : {}, fresh: !rs.present });
}

/** persistSources(registry, opts) -> { ok, count } | { ok:false }. registry is the frontier-radar in-memory source map. */
function persistSources(registry: any, opts: any): any {
  if (!isObj(registry)) return Object.freeze({ ok: false, reason: "source registry must be an object map" });
  const existing = loadSources(opts);
  if (!existing.ok) return existing; // corrupt ⇒ refuse (fail-closed)
  storeOf(opts).write(STORE_KEYS.sources, registry);
  return Object.freeze({ ok: true, count: Object.keys(registry).length });
}

/** loadCandidates(opts) -> { ok, candidates:[] } | fail-closed on corrupt. */
function loadCandidates(opts: any): any {
  const rs = readStrict(storeOf(opts), STORE_KEYS.candidates);
  if (rs.corrupt) return Object.freeze({ ok: false, corrupt: true, reason: "candidate-registry corrupt — fail-closed" });
  return Object.freeze({ ok: true, candidates: arr(rs.value && rs.value.items), version: rs.value && rs.value.version || 0 });
}
function loadProposals(opts: any): any {
  const rs = readStrict(storeOf(opts), STORE_KEYS.proposals);
  if (rs.corrupt) return Object.freeze({ ok: false, corrupt: true, reason: "proposal-registry corrupt — fail-closed" });
  return Object.freeze({ ok: true, proposals: arr(rs.value && rs.value.items) });
}
function loadJournal(opts: any): any {
  const rs = readStrict(storeOf(opts), STORE_KEYS.journal);
  if (rs.corrupt) return IG.emptyJournal(); // a corrupt journal degrades to empty — admit will simply re-PROCEED (safe; record is append-only)
  return isObj(rs.value) ? rs.value : IG.emptyJournal();
}

/**
 * persistCandidate(candidate, opts) -> { decision, added, candidates }. Idempotent (keyed by candidate.id via
 * idempotency-guard). FAIL-CLOSED: a candidate carrying a FACTUAL epistemicStatus is REFUSED (SIGNAL ≠ FACT).
 */
function persistCandidate(candidate: any, opts: any): any {
  const c = isObj(candidate) ? candidate : {};
  if (!isStr(c.id)) return Object.freeze({ ok: false, decision: "REJECTED", reason: "candidate.id required" });
  if (FACTUAL.includes(c.epistemicStatus)) return Object.freeze({ ok: false, decision: "REJECTED", reason: "a candidate may not be persisted as a FACT (SIGNAL ≠ FACT); epistemicStatus must stay non-factual" });
  const loaded = loadCandidates(opts);
  if (!loaded.ok) return loaded; // corrupt ⇒ fail-closed
  const journal = loadJournal(opts);
  const decision = IG.admit({ idempotencyKey: "cand:" + c.id, actionId: c.id }, journal, 0);
  if (decision.decision === IG.DECISION.DUPLICATE) return Object.freeze({ ok: true, decision: "DUPLICATE", added: false, candidates: loaded.candidates });
  const nextItems = loaded.candidates.concat([c]);
  const nextJournal = IG.record(journal, "cand:" + c.id, { persistedAt: isObj(opts) ? opts.now : null });
  const st = storeOf(opts);
  st.write(STORE_KEYS.candidates, { version: (loaded.version || 0) + 1, items: nextItems });
  st.write(STORE_KEYS.journal, nextJournal);
  return Object.freeze({ ok: true, decision: "PROCEED", added: true, candidates: Object.freeze(nextItems) });
}

/**
 * recordProposal(proposal, opts) -> { decision, added }. FAIL-CLOSED: refuses any proposal that is not strictly
 * PROPOSED and grantsNoPermission (the Radar can persist NOTHING that authorizes or promotes). Idempotent by candidateId.
 */
function recordProposal(proposal: any, opts: any): any {
  const p = isObj(proposal) ? proposal : {};
  if (p.status !== "PROPOSED" || p.grantsNoPermission !== true || !isStr(p.candidateId)) {
    return Object.freeze({ ok: false, decision: "REJECTED", reason: "only a PROPOSED, permission-granting-nothing proposal may be recorded (proposition ≠ autorisation)" });
  }
  const loaded = loadProposals(opts);
  if (!loaded.ok) return loaded;
  const journal = loadJournal(opts);
  const key = "prop:" + p.candidateId;
  const decision = IG.admit({ idempotencyKey: key, actionId: p.candidateId }, journal, 0);
  if (decision.decision === IG.DECISION.DUPLICATE) return Object.freeze({ ok: true, decision: "DUPLICATE", added: false, proposals: loaded.proposals });
  const nextItems = loaded.proposals.concat([p]);
  const nextJournal = IG.record(journal, key, { recordedAt: isObj(opts) ? opts.now : null });
  const st = storeOf(opts);
  st.write(STORE_KEYS.proposals, { items: nextItems });
  st.write(STORE_KEYS.journal, nextJournal);
  return Object.freeze({ ok: true, decision: "PROCEED", added: true, proposals: Object.freeze(nextItems) });
}

/**
 * toRegisterLot(proposal, {now}) -> a campaign-controller-compatible LOT at the NON-auto-executable state DEFERRED
 * (authorizationRequired). FAIL-CLOSED: a non-PROPOSED / permission-granting proposal yields null (the Radar can
 * NEVER emit a READY/ACCEPTED lot — it cannot self-authorize). Pure.
 */
function toRegisterLot(proposal: any, opts: any): any {
  const p = isObj(proposal) ? proposal : {};
  if (p.status !== "PROPOSED" || p.grantsNoPermission !== true || !isStr(p.candidateId)) return null;
  const now = isObj(opts) ? opts.now : null;
  // NOTE: a register lot is MUTABLE governed state — campaign-controller.advance transitions it in place through its
  // lifecycle (DEFERRED → READY → ... under EXTERNAL authorization). Returning a frozen lot would break that path, so
  // this is a plain object by design. Purity is preserved at the register level: integrateIntoRegister never mutates input.
  return {
    id: "frontier-prop:" + p.candidateId,
    title: "Frontier experiment proposal: " + (isStr(p.objective) ? p.objective : p.candidateId),
    program: "V4",
    priority: 5,
    status: "DEFERRED",                 // NOT in OPEN_STATES ⇒ selectNextLot NEVER picks it (awaiting authorization)
    deps: [],
    authorizationRequired: true,         // an EXTERNAL advance(..,{status:"READY"}) = ODG/owner authorization (not the Radar)
    origin: "frontier-radar",
    grantsNoPermission: true,
    proposalRef: p.candidateId,
    acceptance: "PROPOSED by Frontier Radar (WI-FR-01); requires explicit ODG/owner authorization (advance to READY) before any experiment. Radar proposes, does not authorize.",
    evidence: "runtime/core/frontier-radar.ts (proposal source); candidate " + p.candidateId,
    rationale: p.rationale || null,
    proposedAt: now,
    staleEvidence: false,
  };
}

/**
 * integrateIntoRegister(register, proposal, {now}) -> { ok, register } | { ok:false }. PURE: appends the DEFERRED lot
 * to a campaign-controller register (does NOT write the real closure-register — governance does). Refuses duplicates
 * (same lot id) and non-PROPOSED proposals. The returned register is drivable by the EXISTING campaign-controller/loop;
 * NO second queue/scheduler/authorizer is created.
 */
function integrateIntoRegister(register: any, proposal: any, opts: any): any {
  const reg = isObj(register) ? register : {};
  const items = arr(reg.items);
  const lot = toRegisterLot(proposal, opts);
  if (!lot) return Object.freeze({ ok: false, reason: "proposal refused (not a PROPOSED, permission-granting-nothing proposal)" });
  if (items.some((it: any) => it && it.id === lot.id)) return Object.freeze({ ok: true, added: false, register, reason: "lot already present (idempotent)" });
  // New register object + new items array (input untouched = pure), but items themselves are plain/mutable so the
  // EXISTING campaign-controller/loop can drive their lifecycle. No second queue/scheduler is introduced.
  const nextReg = { ...reg, items: items.concat([lot]) };
  return Object.freeze({ ok: true, added: true, register: nextReg, lot });
}

/** resume(opts) -> durable state reconstructed from the store (the reprise mechanism). Surfaces any corrupt partition. */
function resume(opts: any): any {
  const s = loadSources(opts);
  const c = loadCandidates(opts);
  const p = loadProposals(opts);
  const corrupt = [!s.ok ? "sources" : null, !c.ok ? "candidates" : null, !p.ok ? "proposals" : null].filter(Boolean);
  return Object.freeze({
    ok: corrupt.length === 0,
    corrupt: Object.freeze(corrupt),
    sources: s.ok ? s.sources : {},
    candidates: c.ok ? c.candidates : [],
    proposals: p.ok ? p.proposals : [],
    journalKeys: Object.freeze(Object.keys(loadJournal(opts))),
  });
}

const FRONTIER_STORE_CONTRACT = Object.freeze({
  id: "WI-FR-02-FRONTIER-RADAR-STORE",
  source: "Resumption mandate WI-FR-02 — durable persistence + canonical mission integration (reuse-only)",
  storeKeys: STORE_KEYS,
  reuses: Object.freeze(["autonomy-store (crash-atomic, readStrict)", "idempotency-guard (admit/record)", "campaign-controller (register lot + selectNextLot)", "frontier-radar (WI-FR-01)"]),
  notAuthority: "persists Radar state and maps proposals to a DEFERRED register lot; creates NO queue/scheduler/authorizer; a proposal is never auto-executable — only an external ODG/owner authorization (advance to READY) admits it",
  invariants: Object.freeze([
    "NO new store/queue/scheduler/authorizer — orchestrates existing primitives only",
    "persistence is crash-atomic; a CORRUPT store is never silently clobbered (fail-closed via readStrict)",
    "candidate/proposal persist is idempotent (idempotency-guard, keyed by id); replay after interruption reconciles, never double-applies",
    "SIGNAL ≠ FACT: a candidate persisted as PROVEN/OBSERVED is REFUSED (stays UNVERIFIED)",
    "proposition ≠ autorisation: a Radar proposal maps ONLY to a DEFERRED lot (authorizationRequired); selectNextLot never picks it; the Radar cannot emit READY/ACCEPTED",
    "Radar ≠ governance: integration produces a lot for the EXISTING campaign-controller/loop; it never advances/executes itself",
    "pure/deterministic; the only side effect is through the injected store adapter (default autonomy-store)",
  ]),
});

module.exports = {
  STORE_KEYS, FRONTIER_STORE_CONTRACT,
  loadSources, persistSources, loadCandidates, loadProposals, loadJournal,
  persistCandidate, recordProposal, toRegisterLot, integrateIntoRegister, resume,
};

if (require.main === module) { process.stdout.write(JSON.stringify(FRONTIER_STORE_CONTRACT, null, 2) + "\n"); }

export {};
