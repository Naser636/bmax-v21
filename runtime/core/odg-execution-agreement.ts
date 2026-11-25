#!/usr/bin/env node
"use strict";
/*
 * V17.8 P1-REPAIR — EXECUTION-AGREEMENT candidate selection (Radar signal C-03 CodeT arXiv 2207.10397 / MBR-exec style;
 * C-02 risk note: weak visible tests make selection unreliable). Root cause addressed: V178-P1 (#1016) — 23/24
 * impl-ts-parse-range candidates passed ALL visible cases, so XSEL-1 had no discriminating signal. This module derives
 * extra probe inputs MECHANICALLY from VISIBLE inputs only (hidden cases never consulted), clusters candidates by their
 * observed outputs on those probes, and picks the largest cluster. Pure, deterministic, no I/O; it does NOT execute code
 * (the caller runs candidates in the sandbox and passes {threw,value} results). Authorizes nothing.
 * PROVENANCE: PROVIDER (Claude Code), after a MEASURED native incapacity — 2 bounded qwen2.5-coder:7b attempts via
 * local-model-generator scored 6/12 each on the spec tests (record docs/odg/evidence/V178_P1_REPAIR_AGREEMENT_PROVENANCE.json).
 * Effect on the full oracle: NOT_MEASURED (needs a contracted P1 re-attempt).
 */
function deriveProbeInputs(visibleArgs: any): any[][] {
  const vis = new Set((Array.isArray(visibleArgs) ? visibleArgs : []).map((t: any) => JSON.stringify(t)));
  const seen = new Set(); const out: any[][] = [];
  for (const tuple of Array.isArray(visibleArgs) ? visibleArgs : []) {
    if (!Array.isArray(tuple)) continue;
    tuple.forEach((v: any, i: number) => {
      let reps: any[] = [];
      if (typeof v === "string") reps = ["", " ", v.slice(0, 1), v + v];
      else if (typeof v === "number" && Number.isFinite(v)) reps = [0, -1, v + 1];
      else if (Array.isArray(v)) reps = [[], v.slice(0, 1)];
      for (const r of reps) {
        const nt = tuple.slice(); nt[i] = r; const k = JSON.stringify(nt);
        if (vis.has(k) || seen.has(k)) continue;
        seen.add(k); out.push(nt);
      }
    });
  }
  return out.slice(0, 16);
}
function outputSignature(r: any): string {
  if (r && r.threw === true) return "T";
  const s = JSON.stringify(r ? r.value : undefined);
  return s === undefined ? "V:undefined" : "V:" + s;
}
function cmp(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
function selectByAgreement(cands: any): any {
  const list = Array.isArray(cands) ? cands : [];
  if (!list.length) return { chosen: null, clusters: [], eligible: 0, decidedBy: "none" };
  const m = Math.max(...list.map((c: any) => c.visiblePasses));
  const el = list.filter((c: any) => c.visiblePasses === m);
  const by = new Map<string, string[]>();
  for (const c of el) { const k = (c.signatures || []).join("|"); if (!by.has(k)) by.set(k, []); (by.get(k) as string[]).push(String(c.id)); }
  const clusters = [...by.entries()].map(([key, ids]) => ({ key, members: ids.slice().sort(cmp), size: ids.length }))
    .sort((a: any, b: any) => b.size - a.size || cmp(a.members[0], b.members[0]));
  return { chosen: clusters[0].members[0], clusters, eligible: el.length, decidedBy: clusters.length === 1 || clusters[0].size > clusters[1].size ? "agreement" : "tie-break" };
}
module.exports = { deriveProbeInputs, outputSignature, selectByAgreement };
export {};
