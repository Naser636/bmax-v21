#!/usr/bin/env node
"use strict";

/*
 * V17.5 — REGISTER DEPENDENCY GRAPH. PURE + deterministic derivation of item → item DEPENDENCY edges for the strategic
 * register (odg-strategic-register) from COMMITTED, EXPLICIT evidence only, plus a SEPARATE write-set CONTENTION relation.
 * It is the evidence the register's existing DEP-1 rule and the selector's existing R1_MORE_UNBLOCKING rule were missing
 * ("dependency edges between items: none are stated in the evidence"). It adds no scheduler, no selector, no score and no
 * rule text: odg-strategic-register fills deps[] / depsStated from these edges and applies DEP-1 exactly as declared.
 *
 * Inputs (all injected; no filesystem access here):
 *   contracts       { path, data:{ contracts:[...] } }      — the committed WORK_ITEM_CONTRACTs
 *   executedEvidence { <item id>: { path, field } }        — the item's executed scenario evidence (SCN-1, a committed file
 *                                                             whose own contractRef/contract/scenario field names the item)
 *   evidence        { files:{ <path>:{ exists, sha256 } }, requires:{ <path>:[{ specifier, resolved }] } } — read by the
 *                     loader (odg-strategic-select.loadSources) from the committed tree; requires are parsed with the
 *                     canonical require parser (scripts/lib/js-require-scan.parseRequiresFromSource, the parser
 *                     change-impact-graph composes)
 *   statedText      [{ from, to, source }]                   — the register's existing 'scenario X' statements (missingForPass)
 *   itemStatus      { <item id>: status }                    — the register's own statuses (derived from the same inputs)
 *
 * NO-CIRCULARITY: no selector output, no committed register / GO output (V164_STRATEGIC_REGISTER.json, V164_GO_CYCLE.json)
 * is an input; edges come from contract fields and committed code/evidence files only.
 */

const WSC = require("./odg-writeset-contention.js");

const EDGE_KINDS = Object.freeze({
  DATASET_INPUT: "item X's contract declares, in WORK_ITEM_CONTRACT.preRegistration.dataset (any depth), a `file` that is a declared OUTPUT of item Y (a path in Y's WORK_ITEM_CONTRACT.write_set, or Y's executed scenario evidence file); satisfied iff that file is committed AND, when the dataset entry pins a sha256, its sha256 equals the pin (the runner refuses otherwise)",
  CODE_IMPORT: "a committed file in item X's WORK_ITEM_CONTRACT.write_set requires (relative require, canonical parser) a file that is in item Y's WORK_ITEM_CONTRACT.write_set; satisfied iff the required file is committed",
  STATED_TEXT: "item X's initialState.missingForPass names 'scenario Y' (the register's existing statement rule); satisfied iff Y's register status states completion (ACCEPTED, CLOSED_PASS or RESOLVED_BY_EVIDENCE) — no other field states it landed",
});
const COMPLETED = Object.freeze(["ACCEPTED", "CLOSED_PASS", "RESOLVED_BY_EVIDENCE"]);
/* V17.5 (#969 inspection REJECT): only edge kinds whose satisfaction CAN FAIL are prerequisites for DEP-1 / deps[].
 * CODE_IMPORT is satisfied by construction (an unresolved relative require yields no edge) and its extraction depends on
 * write_sets happening to name the imported file ⇒ it is STRUCTURAL ONLY (fanOut / reporting), never a DEP-1 input. */
const DEP1_KINDS = Object.freeze(["DATASET_INPUT", "STATED_TEXT"]);
const STRUCTURAL_KINDS = Object.freeze(["CODE_IMPORT"]);

const DEPG_RULE = "DEPG-1 (provider-authored, V17.5): item→item dependency edges are derived ONLY from explicit committed evidence — DATASET_INPUT, CODE_IMPORT, STATED_TEXT (definitions in edgeKinds); every edge cites its source (path#field) and the producer-side pointer; self-edges are dropped; a path containing '<' (a placeholder such as runtime/core/<defect-module>.ts) is not a concrete file and never matches. Applied UNIFORMLY to every register item kind: only WORK_ITEM_CONTRACT items declare inputs (preRegistration.dataset), a write_set or missingForPass, so every other kind gets dependencyGraph NOT_MEASURED with the reason (no edge is invented for them). Lineage (contract.parent) and shared inputs that no item produces are NOT dependencies. deps[] = the targets of UNSATISFIED edges (what the selector's eligibility gate and R1_MORE_UNBLOCKING read: an item is 'unblocked' by Y only while its dependency on Y is unsatisfied); DATASET_INPUT and STATED_TEXT edges (satisfaction can fail: pin/commit check, completion status) are stated dependencies for DEP-1 (depsStated) together with the register's existing owner-authorization prerequisites; CODE_IMPORT edges are STRUCTURAL ONLY (satisfied by construction ⇒ counted in fanOut, never in DEP-1 or deps[]); a write_set entry naming a file that is not committed is recorded in staleWriteSets (a limit, contracts are not edited). NO DEPENDENCY STATED ≠ NO DEPENDENCY: an item without a prerequisite edge keeps dependencyAvailability NOT_MEASURED with the reason 'no dependency stated'; 'measured: no dependency' would require a committed field STATING independence for that item, and no such field exists (independenceStated = [] — never inferred from absence)";
const CONT_RULE = "CONT-1 (provider-authored, V17.5): write-set CONTENTION between WORK_ITEM_CONTRACT items = odg-writeset-contention.computeLayerContention over one layer of all contract items (path equal or directory-ancestor); a write_set containing a placeholder entry ('<…>') cannot be proven isolated ⇒ UNKNOWN (fail-closed, conflicts with every item). Contention is NOT a dependency: it never enters deps[], depsStated or any criterion";

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function concretePath(s: any): string | null {
  if (typeof s !== "string") return null;
  const m = /^[^\s(]+/.exec(s.trim());
  if (!m || m[0].includes("<")) return null;
  return m[0].replace(/^\.\//, "");
}

/* datasetFiles(dataset) — every { file } entry under preRegistration.dataset, depth-first in key order, with its pointer. */
function datasetFiles(dataset: any, ptr: string): { file: string; raw: string; pin: string | null; ptr: string }[] {
  const out: any[] = [];
  const walk = (o: any, p: string) => {
    if (Array.isArray(o)) { o.forEach((x, i) => walk(x, `${p}[${i}]`)); return; }
    if (!isObj(o)) return;
    for (const k of Object.keys(o)) {
      if (k === "file" && typeof o[k] === "string") {
        const f = concretePath(o[k]);
        if (f) out.push({ file: f, raw: o[k], pin: typeof o.sha256 === "string" && /^[0-9a-f]{64}$/.test(o.sha256) ? o.sha256 : null, ptr: `${p}.file` });
      } else walk(o[k], `${p}.${k}`);
    }
  };
  walk(dataset, ptr);
  return out;
}

/*
 * deriveDependencyGraph(input) → frozen { rule, edgeKinds, edges, byItem, contention, counts }.
 * `items` = [{ id, kind }] for EVERY register item (uniform application: non-contract kinds get NOT_MEASURED).
 */
function deriveDependencyGraph(input: any): any {
  const C = input && input.contracts;
  const cf = C && C.path ? String(C.path) : "contracts";
  const contracts: any[] = C && isObj(C.data) && Array.isArray(C.data.contracts) ? C.data.contracts : [];
  const ev = isObj(input && input.evidence) ? input.evidence : {};
  const files: any = isObj(ev.files) ? ev.files : {};
  const requires: any = isObj(ev.requires) ? ev.requires : {};
  const executed: any = isObj(input && input.executedEvidence) ? input.executedEvidence : {};
  const statuses: any = isObj(input && input.itemStatus) ? input.itemStatus : {};
  const items: any[] = Array.isArray(input && input.items) ? input.items : contracts.map((x: any) => ({ id: String(x.scenario), kind: "WORK_ITEM_CONTRACT" }));
  const contractIds = new Set(contracts.map((x: any) => String(x.scenario)));

  // outputs: path → [{ item, source }]
  const outputs = new Map<string, { item: string; source: string }[]>();
  const addOut = (p: string | null, item: string, source: string) => { if (!p) return; const l = outputs.get(p) || []; l.push({ item, source }); outputs.set(p, l); };
  contracts.forEach((x: any, ci: number) => {
    const id = String(x.scenario);
    const ws = isObj(x.WORK_ITEM_CONTRACT) && Array.isArray(x.WORK_ITEM_CONTRACT.write_set) ? x.WORK_ITEM_CONTRACT.write_set : [];
    ws.forEach((w: any, k: number) => addOut(concretePath(w), id, `${cf}#contracts[${ci}].WORK_ITEM_CONTRACT.write_set[${k}]`));
    const e = executed[id];
    if (isObj(e) && typeof e.path === "string") addOut(concretePath(e.path), id, `${e.path}#${e.field || "contractRef"} (executed scenario evidence naming ${id}, SCN-1)`);
  });
  const fileFact = (p: string) => (isObj(files[p]) ? files[p] : { exists: false, sha256: null });

  const edges: any[] = [];
  contracts.forEach((x: any, ci: number) => {
    const id = String(x.scenario);
    const base = `${cf}#contracts[${ci}]`;
    const w = isObj(x.WORK_ITEM_CONTRACT) ? x.WORK_ITEM_CONTRACT : {};
    // DATASET_INPUT
    const ds = isObj(w.preRegistration) ? w.preRegistration.dataset : undefined;
    for (const d of datasetFiles(ds, `${base}.WORK_ITEM_CONTRACT.preRegistration.dataset`)) {
      for (const prod of outputs.get(d.file) || []) {
        if (prod.item === id) continue;
        const f = fileFact(d.file);
        const pinOk = d.pin === null || f.sha256 === d.pin;
        const satisfied = f.exists === true && pinOk;
        edges.push({ from: id, to: prod.item, kind: "DATASET_INPUT", via: d.file, source: d.ptr, targetSource: prod.source, satisfied,
          satisfiedBasis: !f.exists ? `${d.file} is not committed` : d.pin === null ? `${d.file} committed (no sha256 pinned)` : pinOk ? `${d.file} committed, sha256 = pinned ${d.pin}` : `${d.file} sha256 ${f.sha256} ≠ pinned ${d.pin}` });
      }
    }
    // CODE_IMPORT
    const ws = Array.isArray(w.write_set) ? w.write_set : [];
    ws.forEach((wf: any, k: number) => {
      const p = concretePath(wf);
      if (!p || !Array.isArray(requires[p])) return;
      for (const r of requires[p]) {
        const target = concretePath(r && r.resolved);
        if (!target) continue;
        for (const prod of outputs.get(target) || []) {
          if (prod.item === id || !/write_set\[/.test(prod.source)) continue;
          const f = fileFact(target);
          edges.push({ from: id, to: prod.item, kind: "CODE_IMPORT", via: target, source: `${p}#require(${JSON.stringify(String(r.specifier))})`, sourceWriteSet: `${base}.WORK_ITEM_CONTRACT.write_set[${k}]`, targetSource: prod.source, satisfied: f.exists === true, satisfiedBasis: f.exists ? `${target} committed` : `${target} is not committed` });
        }
      }
    });
  });
  // STATED_TEXT (the register's existing 'scenario X' statements)
  for (const s of Array.isArray(input && input.statedText) ? input.statedText : []) {
    const st = statuses[s.to];
    const satisfied = COMPLETED.includes(String(st));
    edges.push({ from: s.from, to: s.to, kind: "STATED_TEXT", via: null, source: s.source, targetSource: contractIds.has(s.to) ? `register item ${s.to}` : null, satisfied,
      satisfiedBasis: st === undefined ? `no register item ${s.to}` : satisfied ? `${s.to} status ${st} states completion` : `${s.to} status ${st} does not state completion` });
  }
  // dedupe (from,to,kind,via,source) and sort deterministically
  const seen = new Set<string>();
  const uniq = edges.filter((e) => { const k = [e.from, e.to, e.kind, e.via, e.source].join("\u0001"); return seen.has(k) ? false : (seen.add(k), true); });
  uniq.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : a.to > b.to ? 1 : a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : String(a.source) < String(b.source) ? -1 : 1));

  const byItem: any = {};
  for (const it of items) {
    const id = String(it.id);
    if (it.kind !== "WORK_ITEM_CONTRACT") {
      byItem[id] = { status: "NOT_MEASURED", rule: "DEPG-1", reason: `${it.kind} items declare no inputs (preRegistration.dataset), write_set or missingForPass ⇒ no dependency edge can be derived (absence is not independence)`, edgesOut: [], dependents: [], blockingDependents: [], fanOut: 0, blockingFanOut: 0 };
      continue;
    }
    const out = uniq.filter((e) => e.from === id);
    const inn = uniq.filter((e) => e.to === id);
    const dependents = Array.from(new Set(inn.map((e) => e.from))).sort();
    const blocking = Array.from(new Set(inn.filter((e) => !e.satisfied).map((e) => e.from))).sort();
    byItem[id] = { status: "DERIVED", rule: "DEPG-1", edgesOut: out.length, dependsOn: Array.from(new Set(out.map((e) => e.to))).sort(), unsatisfiedDeps: Array.from(new Set(out.filter((e) => !e.satisfied).map((e) => e.to))).sort(), dependents, blockingDependents: blocking, fanOut: dependents.length, blockingFanOut: blocking.length };
  }

  // CONT-1 — write-set contention (separate relation)
  const missions = contracts.map((x: any) => {
    const ws = isObj(x.WORK_ITEM_CONTRACT) && Array.isArray(x.WORK_ITEM_CONTRACT.write_set) ? x.WORK_ITEM_CONTRACT.write_set : [];
    const placeholder = ws.some((p: any) => typeof p !== "string" || p.includes("<"));
    return { id: String(x.scenario), ...(placeholder ? {} : { authorizedPaths: ws.slice() }) };
  });
  const ids = missions.map((m: any) => m.id);
  const lc = WSC.computeLayerContention([ids], missions);
  const pairs = lc.ok ? lc.layers[0].contentions.map((c: any) => ({ a: c.a, b: c.b, reason: c.reason, shared: c.shared.slice() })) : [];
  const contention = { rule: CONT_RULE, component: "odg-writeset-contention.computeLayerContention", unknownWriteSets: missions.filter((m: any) => !m.authorizedPaths).map((m: any) => m.id), pairs: pairs.filter((p: any) => p.reason === "WRITESET_OVERLAP"), pairsNote: "pairs lists WRITESET_OVERLAP pairs; UNKNOWN_WRITESET pairs (every pair involving an unknownWriteSets item) are counted in unknownPairs, not listed", overlapPairs: pairs.filter((p: any) => p.reason === "WRITESET_OVERLAP").length, unknownPairs: pairs.filter((p: any) => p.reason === "UNKNOWN_WRITESET").length, note: "contention is NOT a dependency: never in deps[], depsStated or any criterion" };

  // stale write_sets: concrete write_set entries not committed (e.g. a contract naming a runner the work never produced) —
  // recorded as a LIMIT of CODE_IMPORT/DATASET_INPUT extraction (an import of the real file cannot be attributed), never fixed here.
  const staleWriteSets: any[] = [];
  contracts.forEach((x: any, ci: number) => {
    const ws = isObj(x.WORK_ITEM_CONTRACT) && Array.isArray(x.WORK_ITEM_CONTRACT.write_set) ? x.WORK_ITEM_CONTRACT.write_set : [];
    ws.forEach((w: any, k: number) => { const p = concretePath(w); if (p && /\.(ts|js)$/.test(p) && isObj(files[p]) && files[p].exists === false) staleWriteSets.push({ item: String(x.scenario), file: p, source: `${cf}#contracts[${ci}].WORK_ITEM_CONTRACT.write_set[${k}]` }); });
  });
  const byKind: any = Object.fromEntries(Object.keys(EDGE_KINDS).map((k) => [k, uniq.filter((e) => e.kind === k).length]));
  return deepFreeze({ rule: DEPG_RULE, edgeKinds: EDGE_KINDS, dep1Kinds: DEP1_KINDS, structuralKinds: STRUCTURAL_KINDS, completedStatuses: COMPLETED, edges: uniq, byItem, contention, staleWriteSets, independenceStated: [], independenceNote: "no committed field states that an item has no dependency ⇒ every edge-less item is NOT_MEASURED (not stated), never MEASURED-none",
    counts: { edges: uniq.length, byKind, satisfied: uniq.filter((e) => e.satisfied).length, unsatisfied: uniq.filter((e) => !e.satisfied).length, itemsWithDeps: Object.values(byItem).filter((b: any) => b.edgesOut > 0).length, itemsNotMeasured: Object.values(byItem).filter((b: any) => b.status === "NOT_MEASURED").length } });
}

function deepFreeze(o: any): any { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(o[k]); } return o; }

/* dependencyEvidenceRequest(contracts) — which committed files the loader must stat/hash and which it must require-parse. */
function dependencyEvidenceRequest(contracts: any): { stat: string[]; parse: string[] } {
  const list: any[] = contracts && isObj(contracts.data) && Array.isArray(contracts.data.contracts) ? contracts.data.contracts : [];
  const stat = new Set<string>(), parse = new Set<string>();
  for (const x of list) {
    const w = isObj(x.WORK_ITEM_CONTRACT) ? x.WORK_ITEM_CONTRACT : {};
    for (const d of datasetFiles(isObj(w.preRegistration) ? w.preRegistration.dataset : undefined, "")) stat.add(d.file);
    for (const p of Array.isArray(w.write_set) ? w.write_set : []) { const c = concretePath(p); if (c) { stat.add(c); if (/\.(ts|js)$/.test(c)) parse.add(c); } }
  }
  return { stat: Array.from(stat).sort(), parse: Array.from(parse).sort() };
}

const REGISTER_DEPENDENCY_GRAPH_CONTRACT = Object.freeze({
  id: "V175-REGISTER-DEPENDENCY-GRAPH",
  source: "owner CTO 2026-11-24 'BRAIN & AUTONOMY MASTER BUILD' (« compréhension des dépendances », « Réutiliser les composants existants »)",
  composes: Object.freeze(["odg-writeset-contention.computeLayerContention (contention)", "scripts/lib/js-require-scan.parseRequiresFromSource via the loader (code imports)", "odg-strategic-register DEP-1 (measurement, rule text unchanged)", "mission-priority-selector R1_MORE_UNBLOCKING (reads deps[], unchanged)"]),
  invariants: Object.freeze([
    "every edge cites its source (path#field) and the producer-side pointer",
    "explicit committed evidence only: no keyword/topic matching, no lineage-as-dependency, no selector/register/GO output as input",
    "uniform: every register item kind is enumerated; kinds without declared inputs are NOT_MEASURED with a reason",
    "contention (write-set overlap) is a separate relation, never a dependency",
  ]),
});

module.exports = { DEP1_KINDS, STRUCTURAL_KINDS, deriveDependencyGraph, dependencyEvidenceRequest, datasetFiles, concretePath, EDGE_KINDS, DEPG_RULE, CONT_RULE, COMPLETED, REGISTER_DEPENDENCY_GRAPH_CONTRACT };
if (require.main === module) { process.stdout.write(JSON.stringify(REGISTER_DEPENDENCY_GRAPH_CONTRACT, null, 2) + "\n"); }
export {};
