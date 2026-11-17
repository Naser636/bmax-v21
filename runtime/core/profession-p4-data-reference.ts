#!/usr/bin/env node
"use strict";

/*
 * V12.4 §43 P4 — Data Engineering reference project (E2 executed + E3 adversarial). PURE, deterministic. Over a
 * CLEARLY-LABELLED SYNTHETIC dataset it runs data-quality assertions (nulls / type errors / range errors / duplicates),
 * checks lineage/provenance presence, evaluates schema backward-COMPATIBILITY (REUSING api-contract.checkCompatibility —
 * no second contract engine), and proves idempotent (dedup) ingestion. Synthetic only; real warehouse/ETL over real
 * data (E5) is owner-gated NOT_RUN. Dual export.
 */

const API = require("./api-contract");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function round(n: number): number { return Number(n.toFixed(4)); }
function typeOf(v: any): string { return Array.isArray(v) ? "array" : (v === null ? "null" : typeof v); }

/** assessDataQuality(rows, schema) -> quality findings + score. schema: { field: {type, min?, max?, required?} }. */
function assessDataQuality(rows: any, schema: any, opts?: any): any {
  const rs = arr(rows).filter(isObj); const sc = isObj(schema) ? schema : {};
  const o = isObj(opts) ? opts : {};
  let nulls = 0, typeErrors = 0, rangeErrors = 0;
  for (const row of rs) {
    for (const f of Object.keys(sc)) {
      const spec = isObj(sc[f]) ? sc[f] : {};
      const v = row[f];
      if (v === undefined || v === null) { if (spec.required === true) nulls++; continue; }
      if (isStr(spec.type) && typeOf(v) !== spec.type) typeErrors++;
      if (typeof v === "number") { if (typeof spec.min === "number" && v < spec.min) rangeErrors++; if (typeof spec.max === "number" && v > spec.max) rangeErrors++; }
    }
  }
  const seen = new Set(); let duplicates = 0;
  for (const row of rs) { const k = isStr(row.id) ? row.id : JSON.stringify(row); if (seen.has(k)) duplicates++; else seen.add(k); }
  // V143 — TIMELINESS dimension (standard 6-dimension data quality: accuracy/completeness/consistency/TIMELINESS/validity/
  // uniqueness; research-backed). OPT-IN (opts.timeliness={field, maxAgeMs, nowMs}) so default behaviour is unchanged: a row
  // whose timestamp field is older than nowMs − maxAgeMs (or missing/unparseable) is STALE — a timeliness defect. Fail-closed.
  let stale = 0; let timelinessChecked = false;
  const tl = isObj(o.timeliness) ? o.timeliness : null;
  if (tl && isStr(tl.field) && typeof tl.maxAgeMs === "number" && tl.maxAgeMs >= 0 && typeof tl.nowMs === "number" && isFinite(tl.nowMs)) {
    timelinessChecked = true;
    for (const row of rs) {
      const raw = row[tl.field];
      const ts = typeof raw === "number" ? raw : (isStr(raw) ? Date.parse(raw) : NaN);
      if (!isFinite(ts) || (tl.nowMs - ts) > tl.maxAgeMs) stale++;   // missing/unparseable OR older than maxAge ⇒ stale (fail-closed)
    }
  }
  const dimsChecked = 3 + (timelinessChecked ? 1 : 0);   // completeness, validity, uniqueness (+ timeliness when configured)
  const totalChecks = rs.length * Math.max(1, Object.keys(sc).length);
  const defects = nulls + typeErrors + rangeErrors + duplicates + stale;
  const score = totalChecks > 0 ? round(1 - defects / totalChecks) : 0;
  return Object.freeze({ rows: rs.length, nulls, typeErrors, rangeErrors, duplicates, stale, timelinessChecked, dimsChecked, defects, score, clean: defects === 0 });
}

/** checkLineage(dataset) -> { ok, reason }. Fail-closed: a dataset without source+transform provenance is not trusted. */
function checkLineage(dataset: any): any {
  const d = isObj(dataset) ? dataset : {};
  const ok = isStr(d.source) && Array.isArray(d.transforms) && d.transforms.length > 0;
  return Object.freeze({ ok, reason: ok ? "lineage present (source + transforms)" : "missing source/transform lineage (fail-closed)" });
}

/** schemaCompatibility(oldSchema, newSchema) -> reuse api-contract: a removed/added required field or type change is BREAKING. */
function schemaCompatibility(oldSchema: any, newSchema: any): any {
  const toContract = (sc: any) => ({ requiredIn: Object.keys(isObj(sc) ? sc : {}).filter((f: any) => sc[f] && sc[f].required), requiredOut: [], inputSchema: Object.fromEntries(Object.keys(isObj(sc) ? sc : {}).map((f: any) => [f, (sc[f] && sc[f].type) || "string"])) });
  return API.checkCompatibility(toContract(oldSchema), toContract(newSchema));
}

// V252 §5 — PROVENANCE-GRAPH validation (W3C PROV-DM + PROV-CONSTRAINTS; OpenLineage Job/Run/Dataset). checkLineage only
// tested PRESENCE of source+transforms; it could not detect a BROKEN chain, a cycle, an ambiguous generation, or tell
// DECLARED from OBSERVED/VERIFIED/UNKNOWN provenance. validateProvenanceGraph fills that gap over a graph the CALLER supplies
// (no second lineage store/engine). Fail-closed: an ABSENT or UNVERIFIED provenance is NEVER a valid proof by default.
// Refs: W3C PROV-DM/PROV-CONSTRAINTS (https://www.w3.org/TR/prov-dm/ , /prov-constraints/); OpenLineage (openlineage.io/docs).
const PROV_STATUS = Object.freeze(["VERIFIED", "OBSERVED", "DECLARED", "UNKNOWN"]);
function statusRank(s: string): number { const i = PROV_STATUS.indexOf(s); return i < 0 ? 99 : i; }   // lower = stronger

/** validateProvenanceGraph(graph) -> referential integrity + single-generation + acyclicity + DECLARED/OBSERVED/VERIFIED/
 * UNKNOWN classification. graph: { datasets:[{id, external?}], runs:[{id, job?, used:[id], generated:[id], observed?, verified?}],
 * derivations?:[{generated, from, status}], sources?:[id] }. */
function validateProvenanceGraph(graph: any): any {
  const g = isObj(graph) ? graph : {};
  const dsList = arr(g.datasets).filter(isObj);
  const ids = dsList.map((d: any) => d.id).filter(isStr);
  const dsSet = new Set(ids);
  const externalSet = new Set(ids.filter((id: string) => { const d = dsList.find((x: any) => x.id === id); return (d && d.external === true); }).concat(arr(g.sources).filter(isStr)));
  const runs = arr(g.runs).filter(isObj);
  if (ids.length === 0 && runs.length === 0) return Object.freeze({ ok: false, code: "EMPTY_GRAPH", detail: "no datasets/runs supplied (fail-closed)" });
  const derivs = arr(g.derivations).filter(isObj);
  const violations: any[] = [];
  const generatedBy: Record<string, string[]> = {};
  const edges: any[] = [];                // {from (used), to (generated), status}  = PROV wasDerivedFrom
  const adj: Record<string, string[]> = {};   // generated -> [used], for cycle detection
  const derivStatus = (generated: string, from: string, run: any): string => {
    const rec = derivs.find((d: any) => d.generated === generated && d.from === from);
    if (rec && PROV_STATUS.indexOf(rec.status) >= 0) return rec.status;
    if (run && run.verified === true) return "VERIFIED";
    if (run && run.observed === true) return "OBSERVED";
    return "DECLARED";                     // a run declares the derivation; declared ≠ verified
  };
  for (const r of runs) {
    const rid = isStr(r.id) ? r.id : "(run)";
    const used = arr(r.used).filter(isStr), gen = arr(r.generated).filter(isStr);
    for (const u of used) if (!dsSet.has(u)) violations.push(Object.freeze({ code: "DANGLING_REFERENCE", detail: "run '" + rid + "' used unknown dataset '" + u + "'" }));
    for (const o of gen) {
      if (!dsSet.has(o)) violations.push(Object.freeze({ code: "DANGLING_REFERENCE", detail: "run '" + rid + "' generated unknown dataset '" + o + "'" }));
      (generatedBy[o] = generatedBy[o] || []).push(rid);
      for (const u of used) { edges.push(Object.freeze({ from: u, to: o, status: derivStatus(o, u, r) })); (adj[o] = adj[o] || []).push(u); }
    }
  }
  for (const d of Object.keys(generatedBy)) { const distinctRuns = new Set(generatedBy[d]).size; if (distinctRuns > 1) violations.push(Object.freeze({ code: "AMBIGUOUS_GENERATION", detail: "dataset '" + d + "' generated by " + distinctRuns + " distinct runs (PROV uniqueGeneration)" })); }   // dedup run-ids: a single run listing the same output twice is not ambiguous
  const roots = ids.filter((d: string) => !generatedBy[d]);
  // acyclicity (PROV-CONSTRAINTS): a dataset must not transitively derive from itself.
  const color: Record<string, number> = {}; let cyclePath: string[] | null = null;
  const dfs = (n: string, stack: string[]): boolean => {
    color[n] = 1; stack.push(n);
    for (const m of (adj[n] || [])) { if (color[m] === 1) { cyclePath = stack.slice(stack.indexOf(m)).concat(m); return true; } if (color[m] === undefined && dfs(m, stack)) return true; }
    stack.pop(); color[n] = 2; return false;
  };
  for (const d of ids) if (color[d] === undefined && dfs(d, [])) break;
  if (cyclePath !== null) violations.push(Object.freeze({ code: "CYCLE", detail: "provenance cycle: " + (cyclePath as string[]).join(" -> ") }));
  // provenance trust classification (fail-closed): a non-source root with no generator ⇒ UNKNOWN (absent provenance).
  let declared = 0, observed = 0, verified = 0, unknown = 0;
  const trust: Record<string, string> = {};
  for (const d of ids) {
    if (!generatedBy[d]) { if (externalSet.has(d)) { trust[d] = "SOURCE"; } else { trust[d] = "UNKNOWN"; unknown++; } continue; }
    const inEdges = edges.filter((e: any) => e.to === d);
    let best = "UNKNOWN"; for (const e of inEdges) if (statusRank(e.status) < statusRank(best)) best = e.status;
    trust[d] = best;
    if (best === "VERIFIED") verified++; else if (best === "OBSERVED") observed++; else if (best === "DECLARED") declared++; else unknown++;
  }
  const nonSource = ids.filter((d: string) => trust[d] !== "SOURCE").length;
  const verifiedShare = nonSource > 0 ? round(verified / nonSource) : (ids.length > 0 ? 1 : 0);
  const ok = violations.length === 0 && unknown === 0;   // fail-closed: any UNKNOWN/absent provenance ⇒ NOT ok
  return Object.freeze({
    ok, datasets: ids.length, runs: runs.length, roots: Object.freeze(roots),
    violations: Object.freeze(violations), edges: Object.freeze(edges), trust: Object.freeze(trust),
    provenance: Object.freeze({ declared, observed, verified, unknown }), verifiedShare,
    note: "W3C PROV (entity=dataset, activity=run, wasGeneratedBy/used/wasDerivedFrom) + OpenLineage Job/Run/Dataset. Checks referential integrity, single-generation, acyclicity, and DECLARED/OBSERVED/VERIFIED/UNKNOWN. Fail-closed: an absent (UNKNOWN) or merely DECLARED provenance is NOT a verified proof; only VERIFIED counts toward verifiedShare.",
  });
}

/** traceLineage(graph, datasetId) -> reconstruct the upstream dataset set (transitive). complete=false if it reaches an
 * UNKNOWN origin (absent provenance) ⇒ the reconstruction is not a trusted proof. */
function traceLineage(graph: any, datasetId: any): any {
  const v = validateProvenanceGraph(graph);
  if (v.ok === false && v.code) return Object.freeze({ ok: false, code: v.code });
  if (!isStr(datasetId) || v.datasets === undefined) return Object.freeze({ ok: false, code: "INVALID_TARGET" });
  const g = isObj(graph) ? graph : {};
  const runs = arr(g.runs).filter(isObj);
  const upstreamOf: Record<string, string[]> = {};
  for (const r of runs) { const used = arr(r.used).filter(isStr); for (const o of arr(r.generated).filter(isStr)) (upstreamOf[o] = upstreamOf[o] || []).push(...used); }
  const upstream = new Set<string>(); let complete = true; let depth = 0;
  const visit = (d: string, lvl: number) => {
    depth = Math.max(depth, lvl);
    const parents = upstreamOf[d];
    if (!parents) { if ((v.trust as any)[d] === "UNKNOWN") complete = false; return; }   // absent provenance ⇒ incomplete
    for (const p of parents) { if (!upstream.has(p)) { upstream.add(p); visit(p, lvl + 1); } }
  };
  visit(datasetId, 0);
  return Object.freeze({ ok: true, dataset: datasetId, upstream: Object.freeze(Array.from(upstream)), depth, complete, note: complete ? "lineage reconstructed to declared sources" : "lineage reaches an UNKNOWN origin ⇒ NOT a complete/trusted provenance (fail-closed)" });
}

/** idempotentReplay(rows) -> { deduped, idempotent }. Ingesting the same rows twice yields the same deduped set. */
function idempotentReplay(rows: any): any {
  const dedup = (xs: any[]) => { const seen = new Set(); const out: any[] = []; for (const r of xs) { const k = isObj(r) && isStr(r.id) ? r.id : JSON.stringify(r); if (!seen.has(k)) { seen.add(k); out.push(r); } } return out; };
  const once = dedup(arr(rows)); const twice = dedup(arr(rows).concat(arr(rows)));
  return Object.freeze({ deduped: once.length, idempotent: once.length === twice.length });
}

function runReferenceProject(opts: any): any {
  const o = isObj(opts) ? opts : {};
  const schema = isObj(o.schema) ? o.schema : { id: { type: "string", required: true }, age: { type: "number", min: 0, max: 120, required: true } };
  const rows = arr(o.rows).length ? o.rows : [{ id: "r1", age: 30 }, { id: "r2", age: 45 }, { id: "r3", age: 22 }];
  const quality = assessDataQuality(rows, schema);
  const lineage = checkLineage(isObj(o.dataset) ? o.dataset : { source: "synthetic-gen", transforms: ["normalize"] });
  const compat = o.newSchema ? schemaCompatibility(schema, o.newSchema) : null;
  const replay = idempotentReplay(rows);
  // V252 §5 — opt-in provenance-graph validation (W3C PROV / OpenLineage); default behaviour unchanged.
  const provenanceGraph = isObj(o.provenanceGraph) ? validateProvenanceGraph(o.provenanceGraph) : null;
  const degraded = !quality.clean || !lineage.ok || !replay.idempotent || (compat && compat.compatible === false) || (provenanceGraph && provenanceGraph.ok === false);
  return Object.freeze({ synthetic: true, profession: "P4", quality, lineage, schemaCompatibility: compat, replay, provenanceGraph, level: compat ? "E3" : "E2", degraded: !!degraded, note: "SYNTHETIC dataset (not real/client data, not E5); quality+lineage+schema-compat+idempotence+(opt-in) PROV/OpenLineage provenance-graph validation; real warehouse/ETL (E5) owner-gated NOT_RUN" });
}

const P4_DATA_REFERENCE_CONTRACT = Object.freeze({
  id: "V124-P4-DATA-REFERENCE",
  source: "V12.4 §43 P4 (Data Engineering) — E2 reference + E3 adversarial (bad data / breaking schema)",
  levels: Object.freeze(["E0", "E1", "E2", "E3", "E4(owner/independent)", "E5(owner-gated NOT_RUN)"]),
  reuses: Object.freeze(["api-contract.checkCompatibility (schema compatibility)"]),
  notAuthority: "a runnable data-engineering reference over a SYNTHETIC dataset; no real data, no E5 claim",
  invariants: Object.freeze([
    "SYNTHETIC data only; real warehouse/ETL (E5) owner-gated NOT_RUN (no inflated level)",
    "quality (nulls/type/range/duplicates) + lineage (fail-closed) + schema backward-compatibility + idempotent replay",
    "schema compatibility reuses api-contract (no second contract engine)",
    "pure/deterministic + reproducible",
    "V252 W3C PROV/OpenLineage: validateProvenanceGraph checks referential integrity + single-generation + acyclicity + DECLARED/OBSERVED/VERIFIED/UNKNOWN; fail-closed (absent/UNKNOWN or merely DECLARED provenance is NEVER a verified proof; only VERIFIED counts); validates a caller-supplied graph — no second lineage store",
  ]),
});

module.exports = { assessDataQuality, checkLineage, schemaCompatibility, idempotentReplay, validateProvenanceGraph, traceLineage, runReferenceProject, P4_DATA_REFERENCE_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...P4_DATA_REFERENCE_CONTRACT, demo: runReferenceProject({}) }, null, 2) + "\n"); }

export {};
