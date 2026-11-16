#!/usr/bin/env node
"use strict";

/*
 * V234-A §5/§12 — CARTOGRAPHY RECONCILIATION (incremental, anti-rediscovery). PURE, deterministic. It closes the §5
 * gap the existing persisted map does NOT cover: persistent-impact-graph gives a BINARY whole-graph FRESH/STALE (any
 * file change ⇒ rebuild) and change-impact-graph owns the module graph — NEITHER classifies, per component, UNCHANGED /
 * MODIFIED / ADDED / MOVED / REMOVED, nor emits the §19 reuse-vs-restudy verdict. This is a thin RECONCILIATION LENS
 * over two cartography snapshots; it builds NO second graph/store (the real persisted snapshot comes from
 * persistent-impact-graph.saveGraph/loadGraph), adds NO 10th primitive.
 *
 * It enforces the §5 trap honestly: a component whose CONTENT DIGEST reappears at a new path is MOVED, not REMOVED
 * ("un composant déplacé ne doit pas être déclaré supprimé sans vérification"). And it COMPOSES the V235 observation-
 * currency decider to answer §19/§12.6-9: feed it the computed content-changed-set so a component's memorized
 * description is REUSED (CURRENT_OBSERVED) only when its content is provably unchanged, else it must be RE-STUDIED
 * (HISTORICAL_OBSERVED) — "ne refaire que le travail réellement nécessaire".
 *
 * REUSES the canonical digest (evidence-provenance.contentDigest) — no hand-rolled crypto. Dual export.
 */

const PROV = require("./evidence-provenance.js");          // contentDigest — the SAME digest persistent-impact-graph uses
const OCUR = require("./odg-observation-currency.js");     // V235 — observation-currency decider (reuse vs restudy)

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.length > 0; }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

// fingerprint(content, readFile?) -> canonical content digest. If given a path + injected reader, reads then digests.
function fingerprint(content: any): string { return PROV.contentDigest(typeof content === "string" ? content : { v: content }); }
function fingerprintPath(path: string, readFile: (p: string) => string | null): string | null {
  const c = typeof readFile === "function" ? readFile(path) : null;
  return typeof c === "string" ? fingerprint(c) : null;
}

// normalize a snapshot's entries into a Map<id, {id,path,digest,role}> (ignoring malformed rows).
function indexEntries(entries: any): Map<string, any> {
  const m = new Map<string, any>();
  for (const e of arr(entries)) {
    if (isObj(e) && isStr(e.id) && isStr(e.digest)) m.set(e.id, Object.freeze({ id: e.id, path: isStr(e.path) ? e.path : e.id, digest: e.digest, role: isStr(e.role) ? e.role : null }));
  }
  return m;
}

/*
 * reconcile(prev, curr, opts) -> incremental classification + anti-rediscovery verdict.
 * prev/curr: { commit?, entries:[{id,path,digest,role?}] }. opts: { asOfEpochMs? }.
 * Deterministic. MOVED (content digest reappears at a different id) takes precedence over REMOVED+ADDED.
 */
function reconcile(prev: any, curr: any, opts?: any): any {
  const o = isObj(opts) ? opts : {};
  const prevM = indexEntries(isObj(prev) ? prev.entries : null);
  const currM = indexEntries(isObj(curr) ? curr.entries : null);
  const prevCommit = isObj(prev) && isStr(prev.commit) ? prev.commit : "prev";
  const currCommit = isObj(curr) && isStr(curr.commit) ? curr.commit : "curr";

  // index curr digests NOT matched by a same-id survivor, to resolve MOVED (digest match at a different id).
  const unchanged: any[] = [], modified: any[] = [], added: any[] = [], moved: any[] = [], removed: any[] = [];
  const currDigestToIds = new Map<string, string[]>();
  for (const [id, e] of currM) { if (!currDigestToIds.has(e.digest)) currDigestToIds.set(e.digest, []); currDigestToIds.get(e.digest)!.push(id); }

  const movedCurrIds = new Set<string>();
  // pass 1 — survivors + moves + removals (iterate prev).
  for (const [id, pe] of prevM) {
    const ce = currM.get(id);
    if (ce) { (ce.digest === pe.digest ? unchanged : modified).push(Object.freeze({ id, path: ce.path, prevDigest: pe.digest, currDigest: ce.digest, role: pe.role })); continue; }
    // id gone — is the SAME content present under a different id? (digest match, that target not itself a same-id survivor)
    const cand = (currDigestToIds.get(pe.digest) || []).filter((cid) => !prevM.has(cid) && !movedCurrIds.has(cid));
    if (cand.length > 0) { const to = cand[0]; movedCurrIds.add(to); moved.push(Object.freeze({ from: id, to, fromPath: pe.path, toPath: currM.get(to)!.path, digest: pe.digest, role: pe.role })); }
    else removed.push(Object.freeze({ id, path: pe.path, digest: pe.digest, role: pe.role }));
  }
  // pass 2 — genuinely new ids (not the destination of a move).
  for (const [id, ce] of currM) { if (!prevM.has(id) && !movedCurrIds.has(id)) added.push(Object.freeze({ id, path: ce.path, digest: ce.digest, role: ce.role })); }

  // content-changed set (ACTUAL content changes — moves are location-only, content identical, so EXCLUDED).
  const contentChangedPaths = Object.freeze(Array.from(new Set([...modified.map((m) => m.path), ...added.map((a) => a.path)])));

  // §19 anti-rediscovery — COMPOSE V235: a surviving component's memorized description is reusable only if its content
  // is provably unchanged. Feed assess() the computed content-changed set; it decides CURRENT (reuse) vs HISTORICAL (restudy).
  const asOf = Number.isFinite(o.asOfEpochMs) ? o.asOfEpochMs : 0;
  const changedPathSet = new Set(contentChangedPaths);
  function verdictFor(id: string, path: string, role: string | null): any {
    // reconcile already KNOWS, from digest equality, whether this component's content changed — that ground truth is
    // authoritative. V235 supplies the currency LABEL, but a content-changed component can NEVER be upgraded to reuse,
    // even on a self-contradictory same-commit/different-content input (FAIL-CLOSED; closes the inspector finding).
    const contentChanged = changedPathSet.has(path);
    const observation = { id, claim: role || ("component " + id), kind: "OBSERVATION", observedAtEpochMs: asOf, observedCommit: prevCommit, scope: [path], method: "content-digest" };
    const context = { asOfEpochMs: asOf, currentCommit: currCommit, changedPathsKnown: true, changedPaths: contentChangedPaths };
    const a = OCUR.assess(observation, context);
    const reuse = a.mayAssertCurrent === true && !contentChanged;
    return Object.freeze({ id, currency: contentChanged ? "HISTORICAL_OBSERVED" : a.currency, reuse, restudy: !reuse });
  }
  const reuseSet: any[] = [], restudySet: any[] = [];
  for (const u of unchanged) { const v = verdictFor(u.id, u.path, u.role); (v.reuse ? reuseSet : restudySet).push(v); }
  for (const m of moved) { const v = verdictFor(m.to, m.toPath, m.role); reuseSet.push(Object.freeze({ id: m.to, currency: v.currency, reuse: v.reuse, restudy: false, pathUpdated: true })); } // content identical (digest reappeared) ⇒ reuse description, update location
  for (const m of modified) { const v = verdictFor(m.id, m.path, m.role); (v.reuse ? reuseSet : restudySet).push(v); }

  return Object.freeze({
    prevCommit, currCommit,
    counts: Object.freeze({ unchanged: unchanged.length, modified: modified.length, added: added.length, moved: moved.length, removed: removed.length }),
    unchanged: Object.freeze(unchanged), modified: Object.freeze(modified), added: Object.freeze(added), moved: Object.freeze(moved), removed: Object.freeze(removed),
    contentChangedPaths,
    reuseSet: Object.freeze(reuseSet), restudySet: Object.freeze(restudySet),
    note: "§5/§19: MOVED (content digest reappears) is NOT a deletion; reuseSet may skip re-study (content unchanged ⇒ CURRENT_OBSERVED via V235), restudySet must be re-observed (content changed ⇒ HISTORICAL_OBSERVED)",
  });
}

/* demonstrate() -> deterministic synthetic scenario exercising ALL five classifications + the anti-rediscovery verdict. */
function demonstrate(): any {
  const d = (s: string) => fingerprint(s); // canonical digests of fixed content (deterministic)
  const prev = { commit: "aaaaaaa", entries: [
    { id: "obs-currency", path: "runtime/core/odg-observation-currency.ts", digest: d("currency-v1"), role: "memory currency decider" },
    { id: "continuation", path: "runtime/core/odg-continuation-diagnostic.ts", digest: d("cont-v1"), role: "continuation forensic" },
    { id: "helper", path: "runtime/core/old-helper.ts", digest: d("helper-stable"), role: "shared helper" },
    { id: "legacy", path: "runtime/core/legacy.ts", digest: d("legacy-v1"), role: "legacy module" }] };
  const curr = { commit: "bbbbbbb", entries: [
    { id: "obs-currency", path: "runtime/core/odg-observation-currency.ts", digest: d("currency-v1"), role: "memory currency decider" }, // UNCHANGED
    { id: "continuation", path: "runtime/core/odg-continuation-diagnostic.ts", digest: d("cont-v2"), role: "continuation forensic" },      // MODIFIED
    { id: "helper-moved", path: "runtime/core/util/helper.ts", digest: d("helper-stable"), role: "shared helper" },                         // MOVED (same digest, new id/path)
    { id: "cartography", path: "runtime/core/odg-cartography-reconcile.ts", digest: d("carto-v1"), role: "cartography reconcile" }] };      // ADDED; "legacy" REMOVED

  const r = reconcile(prev, curr, { asOfEpochMs: Date.UTC(2026, 10, 16) });
  return Object.freeze({ result: r,
    classificationsProven: r.counts.unchanged === 1 && r.counts.modified === 1 && r.counts.added === 1 && r.counts.moved === 1 && r.counts.removed === 1,
    moveNotDeleted: r.moved.length === 1 && r.moved[0].from === "helper" && r.moved[0].to === "helper-moved" && r.removed.every((x: any) => x.id !== "helper"),
    antiRediscoveryProven: r.reuseSet.some((x: any) => x.id === "obs-currency" && x.reuse === true) && r.restudySet.some((x: any) => x.id === "continuation" && x.restudy === true) && r.reuseSet.some((x: any) => x.id === "helper-moved" && x.pathUpdated === true) });
}

const CARTOGRAPHY_RECONCILE_CONTRACT = Object.freeze({
  id: "V234A-CARTOGRAPHY-RECONCILE",
  purpose: "§5/§12 — per-component incremental reconciliation of two cartography snapshots: UNCHANGED/MODIFIED/ADDED/MOVED/REMOVED + §19 reuse-vs-restudy; no second graph/store",
  invariants: Object.freeze([
    "MOVED (content digest reappears at a different id) is NEVER declared REMOVED — the §5 trap, honestly resolved",
    "COMPOSES V235 observation-currency: a component is REUSED only when content is provably unchanged (CURRENT_OBSERVED), else RE-STUDIED (HISTORICAL_OBSERVED)",
    "REUSES evidence-provenance.contentDigest (the same digest persistent-impact-graph uses) — no hand-rolled crypto, no 2nd graph/store, no 10th primitive",
    "a pure LENS over two injected snapshots — reads nothing, writes nothing, grants no authority; deterministic (asOf injected)",
  ]),
});

module.exports = { fingerprint, fingerprintPath, reconcile, demonstrate, CARTOGRAPHY_RECONCILE_CONTRACT };
export {};
