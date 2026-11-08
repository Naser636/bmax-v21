#!/usr/bin/env node
"use strict";

/*
 * WI-FR-08 — COMPOUNDING LOOP / global learning. PURE orchestration that COMPOSES existing primitives (NO new store,
 * NO new evaluator, NO new primitive) to close the upper half of the compounding chain:
 *
 *   VERIFIED_RESULT → KNOWLEDGE → REUSABLE_ASSET(validity domain) → TRANSFER_TEST(held-out, no leakage)
 *   → VALIDATED_CAPABILITY → REUSE → MEASURED_COMPOUNDING
 *
 * The lower half already exists and is REUSED: improvement-baseline (measureDelta), reuse-ledger
 * (classifyReuseOutcome grading), memory-taxonomy (consolidation/protection), meta-intelligence (integrity detectors),
 * evidence-provenance (VERIFIED_RESULT gate), idempotency-guard + autonomy-store (durable, idempotent, resumable).
 *
 * Research-backed gates (docs/odg/ODG_GLOBAL_RESEARCH_AND_EXECUTION_READINESS.md §17–§18), all measurement-only:
 *  - NET-VALUE memory gate (Memory Tax / CURATOR): an asset is KEEP-eligible only if benefit − costs ≥ 0.
 *  - HELD-OUT TRANSFER TEST (AIDE² / cross-domain leakage): a capability "compounds" only if it improves a target
 *    whose domain + evidence NEVER entered the source (3-level leakage control); report the generalization gap.
 *  - REWARD-HACKING regression gate (meta-intelligence): in-domain-up / held-out-down, evidence overlap, evaluator ==
 *    builder (self-certification), or a DETECTED integrity signal ⇒ NOT validated.
 *  - REWARD-GATED CONSOLIDATION (SLEEP): promote into protected memory only on measured improvement + no regression +
 *    reversibility. No model weights are trained (that needs a distinct mandate).
 *  - COMPUTE-BUDGET STOP (DGM): the loop halts fail-closed at a declared budget or when marginal yield is exhausted.
 *
 * SIGNAL/synthetic/unverified are never presented as a fact; fail-closed on uncertainty. Pure/deterministic (now +
 * runner injected; the only side effect is the injected store). Dual export.
 */

const BL = require("./improvement-baseline");
const RL = require("./reuse-ledger");
const MEM = require("./memory-taxonomy");
const MI = require("./meta-intelligence");
const IG = require("./idempotency-guard");
const autonomyStore = require("./autonomy-store");

const ASSET_STATE = Object.freeze({ REGISTERED: "REGISTERED", TRANSFER_TESTED: "TRANSFER_TESTED", VALIDATED: "VALIDATED", CONSOLIDATED: "CONSOLIDATED", REJECTED: "REJECTED" });
const CAPABILITY = Object.freeze(["VALIDATED_CAPABILITY", "REJECTED", "INCONCLUSIVE"]);
const STORE_KEYS = Object.freeze({ assets: "compounding-assets", journal: "compounding-journal" });

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function isNum(v: any): boolean { return typeof v === "number" && isFinite(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function num(v: any, d = 0): number { return isNum(v) ? v : d; }
function round(n: number): number { return Number(n.toFixed(6)); }
function storeOf(opts: any): any { return isObj(opts) && isObj(opts.store) ? opts.store : autonomyStore; }

/**
 * registerAsset(spec, {now}) -> { ok, asset } | REJECTED. VERIFIED_RESULT → REUSABLE_ASSET. Fail-closed: an asset MUST
 * carry evidenceRefs + provenance + a validity domain (domainKey/goal/scope) — synthetic/unverified knowledge is NOT a
 * reusable asset. Optional benefit/cost signals feed the net-value gate.
 */
function registerAsset(spec: any, opts: any): any {
  const s = isObj(spec) ? spec : {};
  const now = isObj(opts) ? opts.now : null;
  const d = isObj(s.domain) ? s.domain : null;
  const problems: string[] = [];
  if (!isStr(s.id)) problems.push("asset id required");
  if (!isStr(s.signature)) problems.push("signature required");
  if (arr(s.evidenceRefs).length === 0) problems.push("evidenceRefs required (a synthetic/unverified result is NOT an asset — VERIFIED_RESULT gate)");
  if (!isStr(s.provenance)) problems.push("provenance required");
  if (!d || !isStr(d.domainKey)) problems.push("validity domain {domainKey,goal,scope} required");
  if (problems.length) return Object.freeze({ ok: false, state: ASSET_STATE.REJECTED, problems: Object.freeze(problems) });
  const asset = {
    id: s.id, kind: isStr(s.kind) ? s.kind : "resolution", signature: s.signature,
    domain: Object.freeze({ domainKey: d.domainKey, goal: isStr(d.goal) ? d.goal : null, scope: isStr(d.scope) ? d.scope : null }),
    provenance: s.provenance, evidenceRefs: Object.freeze(arr(s.evidenceRefs).filter(isStr)),
    sourceMissionId: isStr(s.sourceMissionId) ? s.sourceMissionId : null,
    benefit: num(s.benefit), storageCost: num(s.storageCost), retrievalCost: num(s.retrievalCost), maintenanceCost: num(s.maintenanceCost),
    uses: num(s.uses), reliability: num(s.reliability, 1), freshness: num(s.freshness, 1),
    state: ASSET_STATE.REGISTERED, transfer: null, capability: null, consolidated: false,
    createdAt: now, history: [{ at: now, event: "REGISTERED" }],
  };
  return Object.freeze({ ok: true, asset });
}

/** assetNetValue(asset) -> { netValue, keepEligible }. §5.1 Memory-Tax/CURATOR: benefit − (storage+retrieval+maintenance) costs. */
function assetNetValue(asset: any): any {
  const a = isObj(asset) ? asset : {};
  const benefit = num(a.benefit) * num(a.reliability, 1) * num(a.freshness, 1) * (1 + num(a.uses));
  const cost = num(a.storageCost) + num(a.retrievalCost) + num(a.maintenanceCost);
  const netValue = round(benefit - cost);
  return Object.freeze({ netValue, keepEligible: netValue >= 0, benefit: round(benefit), cost: round(cost) });
}

/**
 * transferTest(asset, target, {now}) -> transfer result. §5.3 held-out, 3-level leakage control. target: { domainKey,
 * evidenceRefs?, baseline, after, senseMap?, heldOutDelta?, inDomainDelta? }. LEAKAGE if target domain == source domain
 * OR evidence overlaps ⇒ this is NOT a transfer (fail). Otherwise measure via improvement-baseline + reuse-ledger.
 */
function transferTest(asset: any, target: any, opts: any): any {
  const a = isObj(asset) ? asset : {};
  const t = isObj(target) ? target : {};
  const sourceDomain = a.domain && a.domain.domainKey;
  const sameDomain = isStr(t.domainKey) && t.domainKey === sourceDomain;
  const sharedEvidence = arr(t.evidenceRefs).some((e: any) => arr(a.evidenceRefs).includes(e));
  const leakage = sameDomain || sharedEvidence;
  const delta = BL.measureDelta(isObj(t.baseline) ? t.baseline : {}, isObj(t.after) ? t.after : {}, isObj(t.senseMap) ? t.senseMap : undefined);
  const graded = RL.classifyReuseOutcome(delta);
  const generalizationGap = isNum(t.inDomainDelta) && isNum(t.heldOutDelta) ? round(t.inDomainDelta - t.heldOutDelta) : null;
  const transferred = !leakage && graded.outcome === RL.OUTCOMES.REUSE_VALIDATED;
  return Object.freeze({
    transferred, leakage, sameDomain, sharedEvidence,
    outcome: graded.outcome, measured: graded.measured, reason: leakage ? (sameDomain ? "same domain as source — not a transfer (leakage)" : "shared evidence with source (leakage)") : graded.reason,
    delta: Object.freeze(delta.summary || {}), generalizationGap, targetDomain: t.domainKey || null,
  });
}

/**
 * rewardHackingCheck(input) -> { clean, flags, integrity }. §5.4. input: { integritySignals, inDomainScore, heldOutScore,
 * builder, validator, evidenceOverlap }. Detects metric-gaming (in-domain up / held-out down), leakage, self-certification
 * (builder == validator), and hard integrity (meta-intelligence DETECTED). Fail-closed: any flag ⇒ not clean.
 */
function rewardHackingCheck(input: any): any {
  const i = isObj(input) ? input : {};
  const flags: string[] = [];
  const integrity = MI.assessIntegrity(isObj(i.integritySignals) ? i.integritySignals : {});
  if (integrity.overall === "DETECTED") flags.push("integrity DETECTED (metric-gaming/evaluator-capture/contamination)");
  if (isNum(i.inDomainScore) && isNum(i.heldOutScore) && i.inDomainScore > i.heldOutScore && i.heldOutScore <= 0) flags.push("metric-gaming: in-domain improved while held-out did not");
  if (i.evidenceOverlap === true) flags.push("data leakage: shared evidence between source and target");
  if (isStr(i.builder) && isStr(i.validator) && i.builder === i.validator) flags.push("self-certification: builder == validator (no independent verification)");
  return Object.freeze({ clean: flags.length === 0, flags: Object.freeze(flags), integrity: integrity.overall });
}

/**
 * validateCapability(asset, transfer, rhCheck, netValue) -> { capability, reason }. VALIDATED_CAPABILITY only if the
 * transfer PASSED (held-out, no leakage, measured net improvement) AND reward-hacking clean AND net value ≥ 0. Else
 * REJECTED (leakage / reward-hack) or INCONCLUSIVE (not measured). Fail-closed. No self-certification.
 */
function validateCapability(asset: any, transfer: any, rhCheck: any, netValue: any): any {
  const t = isObj(transfer) ? transfer : {};
  const rh = isObj(rhCheck) ? rhCheck : {};
  const nv = isObj(netValue) ? netValue : {};
  if (t.leakage === true || rh.clean === false) return Object.freeze({ capability: "REJECTED", reason: t.leakage ? "transfer leakage" : "reward-hacking: " + arr(rh.flags).join("; ") });
  if (!t.measured) return Object.freeze({ capability: "INCONCLUSIVE", reason: "transfer not measurable (fail-closed)" });
  if (!t.transferred) return Object.freeze({ capability: "REJECTED", reason: "no net held-out improvement (" + t.reason + ")" });
  if (nv.keepEligible === false) return Object.freeze({ capability: "REJECTED", reason: "negative net value (not worth keeping)" });
  return Object.freeze({ capability: "VALIDATED_CAPABILITY", reason: "held-out transfer measured + no leakage + clean + net value ≥ 0" });
}

/** consolidate(asset, {priorRegression, now}) -> reward-gated consolidation into protected memory (SLEEP). Reversible. */
function consolidate(asset: any, opts: any): any {
  const a = isObj(asset) ? asset : {};
  const o = isObj(opts) ? opts : {};
  const now = o.now;
  if (!a.capability || a.capability.capability !== "VALIDATED_CAPABILITY") return Object.freeze({ ok: false, reason: "only a VALIDATED_CAPABILITY may be consolidated" });
  if (o.priorRegression === true) return Object.freeze({ ok: false, reason: "a prior regression blocks consolidation (reward-gated)" });
  const rec = { id: a.id, consolidated: true, provenance: a.provenance, family: "capability", status: "ACTIVE" };
  const level = MEM.consolidationOf(rec, now || 1); // reuse memory-taxonomy: CONSOLIDATED only w/ provenance + not stale
  const consolidatedAsset = Object.freeze({ ...a, state: ASSET_STATE.CONSOLIDATED, consolidated: level === "CONSOLIDATED", consolidation: level, rollbackToken: "pre-consolidate:" + a.id, history: arr(a.history).concat([{ at: now, event: "CONSOLIDATED", level }]) });
  return Object.freeze({ ok: level === "CONSOLIDATED", asset: consolidatedAsset, level });
}

/** rollback(asset, {now}) -> revert consolidation (reversibility requirement). */
function rollback(asset: any, opts: any): any {
  const a = isObj(asset) ? asset : {};
  const now = isObj(opts) ? opts.now : null;
  return Object.freeze({ ...a, state: ASSET_STATE.VALIDATED, consolidated: false, consolidation: "RAW", rolledBack: true, history: arr(a.history).concat([{ at: now, event: "ROLLED_BACK" }]) });
}

/**
 * measuredCompounding(assets) -> cross-mission aggregate. MEASURED_COMPOUNDING: cumulative net benefit across VALIDATED
 * assets only (synthetic/unvalidated excluded), with the mean generalization gap. Honest: an empty/unvalidated set ⇒ 0.
 */
function measuredCompounding(assets: any): any {
  const validated = arr(assets).filter((a: any) => isObj(a) && a.capability && a.capability.capability === "VALIDATED_CAPABILITY");
  let cumulative = 0, gaps = 0, gapCount = 0;
  for (const a of validated) {
    cumulative += assetNetValue(a).netValue;
    const g = a.transfer && a.transfer.generalizationGap;
    if (isNum(g)) { gaps += g; gapCount++; }
  }
  return Object.freeze({
    validatedCount: validated.length,
    cumulativeNetBenefit: round(cumulative),
    compoundingRate: validated.length ? round(cumulative / validated.length) : 0,
    meanGeneralizationGap: gapCount ? round(gaps / gapCount) : null,
    note: "only VALIDATED, measured assets count; a small honest generalization gap beats a large contaminated one",
  });
}

/** budgetStop(state) -> { stop, reason }. §5.5: halt at budget or when marginal yield is exhausted. */
function budgetStop(state: any): any {
  const s = isObj(state) ? state : {};
  const b = isObj(s.budget) ? s.budget : {};
  if (isNum(b.maxExperiments) && num(s.experiments) >= b.maxExperiments) return Object.freeze({ stop: true, reason: "budget: maxExperiments reached" });
  if (isNum(b.maxCostEur) && num(s.costEur) > b.maxCostEur) return Object.freeze({ stop: true, reason: "budget: maxCostEur exceeded" });
  if (isNum(b.minMarginalYield) && isNum(s.marginalYield) && s.marginalYield < b.minMarginalYield) return Object.freeze({ stop: true, reason: "marginal yield below threshold — no measurable value" });
  return Object.freeze({ stop: false, reason: "within budget" });
}

/** runCompoundingCycle(spec, {target, rewardHacking, now}) -> full asset record. Fail-closed at each gate. */
function runCompoundingCycle(spec: any, deps: any): any {
  const d = isObj(deps) ? deps : {};
  const now = d.now;
  const reg = registerAsset(spec, { now });
  if (!reg.ok) return Object.freeze({ ok: false, stage: "register", result: reg });
  let asset = reg.asset;
  const netValue = assetNetValue(asset);
  const transfer = transferTest(asset, isObj(d.target) ? d.target : {}, { now });
  const rh = rewardHackingCheck({ ...(isObj(d.rewardHacking) ? d.rewardHacking : {}), evidenceOverlap: transfer.sharedEvidence });
  const capability = validateCapability(asset, transfer, rh, netValue);
  asset = Object.freeze({ ...asset, state: ASSET_STATE.TRANSFER_TESTED, netValue, transfer, rewardHacking: rh, capability, history: arr(asset.history).concat([{ at: now, event: "TRANSFER_TESTED" }]) });
  if (capability.capability === "VALIDATED_CAPABILITY") asset = Object.freeze({ ...asset, state: ASSET_STATE.VALIDATED });
  return Object.freeze({ ok: true, asset, capability: capability.capability, netValue, transfer, rewardHacking: rh });
}

// ---- Persistence (immutable, idempotent, resumable) — reuses autonomy-store + idempotency-guard -------------------
function loadJournal(opts: any): any { const st = storeOf(opts); const rs = (typeof st.readStrict === "function") ? st.readStrict(STORE_KEYS.journal) : { value: st.read(STORE_KEYS.journal, null) }; return isObj(rs.value) ? rs.value : IG.emptyJournal(); }
function loadAssets(opts: any): any {
  const st = storeOf(opts);
  const rs = (typeof st.readStrict === "function") ? st.readStrict(STORE_KEYS.assets) : { present: true, corrupt: false, value: st.read(STORE_KEYS.assets, null) };
  if (rs.corrupt) return Object.freeze({ ok: false, corrupt: true });
  return Object.freeze({ ok: true, items: arr(rs.value && rs.value.items) });
}
function persistAsset(asset: any, opts: any): any {
  const a = isObj(asset) ? asset : {};
  if (!isStr(a.id) || !isStr(a.state)) return Object.freeze({ ok: false, reason: "asset id+state required" });
  const loaded = loadAssets(opts);
  if (!loaded.ok) return loaded;
  const journal = loadJournal(opts);
  const key = "asset:" + a.id + ":" + a.state;
  if (IG.admit({ idempotencyKey: key, actionId: a.id }, journal, 0).decision === IG.DECISION.DUPLICATE) return Object.freeze({ ok: true, decision: "DUPLICATE", added: false });
  const st = storeOf(opts);
  st.write(STORE_KEYS.assets, { items: loaded.items.concat([a]) });
  st.write(STORE_KEYS.journal, IG.record(journal, key, { at: isObj(opts) ? opts.now : null }));
  return Object.freeze({ ok: true, decision: "PROCEED", added: true });
}
function resume(opts: any): any {
  const loaded = loadAssets(opts);
  if (!loaded.ok) return Object.freeze({ ok: false, corrupt: true, assets: {} });
  const latest: any = {};
  for (const snap of loaded.items) { if (isObj(snap) && isStr(snap.id)) latest[snap.id] = snap; }
  return Object.freeze({ ok: true, assets: Object.freeze(latest), count: Object.keys(latest).length });
}

const COMPOUNDING_LOOP_CONTRACT = Object.freeze({
  id: "WI-FR-08-COMPOUNDING-LOOP",
  source: "Resumption mandate WI-FR-08 + research dossier §17-§18 — compounding/global-learning upper half (compose-only)",
  assetStates: ASSET_STATE, capability: CAPABILITY, storeKeys: STORE_KEYS,
  reuses: Object.freeze(["improvement-baseline (measureDelta)", "reuse-ledger (classifyReuseOutcome)", "memory-taxonomy (consolidation)", "meta-intelligence (integrity)", "idempotency-guard + autonomy-store"]),
  notAuthority: "turns VERIFIED results into validated, reusable capabilities with measured compounding; it promotes/certifies nothing by self-report and trains no model weights",
  invariants: Object.freeze([
    "NO new store/evaluator/primitive — composes existing modules only",
    "VERIFIED_RESULT gate: an asset without evidenceRefs+provenance+validity-domain is REJECTED (synthetic ≠ asset)",
    "NET-VALUE gate: an asset is kept only if benefit − costs ≥ 0 (Memory Tax / CURATOR)",
    "TRANSFER test is held-out with 3-level leakage control (same domain OR shared evidence ⇒ leakage ⇒ fail); generalization gap reported",
    "REWARD-HACKING gate: metric-gaming / leakage / self-certification (builder==validator) / integrity DETECTED ⇒ NOT validated",
    "CONSOLIDATION is reward-gated (measured improvement + no regression + reversible); no model weights trained",
    "MEASURED_COMPOUNDING counts only VALIDATED, measured assets; fail-closed on uncertainty (INCONCLUSIVE); compute-budget stop",
  ]),
});

module.exports = {
  ASSET_STATE, CAPABILITY, STORE_KEYS, COMPOUNDING_LOOP_CONTRACT,
  registerAsset, assetNetValue, transferTest, rewardHackingCheck, validateCapability, consolidate, rollback,
  measuredCompounding, budgetStop, runCompoundingCycle, loadAssets, persistAsset, resume,
};

if (require.main === module) { process.stdout.write(JSON.stringify(COMPOUNDING_LOOP_CONTRACT, null, 2) + "\n"); }

export {};
