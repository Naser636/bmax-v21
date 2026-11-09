#!/usr/bin/env node
"use strict";

/*
 * V12.4 / ENGINEERING THROUGHPUT OPTIMIZATION (addendum §5 — coherent work lots). PURE, deterministic. The measured #1
 * throughput bottleneck is the per-PR serial CI wait (~245s observed): it is paid ONCE PER DELIVERY, so k independent
 * single-mission PRs cost k×CI. This module decides when candidate missions MAY share ONE coherent delivery (paying CI
 * once) versus when they MUST stay separate. Two missions are RELATED iff their write-sets overlap, OR one declares a
 * dependency on the other, OR they share an impacted module (via the EXISTING dependency graph — reused, not rebuilt).
 * A batch is a CONNECTED component of related missions; an independent mission is its own MUST_SEPARATE lot. Fail-closed
 * (§5 last line — never group independent changes, regression risk): a mission with no declared write-set is NEVER
 * batched; batches are capped so the gate stays FULL and the blast radius bounded. This reduces the NUMBER of CI waits
 * with IDENTICAL controls (the same full gate runs once over the coherent lot) — a speed gain from method, not from
 * fewer checks. It decides grouping; it runs nothing and grants no authority. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function isStr(v: any): boolean { return typeof v === "string" && v.length > 0; }

const DEFAULT_MAX_BATCH = 6;   // cap the coherent lot so the regression blast-radius stays bounded (§5).

/** related(a, b, impactedById) -> boolean. Write-set overlap OR declared dep OR shared impacted module. */
function related(a: any, b: any, impactedById: any): boolean {
  const wa = new Set(arr(a.writeSet).map(String)); const wb = arr(b.writeSet).map(String);
  if (wb.some((f) => wa.has(f))) return true;                                  // same files touched
  if (arr(a.deps).map(String).includes(String(b.id)) || arr(b.deps).map(String).includes(String(a.id))) return true; // dependency edge
  const ia = new Set(arr(isObj(impactedById) ? impactedById[a.id] : []).map(String));
  if (arr(isObj(impactedById) ? impactedById[b.id] : []).map(String).some((m) => ia.has(m))) return true; // shared impacted module
  return false;
}

/**
 * assessBatch({ missions, impactedById, maxBatch }) -> { groups, mayBatch, mustSeparate, ciWaitsSaved, summary }.
 * A mission with no declared write-set is forced to its own MUST_SEPARATE lot (fail-closed). CONNECTED components of
 * related missions (≤ maxBatch) are MAY_BATCH; everything else is MUST_SEPARATE. ciWaitsSaved = Σ(batch members − 1).
 */
function assessBatch(input: any): any {
  const o = isObj(input) ? input : {};
  const missions = arr(o.missions).filter((m) => isObj(m) && isStr(m.id));
  const maxBatch = typeof o.maxBatch === "number" && o.maxBatch >= 2 ? Math.floor(o.maxBatch) : DEFAULT_MAX_BATCH;
  const impactedById = isObj(o.impactedById) ? o.impactedById : {};

  // missions with no declared write-set cannot be proven related ⇒ each its own separate lot (fail-closed).
  const batchable = missions.filter((m) => arr(m.writeSet).length > 0);
  const unprovable = missions.filter((m) => arr(m.writeSet).length === 0).map((m) => String(m.id));

  // connected components over the relatedness relation (union-find).
  const idx: Record<string, number> = {}; batchable.forEach((m, i) => { idx[String(m.id)] = i; });
  const parent = batchable.map((_, i) => i);
  function find(x: number): number { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
  function union(x: number, y: number): void { const rx = find(x), ry = find(y); if (rx !== ry) parent[rx] = ry; }
  for (let i = 0; i < batchable.length; i++) for (let j = i + 1; j < batchable.length; j++)
    if (related(batchable[i], batchable[j], impactedById)) union(i, j);

  const comp: Record<number, string[]> = {};
  batchable.forEach((m, i) => { const r = find(i); (comp[r] = comp[r] || []).push(String(m.id)); });

  const groups: any[] = []; let ciWaitsSaved = 0;
  for (const members of Object.values(comp)) {
    const sorted = members.slice().sort();
    if (sorted.length >= 2 && sorted.length <= maxBatch) {
      groups.push(Object.freeze({ decision: "MAY_BATCH", members: Object.freeze(sorted), ciWaitsSaved: sorted.length - 1, reason: `${sorted.length} technically-related missions (shared files/deps/impacted modules) ⇒ one coherent delivery; same FULL gate runs once` }));
      ciWaitsSaved += sorted.length - 1;
    } else if (sorted.length > maxBatch) {
      groups.push(Object.freeze({ decision: "MUST_SEPARATE", members: Object.freeze(sorted), ciWaitsSaved: 0, reason: `related group of ${sorted.length} exceeds maxBatch ${maxBatch} — blast radius too large; split into smaller coherent lots (§5)` }));
    } else {
      groups.push(Object.freeze({ decision: "MUST_SEPARATE", members: Object.freeze(sorted), ciWaitsSaved: 0, reason: "independent mission — grouping would add regression risk without coherence (§5)" }));
    }
  }
  for (const id of unprovable) groups.push(Object.freeze({ decision: "MUST_SEPARATE", members: Object.freeze([id]), ciWaitsSaved: 0, reason: "no declared write-set — relatedness cannot be proven ⇒ never batched (fail-closed)" }));

  const mayBatch = groups.filter((g) => g.decision === "MAY_BATCH");
  return Object.freeze({
    groups: Object.freeze(groups.sort((a, b) => b.ciWaitsSaved - a.ciWaitsSaved || String(a.members[0]).localeCompare(String(b.members[0])))),
    mayBatch: Object.freeze(mayBatch),
    mustSeparate: Object.freeze(groups.filter((g) => g.decision === "MUST_SEPARATE")),
    ciWaitsSaved,
    summary: Object.freeze({ missions: missions.length, groups: groups.length, mayBatch: mayBatch.length, ciWaitsSaved }),
    note: "reduces the NUMBER of serial CI waits by delivering proven-related missions together; the FULL gate still runs once over the coherent lot — identical controls (speed from method, not fewer checks). A count, not a promised %.",
  });
}

const DELIVERY_BATCH_COHERENCE_CONTRACT = Object.freeze({
  id: "V124-DELIVERY-BATCH-COHERENCE",
  source: "ODG Engineering Throughput Optimization §5 — coherent work lots (reduce serial CI waits without reducing controls)",
  reuses: Object.freeze(["change-impact-graph (shared impacted modules — the existing graph; no new graph)", "gate-instrumentation.speedupTarget (before/after CI-wait comparison)"]),
  notAuthority: "decides which missions MAY share one coherent delivery; it runs no gate/merge and grants no authority",
  invariants: Object.freeze([
    "missions batch ONLY if technically RELATED (shared write-set OR dependency edge OR shared impacted module)",
    "a mission with no declared write-set is NEVER batched — relatedness cannot be proven (fail-closed)",
    "independent missions stay MUST_SEPARATE — never group independent changes (regression risk, §5)",
    "a batch is capped (maxBatch) so the FULL gate stays complete and the regression blast radius bounded",
    "it reduces the NUMBER of CI waits with IDENTICAL controls — the same full gate runs once over the lot; speed from method, not fewer checks; no NOT_RUN ever presented as PASS",
    "pure/deterministic: missions + impacted-map in → grouping out; no clock/random/network; reuses the existing graph (no new engine)",
  ]),
});

module.exports = { related, assessBatch, DELIVERY_BATCH_COHERENCE_CONTRACT };

if (require.main === module) {
  const demo = assessBatch({ missions: [
    { id: "m1", writeSet: ["runtime/core/a.ts"], deps: [] },
    { id: "m2", writeSet: ["runtime/core/a.ts"], deps: [] },       // shares a file with m1 ⇒ batch
    { id: "m3", writeSet: ["runtime/core/z.ts"], deps: [] },       // independent ⇒ separate
    { id: "m4", deps: [] },                                          // no write-set ⇒ separate (fail-closed)
  ] });
  process.stdout.write(JSON.stringify({ ...DELIVERY_BATCH_COHERENCE_CONTRACT, demo: demo.summary }, null, 2) + "\n");
}

export {};
