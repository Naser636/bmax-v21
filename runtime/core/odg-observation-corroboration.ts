#!/usr/bin/env node
"use strict";
/*
 * REAL-MEMORY P0 (V19-MEM-2) — corroboration of INTERNAL REAL OBSERVATIONS by INDEPENDENT REPRODUCTION (REPRO-1).
 *
 * External corroboration (odg-knowledge-intelligence.assessClaim) needs ≥2 independent publishers whose own citations cover
 * the same claim text; V19-MEM-1 proved that rule yields 0 facts on ODG's admitted sources (paraphrase). This module adds the
 * OTHER legitimate road to a corroborated fact, for what ODG itself MEASURES: an observation is CORROBORATED iff
 *   - ≥2 sources measured it under IDENTICAL declared conditions (same structured key: subject + metric + every condition),
 *   - the sources are INDEPENDENT executions (distinct run ids, distinct heads or start times, each a fresh generation —
 *     a REPLAY of another run's persisted outputs is never independent and never counts),
 *   - every counted source reports the SAME value, and NO source with the same key reports a different value
 *     (a contradiction ⇒ CONTRADICTED ⇒ memory status INVALIDATED, never reusable),
 *   - every source is a committed record whose sha256 is recorded (provenance), produced by an ODG run (actor ODG).
 * A single source stays UNVERIFIED (a real observation, not corroborated). Nothing here relaxes the external rule, and an
 * internal observation is never presented as an external/general truth: its claim text names the conditions it holds under.
 * PURE: records + shas are injected (no fs / clock / network). The memory records it emits use the SAME shape and trust
 * labels as odg-knowledge-intelligence.toMemory, so memory-trust-gate / memory-architecture decide FACT vs not — no second
 * memory, no second trust gate.
 */
const SCHEMA = "odg-observation-corroboration/1";
const RULE = "REPRO-1: an internal observation is CORROBORATED iff ≥2 INDEPENDENT ODG executions (distinct run ids, fresh generation, never a replay) measured the same structured key (subject + metric + all declared conditions) with the same value, each from a committed record with a recorded sha256, and no same-key source disagrees (⇒ CONTRADICTED). Single source ⇒ UNVERIFIED.";
const MIN_INDEPENDENT = 2;
const VALIDITY_DAYS = 90;

const isObj = (v: any) => v !== null && typeof v === "object" && !Array.isArray(v);
const arr = (v: any) => (Array.isArray(v) ? v : []);
function canon(v: any): string { return JSON.stringify(v, (_k, x) => (isObj(x) ? Object.keys(x).sort().reduce((o: any, k) => ((o[k] = x[k]), o), {}) : x)); }
function keyOf(o: any): string { return canon({ subject: o.subject, metric: o.metric, conditions: o.conditions }); }

/* extractT0Observations(record, { path, sha256 }) — V178 multi-candidate result records (P1 / P1-R runners): for every trial,
 * the schedule-point-0 candidate (the V155-comparable control) yields an observation of (a) its generated-code sha256 and
 * (b) its full-oracle outcome (B.gradeTrial), keyed by model, temperature, seed, task, the task-set sha and the grader. */
function extractT0Observations(rec: any, src: any): any[] {
  if (!isObj(rec) || !Array.isArray(rec.trials) || !isObj(rec.taskSet) || !isObj(rec.run)) return [];
  const replay = isObj(rec.replay);   // REPLAY-1 re-uses another run's candidates ⇒ not an independent execution
  const actor = isObj(rec.provenance) ? rec.provenance.actor : null;
  const source = { path: src && src.path, sha256: src && src.sha256, runHead: rec.run.head || null, startedAt: rec.run.startedAt || null, runner: rec.run.runner || null, independent: !replay, actor, replayOf: replay ? rec.replay.source || null : null };
  const out: any[] = [];
  for (const t of rec.trials) {
    const c0 = arr(t && t.candidates).find((c: any) => c && c.point === 0);
    if (!c0 || !isObj(t.controlT0) || t.controlT0.measured !== true) continue;
    const conditions = { model: c0.model, temperature: c0.temperature, seed: c0.seed, task: t.task, taskSet: rec.taskSet.version, taskSetSha256: rec.taskSet.sha256, schedulePoint: 0 };
    // independence is EVIDENCE-based (inspector hardening): the record must show the t0 generation call was actually SENT in
    // this run (calls[] entry for this task / model / temperature / seed); a record without it never counts as independent.
    const sent = arr(rec.calls).some((k: any) => isObj(k) && k.task === t.task && k.model === c0.model && k.temperature === c0.temperature && k.seed === c0.seed);
    const s = sent ? source : { ...source, independent: false, notIndependentReason: source.independent ? "no recorded t0 generation call in this run" : "replay" };
    out.push({ subject: c0.model, metric: "t0 generated-code sha256", conditions, value: c0.codeSha256, trial: t.trial, source: s });
    out.push({ subject: c0.model, metric: "t0 full-oracle outcome (odg-local-model-benchmark.gradeTrial, all cases)", conditions, value: t.controlT0.passed === true ? "PASS" : "FAIL", trial: t.trial, source: s });
  }
  return out;
}

/* corroborate(observations) — group by structured key; one vote per independent SOURCE (trials of one run are repeats of
 * one execution, not independent sources); classify each key. */
function corroborate(observations: any[]): any {
  const groups = new Map<string, any>();
  for (const o of arr(observations)) {
    if (!isObj(o) || !isObj(o.source) || typeof o.source.sha256 !== "string" || !o.source.sha256) continue;   // provenance required
    const k = keyOf(o);
    const g = groups.get(k) || { key: { subject: o.subject, metric: o.metric, conditions: o.conditions }, bySource: new Map<string, any>() };
    const sid = `${o.source.path}@${o.source.sha256}`;
    const s = g.bySource.get(sid) || { source: o.source, values: new Set<string>(), trials: [] as any[] };
    s.values.add(String(o.value)); s.trials.push(o.trial);
    g.bySource.set(sid, s); groups.set(k, g);
  }
  const results: any[] = [];
  for (const [k, g] of groups) {
    const sources = [...g.bySource.values()].map((s: any) => ({ ...s.source, values: [...s.values].sort(), trials: s.trials }));
    const allValues = [...new Set(sources.flatMap((s: any) => s.values))].sort();
    const independent = sources.filter((s: any) => s.independent === true && s.actor === "ODG");
    const runs = new Set(independent.map((s: any) => `${s.runHead}|${s.startedAt}`));
    let status: string; const reasons: string[] = [];
    if (allValues.length > 1) { status = "CONTRADICTED"; reasons.push(`same key, different values across sources: ${allValues.join(" vs ")}`); }
    else if (runs.size >= MIN_INDEPENDENT) { status = "CORROBORATED"; reasons.push(`${runs.size} independent ODG executions report ${allValues[0]}`); }
    else { status = "UNVERIFIED"; reasons.push(`${runs.size} independent execution(s) (< ${MIN_INDEPENDENT})${sources.length > independent.length ? `; ${sources.length - independent.length} non-independent source(s) (replay / non-ODG) not counted` : ""}`); }
    results.push({ key: g.key, keySha: k, value: allValues.length === 1 ? allValues[0] : null, status, reasons, independentExecutions: runs.size, sources });
  }
  results.sort((a, b) => (a.keySha < b.keySha ? -1 : a.keySha > b.keySha ? 1 : 0));
  return { schema: SCHEMA, rule: RULE, results, tally: { keys: results.length, corroborated: results.filter((r) => r.status === "CORROBORATED").length, unverified: results.filter((r) => r.status === "UNVERIFIED").length, contradicted: results.filter((r) => r.status === "CONTRADICTED").length } };
}

/* toMemory(result, asOf) — the SAME record shape / trust labels as odg-knowledge-intelligence.toMemory: only CORROBORATED ⇒
 * status VERIFIED (what memory-trust-gate trusts); UNVERIFIED kept UNVERIFIED; CONTRADICTED ⇒ INVALIDATED. The claim text
 * states the observation WITH its conditions (an internal measurement, never a general truth). */
function toMemory(r: any, asOf: number): any {
  const c = r.key.conditions || {};
  const learnedAt = Math.max(...r.sources.map((s: any) => Date.parse(s.startedAt || "") || 0), 0) || asOf;
  const claim = `Internal ODG observation (REPRO-1): ${r.key.subject} — ${r.key.metric} on task ${c.task} (${c.taskSet} ${String(c.taskSetSha256).slice(0, 12)}, temperature ${c.temperature}, seed ${c.seed}) = ${r.value === null ? "CONTRADICTED" : r.value}; reproduced by ${r.independentExecutions} independent execution(s)`;
  return Object.freeze({
    id: "OBS-" + require("crypto").createHash("sha256").update(r.keySha).digest("hex").slice(0, 16), family: "semantic", claim,
    structured: { subject: r.key.subject, relation: "measured", value: r.value, conditions: c, metric: r.key.metric },
    knowledgeClass: "REAL_OBSERVATION", epistemic: r.status === "CORROBORATED" ? "CORROBORATED_BY_REPRODUCTION" : r.status,
    retention: r.status === "CONTRADICTED" ? "KEPT_INVALID" : "KEPT",
    provenance: "REPRO-1:" + r.sources.map((s: any) => `${s.path}@${String(s.sha256).slice(0, 16)}`).join("|"),
    status: r.status === "CORROBORATED" ? "VERIFIED" : r.status === "CONTRADICTED" ? "INVALIDATED" : "UNVERIFIED",
    confidence: r.status === "CORROBORATED" ? 0.9 : 0.3,
    learnedAt, validUntil: learnedAt + VALIDITY_DAYS * 86400000,
    authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR",
    isFact: r.status === "CORROBORATED",
    rule: RULE,
  });
}

module.exports = { SCHEMA, RULE, MIN_INDEPENDENT, VALIDITY_DAYS, keyOf, extractT0Observations, corroborate, toMemory };
export {};
