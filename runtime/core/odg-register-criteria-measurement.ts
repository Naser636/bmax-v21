#!/usr/bin/env node
"use strict";

/*
 * V17.5 — REGISTER CRITERIA MEASUREMENT (WORK_ITEM_CONTRACT items). CP10 (V168_CHECKPOINT_10.json#openGaps) records
 * "4 register criteria NOT_MEASURED for every item": blockerRepetitionReduction (BLK-0), reliabilityQuality (REL-0),
 * speedEfficiency (SPD-0) and reusability (REU-0) for every non-capability-gap item. The selector's own
 * proposedResolutionRule says: measure the NOT_MEASURED criteria. This module is the PURE, deterministic, offline
 * measurer odg-strategic-register.buildRegister applies to WORK_ITEM_CONTRACT items. It is NOT a second register, NOT a
 * selector and changes no weight, threshold, criterion name or direction.
 *
 * Inputs are committed files ONLY: the WORK_ITEM_CONTRACTs themselves, the SCN-1 executed scenario evidence paths the
 * register already resolved, and the evidence files a contract's OWN preRegistration.dataset cites with a pinned
 * sha256 (loaded by odg-strategic-select.loadSources — the existing declared-sources mechanism). NO-CIRCULARITY: no
 * input is a register / selector / GO output (the loader never reads V164_STRATEGIC_REGISTER.json or a GO record for
 * this; measureContractCriteria takes no register or decision argument).
 *
 * Each MEASURED value carries { value, rule, method, source[] (path#field), basis, measuredAt { contentSha256 } } —
 * measuredAt is content-addressed (sha256 of every cited input file) so `--check` stays reproducible across commits;
 * the HEAD the register was generated at is its generatedAtHead. A criterion no rule can derive stays NOT_MEASURED
 * with a reason — never imputed, never defaulted. The rules are PROVIDER-AUTHORED (Claude Code) and declared here so
 * the owner can replace them.
 */

const STOP_NAMES = Object.freeze(["NO_PROGRESS_IDENTICAL_REGENERATION", "REPAIR_BUDGET_EXHAUSTED"]);
const STOP_KEYS = Object.freeze(["stopReason", "repairStopReason"]);

const BLK3_RULE = "BLK-3 (WORK_ITEM_CONTRACT items, V17.5): T = the task ids the contract PRE-REGISTERS (WORK_ITEM_CONTRACT.preRegistration.dataset.replication ∪ .heldOut, strings); F = the committed docs/odg/evidence/*.json files that SAME dataset block cites as `<k>.file` with a pinned 64-hex `<k>.sha256` — a file whose loaded sha256 differs from the pin, or that was not loaded, is refused (cited in the reason, never read); a STOP RECORD is a field stopReason / repairStopReason (or an element of a `stops` array) whose value is an ODG repetitive-failure stop of native-project-builder (NO_PROGRESS_IDENTICAL_REGENERATION | REPAIR_BUDGET_EXHAUSTED) inside an object whose `task`/`id` field — or whose own key — names a task of T; n = number of DISTINCT tasks of T with ≥1 stop record in F; value = n/|T| (the share of the item's own pre-registered tasks that committed evidence shows blocked by a repeated-failure stop: the repetition the item targets — a POTENTIAL reduction, not a realized one; the n/|T| scale is provider-authored); no pre-registered task list, no usable cited file, or n = 0 ⇒ NOT_MEASURED (absence is not evidence of no benefit)";
const REU1_RULE = "REU-1 (WORK_ITEM_CONTRACT items, V17.5): the item's OUTPUTS are its concrete write_set paths (no '<placeholder>') and its SCN-1 executed scenario evidence path; r = number of OTHER WORK_ITEM_CONTRACTs whose preRegistration.dataset DECLARES one of those outputs as an input — a `file` field (any depth under dataset) whose value starts with the output path (token-bounded); free-text mentions elsewhere do NOT count (a contract text also names files it must NOT look at — e.g. antiLeakage/contamination.notLookedAt — or must not edit — invariants), and a `parent` field alone does NOT count (lineage ≠ reuse); value = min(1, r/4) (divisor 4 provider-authored, keeping the n/4 scale of CAP-1/EVD-1/BLK-2); r = 0 ⇒ NOT_MEASURED (absence of a declared reuse is not evidence of no reuse)";
const REL_NOT_MEASURABLE = "REL-0 kept (V17.5 search): no committed field records an expected reliability/quality gain of COMPLETING a work item — contract-inspection findings/REJECTs are defects of the contract text, and canonical-defect resolution records are keyed to CP8 gap items (REL-2/RES-1), not to work items; using either would be a default fill";
const SPD_NOT_MEASURABLE = "SPD-0 kept (V17.5 search): no committed field records a speed/efficiency gain per work item — the only per-item wall-time data (V161_SCENARIO_J.json summary.perTask.*.wallMsMean) compares two arms that BOTH failed (0/8), and the speed scenarios N/P are not executed; a time difference between failures is not an efficiency gain";

const MEASUREMENT_RULES = Object.freeze({ blockerRepetitionReduction: BLK3_RULE, reusability: REU1_RULE, reliabilityQuality: REL_NOT_MEASURABLE, speedEfficiency: SPD_NOT_MEASURABLE });

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
const r4 = (n: number) => Number(Math.min(1, Math.max(0, n)).toFixed(4));
function nm(rule: string, reason: string, source: string[] = []): any { return { status: "NOT_MEASURED", value: null, rule, source, reason }; }
const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const EVIDENCE_JSON = /^docs\/odg\/evidence\/[A-Za-z0-9_.-]+\.json$/;
const SHA = /^[0-9a-f]{64}$/;

/* preRegisteredTasks(contract) → { tasks:[{task, ptr}], files:[{key, file, sha256, ptr}] } from the contract's own dataset. */
function preRegisteredDataset(x: any, base: string): any {
  const w = isObj(x) && isObj(x.WORK_ITEM_CONTRACT) ? x.WORK_ITEM_CONTRACT : {};
  const ds = isObj(w.preRegistration) && isObj(w.preRegistration.dataset) ? w.preRegistration.dataset : null;
  const dptr = `${base}.WORK_ITEM_CONTRACT.preRegistration.dataset`;
  if (!ds) return { tasks: [], files: [], ptr: dptr };
  const tasks: any[] = [];
  for (const k of ["replication", "heldOut"]) if (Array.isArray(ds[k])) ds[k].forEach((t: any, i: number) => { if (typeof t === "string" && t && !tasks.some((e) => e.task === t)) tasks.push({ task: t, ptr: `${dptr}.${k}[${i}]` }); });
  const files: any[] = [];
  for (const k of Object.keys(ds).sort()) { const v = ds[k]; if (isObj(v) && typeof v.file === "string" && EVIDENCE_JSON.test(v.file)) files.push({ key: k, file: v.file, sha256: SHA.test(String(v.sha256 || "")) ? String(v.sha256) : null, ptr: `${dptr}.${k}.file` }); }
  return { tasks, files, ptr: dptr };
}

/* citedMeasurementFiles(contractsData) — the evidence files the loader must read for BLK-3 (pinned, task-list contracts only). */
function citedMeasurementFiles(contractsData: any): string[] {
  const out = new Set<string>();
  for (const x of isObj(contractsData) && Array.isArray(contractsData.contracts) ? contractsData.contracts : []) {
    const d = preRegisteredDataset(x, "");
    if (!d.tasks.length) continue;
    for (const f of d.files) if (f.sha256) out.add(f.file);
  }
  return Array.from(out).sort();
}

/* stopRecords(data, tasks) — every stop record attributed to a task of `tasks` (deterministic walk order). */
function stopRecords(data: any, tasks: Set<string>): { task: string; ptr: string; stop: string }[] {
  const out: { task: string; ptr: string; stop: string }[] = [];
  const walk = (node: any, ptr: string, task: string | null, depth: number) => {
    if (depth > 12 || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach((v, i) => walk(v, `${ptr}[${i}]`, task, depth + 1)); return; }
    let t = task;
    if (typeof node.task === "string" && tasks.has(node.task)) t = node.task;
    else if (typeof node.id === "string" && tasks.has(node.id)) t = node.id;
    for (const k of Object.keys(node)) {
      const v = node[k];
      const p = ptr ? `${ptr}.${k}` : k;
      const ct = tasks.has(k) ? k : t;
      if (ct && STOP_KEYS.includes(k) && typeof v === "string" && STOP_NAMES.includes(v)) out.push({ task: ct, ptr: p, stop: v });
      else if (ct && k === "stops" && Array.isArray(v)) v.forEach((s: any, i: number) => { if (typeof s === "string" && STOP_NAMES.includes(s)) out.push({ task: ct, ptr: `${p}[${i}]`, stop: s }); });
      else if (v && typeof v === "object") walk(v, p, ct, depth + 1);
    }
  };
  walk(data, "", null, 0);
  return out;
}

/* measureBlockerRepetition(contract, base, evidenceByPath) — BLK-3. evidenceByPath: Map path → { sha256, data }. */
function measureBlockerRepetition(x: any, base: string, evidenceByPath: Map<string, any>): any {
  const d = preRegisteredDataset(x, base);
  if (!d.tasks.length) return nm("BLK-0", "no pre-registered task list (preRegistration.dataset.replication/heldOut) and no other canonical field links this item to blockers/repetitions removed (BLK-3 not applicable)");
  const refused: string[] = [], used: any[] = [];
  for (const f of d.files) {
    const e = evidenceByPath.get(f.file);
    if (!f.sha256) { refused.push(`${f.file} (no pinned sha256 at ${f.ptr.replace(/\.file$/, ".sha256")})`); continue; }
    if (!e) { refused.push(`${f.file} (not loaded)`); continue; }
    if (e.sha256 !== f.sha256) { refused.push(`${f.file} (sha256 ${String(e.sha256).slice(0, 12)}… ≠ pinned ${f.sha256.slice(0, 12)}…)`); continue; }
    used.push({ f, e });
  }
  const T = new Set<string>(d.tasks.map((t: any) => t.task));
  const recs: any[] = [];
  for (const { f, e } of used) for (const r of stopRecords(e.data, T)) recs.push({ ...r, file: f.file });
  const hit = d.tasks.filter((t: any) => recs.some((r) => r.task === t.task));
  const why = refused.length ? `; refused: ${refused.join(", ")}` : "";
  if (!used.length) return nm("BLK-3", `no usable cited evidence file for the ${T.size} pre-registered tasks${why}`, d.tasks.map((t: any) => t.ptr));
  if (!hit.length) return nm("BLK-3", `no stop record for any of the ${T.size} pre-registered tasks in ${used.map((u) => u.f.file).join(", ")}${why}`, d.tasks.map((t: any) => t.ptr));
  const source = used.map((u) => u.f.ptr).concat(used.map((u) => `${u.f.ptr.replace(/\.file$/, ".sha256")}`)).concat(d.tasks.map((t: any) => t.ptr)).concat(recs.map((r) => `${r.file}#${r.ptr}`));
  const perFile = used.map((u) => `${u.f.file}: ${new Set(recs.filter((r) => r.file === u.f.file).map((r) => r.task)).size} task(s), ${recs.filter((r) => r.file === u.f.file).length} record(s)`).join("; ");
  return {
    status: "MEASURED", value: r4(hit.length / T.size), rule: "BLK-3", method: "count distinct pre-registered tasks with ≥1 committed ODG repetitive-failure stop record in the sha256-pinned evidence files the contract's own dataset cites",
    source, basis: `n=${hit.length}/${T.size} pre-registered tasks blocked by a recorded stop (${perFile})${hit.length < T.size ? `; no record: [${d.tasks.filter((t: any) => !hit.includes(t)).map((t: any) => t.task).join(", ")}]` : ""}${why} — POTENTIAL reduction (the repetition the item targets), not a realized one`,
    measuredAt: { contentSha256: Object.fromEntries(used.map((u) => [u.f.file, u.e.sha256])) },
  };
}

/* datasetFiles(contract, base) — every `file` field (any depth) under WORK_ITEM_CONTRACT.preRegistration.dataset. */
function datasetFiles(y: any, base: string): { ptr: string; s: string }[] {
  const out: { ptr: string; s: string }[] = [];
  const w = isObj(y) && isObj(y.WORK_ITEM_CONTRACT) ? y.WORK_ITEM_CONTRACT : {};
  const ds = isObj(w.preRegistration) && isObj(w.preRegistration.dataset) ? w.preRegistration.dataset : null;
  const walk = (n: any, ptr: string, depth: number) => {
    if (depth > 8 || n === null || typeof n !== "object") return;
    if (Array.isArray(n)) { n.forEach((v, i) => walk(v, `${ptr}[${i}]`, depth + 1)); return; }
    for (const k of Object.keys(n)) { if (k === "file" && typeof n[k] === "string") out.push({ ptr: `${ptr}.file`, s: n[k] }); else walk(n[k], `${ptr}.${k}`, depth + 1); }
  };
  if (ds) walk(ds, `${base}.WORK_ITEM_CONTRACT.preRegistration.dataset`, 0);
  return out;
}
/* declaresPath(fileField, p) — the dataset `file` value starts with output path p (token-bounded). */
function declaresPath(s: string, p: string): boolean { return new RegExp(`^\\s*${reEsc(p)}(?![A-Za-z0-9_./-])`).test(s); }

/* measureReusability(contracts, ci, cf, scenPath) — REU-1. scenPath: letter → executed scenario evidence path (SCN-1). */
function measureReusability(contracts: any[], ci: number, cf: string, scenPath: any, contentSha256?: string | null): any {
  const x = contracts[ci];
  const L = String(x.scenario);
  const w = isObj(x.WORK_ITEM_CONTRACT) ? x.WORK_ITEM_CONTRACT : {};
  const outputs: { p: string; ptr: string }[] = [];
  (Array.isArray(w.write_set) ? w.write_set : []).forEach((p: any, i: number) => { if (typeof p === "string" && p && !/[<>]/.test(p) && !outputs.some((o) => o.p === p)) outputs.push({ p, ptr: `${cf}#contracts[${ci}].WORK_ITEM_CONTRACT.write_set[${i}]` }); });
  const sp = isObj(scenPath) && typeof scenPath[L] === "string" ? scenPath[L] : null;
  if (sp && !outputs.some((o) => o.p === sp)) outputs.push({ p: sp, ptr: `${sp} (SCN-1 executed evidence of ${L})` });
  if (!outputs.length) return nm("REU-1", "no concrete output (write_set entries are placeholders and no executed scenario evidence) ⇒ nothing to find reused", [`${cf}#contracts[${ci}].WORK_ITEM_CONTRACT.write_set`]);
  const citing: any[] = [];
  contracts.forEach((y: any, j: number) => {
    if (j === ci || !isObj(y)) return;
    const files = datasetFiles(y, `${cf}#contracts[${j}]`);
    const hits: any[] = [];
    for (const o of outputs) { const h = files.find((e) => declaresPath(e.s, o.p)); if (h) hits.push({ output: o.p, ptr: h.ptr }); }
    if (hits.length) citing.push({ id: String(y.scenario), hits });
  });
  if (!citing.length) return nm("REU-1", `no other WORK_ITEM_CONTRACT declares an output of ${L} ([${outputs.map((o) => o.p).join(", ")}]) as a preRegistration.dataset input — absence of a declared reuse is not evidence of no reuse`, outputs.map((o) => o.ptr));
  return {
    status: "MEASURED", value: r4(citing.length / 4), rule: "REU-1", method: "count other committed WORK_ITEM_CONTRACTs whose preRegistration.dataset declares one of this item's outputs (concrete write_set paths + SCN-1 executed evidence) as an input file",
    source: outputs.filter((o) => citing.some((c) => c.hits.some((h: any) => h.output === o.p))).map((o) => o.ptr).concat(...citing.map((c) => c.hits.map((h: any) => h.ptr))),
    basis: `r=${citing.length} other contract(s) declare an output as a dataset input: ${citing.map((c) => `${c.id} ← [${c.hits.map((h: any) => h.output).join(", ")}]`).join("; ")}`,
    measuredAt: { contentSha256: { [cf]: contentSha256 || null } },
  };
}

/* measureContractCriteria(sources, x, ci, scenPath) → { blockerRepetitionReduction, reusability, reliabilityQuality,
 * speedEfficiency } for one WORK_ITEM_CONTRACT. Takes NO register/decision input (no-circularity by signature). */
function measureContractCriteria(sources: any, ci: number, scenPath: any): any {
  const C = sources.contracts;
  const contracts = C.data.contracts;
  const base = `${C.path}#contracts[${ci}]`;
  const evidenceByPath = new Map<string, any>();
  for (const e of Array.isArray(sources.measurementEvidence) ? sources.measurementEvidence : []) if (e && typeof e.path === "string") evidenceByPath.set(e.path, e);
  return {
    blockerRepetitionReduction: measureBlockerRepetition(contracts[ci], base, evidenceByPath),
    reusability: measureReusability(contracts, ci, C.path, scenPath, typeof C.sha256 === "string" ? C.sha256 : null),
    reliabilityQuality: nm("REL-0", REL_NOT_MEASURABLE),
    speedEfficiency: nm("SPD-0", SPD_NOT_MEASURABLE),
  };
}

const CRITERIA_MEASUREMENT_CONTRACT = Object.freeze({
  id: "V175-REGISTER-CRITERIA-MEASUREMENT", source: "owner CTO 2026-11-24 'BRAIN & AUTONOMY MASTER BUILD' + CP10 openGaps '4 register criteria NOT_MEASURED for every item' + selector proposedResolutionRule",
  composedBy: "odg-strategic-register.buildRegister (WORK_ITEM_CONTRACT items only); inputs loaded by odg-strategic-select.loadSources (measurementEvidence)",
  rules: MEASUREMENT_RULES,
  invariants: Object.freeze([
    "committed inputs only (contracts, SCN-1 evidence paths, sha256-pinned files the contract's own dataset cites); offline, deterministic",
    "no register / selector / GO output is an input (no circularity)",
    "underivable ⇒ NOT_MEASURED with a reason, never a default; weights, thresholds, criterion names and directions unchanged",
    "a measured value cites path#field sources and a content-addressed measuredAt",
  ]),
});

module.exports = { STOP_NAMES, BLK3_RULE, REU1_RULE, REL_NOT_MEASURABLE, SPD_NOT_MEASURABLE, MEASUREMENT_RULES, preRegisteredDataset, citedMeasurementFiles, stopRecords, measureBlockerRepetition, measureReusability, measureContractCriteria, datasetFiles, declaresPath, CRITERIA_MEASUREMENT_CONTRACT };
if (require.main === module) { process.stdout.write(JSON.stringify(CRITERIA_MEASUREMENT_CONTRACT, null, 2) + "\n"); }
export {};
