#!/usr/bin/env node
"use strict";
/*
 * EXPERIENCE INTELLIGENCE — increment B: structured work EPISODES + COMPARABLE-EXPERIENCE recall.
 *
 * NOT a second memory. An episode is a DERIVED, deterministic projection of what ODG already holds canonically:
 * a closed strategic-register item (V164 register, CLOSE-1) + its committed criteria-validation record + its
 * WORK_ITEM_CONTRACT. Episodes are recorded into the EXISTING decision-precedent store (recordPrecedent, signature
 * "EPISODE:<item>") and recalled through decision-precedent.recallComparable — the canonical non-patch precedent
 * substrate (patch-memory only stores file edits). Nothing is persisted here; the source files are the truth.
 *
 * Knowledge governance (owner directive §3.D): every element carries a knowledge class from KNOWLEDGE_CLASSES. An
 * episode of an inspected, criteria-validated closure is INTERNAL_EXPERIENCE (never a CORROBORATED_FACT); a "next
 * lever" or untested idea is a HYPOTHESIS; nothing is ever promoted by this module (promotion = a later, governed
 * increment C step that requires more than one success). An episode is re-evaluated against the CURRENT register:
 * a changed contract / experiment sha ⇒ INVALIDATED; an explicit suspension ⇒ SUSPENDED (new version, history kept).
 *
 * Recall never copies a solution: adaptation.autoApply is always false; a FAILED precedent is AVOID_UNCHANGED (its
 * method may be re-attempted only with a cited changed input — RB-REATTEMPT-CHANGED-INPUT); a PARTIAL precedent is
 * PARTIAL_REUSE (its limits must be checked). Similarity is lexical-structural (Jaccard over normalized features),
 * declared as such: it ranks candidates for a human/GO reading, it is not semantic proof of comparability.
 *
 * PURE: no fs / clock / network. File reads are injected (readRecord) by the caller (GO port / runner).
 */
const DP = require("./decision-precedent.js");

const SCHEMA = "odg-experience-episode/1";
const RULE = "EXP-B-1: episode = derived projection (closed register item + criteria-validation record + contract) recorded in decision-precedent; recallComparable = Jaccard over normalized features (digit-bearing tokens dropped: ids/versions/shas never leak); FAILED ⇒ AVOID_UNCHANGED, PARTIAL ⇒ PARTIAL_REUSE, PASS ⇒ REUSABLE_WITH_ADAPTATION; autoApply always false";
const KNOWLEDGE_CLASSES = Object.freeze(["CORROBORATED_FACT", "REAL_OBSERVATION", "INTERNAL_EXPERIENCE", "EXTERNAL_VERIFIED_SOURCE", "HYPOTHESIS", "SIMULATION", "UNVALIDATED_RESULT"]);
const STATUSES = Object.freeze(["ACTIVE", "SUSPENDED", "INVALIDATED"]);
const STOP = new Set(("the and for with from into that this its are was were not but per each any all one two out via has have "
  + "les des une pour avec dans par sur est sont pas qui que aux du de la le un en et au ou ne se ce sa son ses "
  + "odg run runner test tests json docs evidence runtime core bin").split(" "));

const isObj = (v: any) => v !== null && typeof v === "object" && !Array.isArray(v);
const arr = (v: any) => (Array.isArray(v) ? v : []);
const str = (v: any) => (typeof v === "string" ? v : v == null ? "" : JSON.stringify(v));

/* features(text, components) — normalized, id-free feature set. Tokens containing a digit are dropped (item ids such
 * as V178-P1, versions, shas, counts), so a query can never match a precedent by its identifier. */
function tokens(text: string): string[] {
  return String(text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !/\d/.test(t) && !STOP.has(t));
}
function features(text: string, components: string[]): string[] {
  const out = new Set(tokens(text));
  for (const c of arr(components)) {
    if (typeof c !== "string" || !c.startsWith("runtime/")) continue;   // code components only (result records are not components)
    const base = c.split("/").pop()!.replace(/\.(test\.)?[jt]s$/, "");
    for (const seg of base.split(/[-_.]/)) if (seg.length >= 3 && !/\d/.test(seg) && !STOP.has(seg)) out.add("c:" + seg);
  }
  return [...out].sort();
}

function outcomeOf(grade: string): { outcome: string; reuse: string } {
  if (grade === "PASS") return { outcome: "SUCCEEDED", reuse: "REUSABLE_WITH_ADAPTATION" };
  if (grade === "PARTIAL") return { outcome: "PARTIAL", reuse: "PARTIAL_REUSE" };
  if (grade === "FAIL") return { outcome: "FAILED", reuse: "AVOID_UNCHANGED" };
  return { outcome: "UNKNOWN", reuse: "NOT_REUSABLE" };
}

/* buildEpisode(item, contract, validation) — one closed register item ⇒ one structured episode (pure). */
function buildEpisode(item: any, contract: any, validation: any, validationSha256: string | null): any {
  if (!isObj(item) || !isObj(item.closure) || item.closure.closed !== true) return null;
  const w = contract && isObj(contract.WORK_ITEM_CONTRACT) ? contract.WORK_ITEM_CONTRACT : {};
  const pre = isObj(w.preRegistration) ? w.preRegistration : {};
  const v = isObj(validation) ? validation : {};
  const grade = String(item.closure.grade || v.scenarioGrade || "UNKNOWN");
  const insp = isObj(v.experimentInspection) ? v.experimentInspection : {};
  const dispatch = contract && isObj(contract.authorization) && isObj(contract.authorization.dispatchTargets) ? contract.authorization.dispatchTargets : {};
  const components = [...new Set([...arr(w.write_set), ...Object.values(dispatch).map((d: any) => d && d.command).filter(Boolean)])].sort();
  const lessons: any[] = [];
  const addLesson = (text: any, klass: string, source: string) => { if (text != null && str(text).trim()) lessons.push({ text: str(text), class: klass, source }); };
  for (const l of arr(v.limits)) addLesson(l, "INTERNAL_EXPERIENCE", "validation.limits");
  if (v.lesson) addLesson(v.lesson, "INTERNAL_EXPERIENCE", "validation.lesson");
  if (isObj(v.learning)) {
    if (v.learning.hypothesis) addLesson(`${v.learning.hypothesis}: ${str(v.learning.why)}`, "INTERNAL_EXPERIENCE", "validation.learning");
    if (v.learning.nextLever) addLesson(v.learning.nextLever, "HYPOTHESIS", "validation.learning.nextLever");   // an untested idea, never a rule
  }
  if (v.adoption) addLesson(v.adoption, "INTERNAL_EXPERIENCE", "validation.adoption");
  for (const c of arr(v.criteria)) if (isObj(c) && c.status && c.status !== "MET") addLesson(`${c.id || "criterion"} ${c.status}: ${str(c.evidence).slice(0, 400)}`, "INTERNAL_EXPERIENCE", "validation.criteria");
  if (isObj(v.followUp) && v.followUp.rootCause) addLesson(`root cause: ${str(v.followUp.rootCause)}`, "INTERNAL_EXPERIENCE", "validation.followUp.rootCause");
  const corrections = arr(contract && contract.revisionHistory).map((r: any) => ({ revision: r.revision != null ? r.revision : null, reason: str(r.reason || r.why || r.summary || "").slice(0, 400) }));
  if (isObj(v.followUp) && v.followUp.correction) corrections.push({ revision: null, reason: `follow-up correction: ${str(v.followUp.correction).slice(0, 400)}` });
  const o = outcomeOf(grade);
  const inspected = insp.verdict === "ACCEPT";
  const mechanical = insp.kind === "MECHANICAL_VERIFIER" && insp.verdict === "CONSISTENT" && grade === "FAIL";   // MECH-1: negative results only
  const ep: any = {
    schema: SCHEMA, id: `EPISODE:${item.id}`, itemId: item.id, version: 1, status: "ACTIVE", statusHistory: [],
    title: str(item.title),
    context: { objective: str(w.objective), scope: w.scope != null ? w.scope : null },
    initialSituation: { baseline: pre.baseline != null ? pre.baseline : (contract && contract.beforeMetric != null ? contract.beforeMetric : null) },
    diagnosis: { question: pre.question != null ? pre.question : null, origin: contract && contract.origin != null ? contract.origin : null },
    decisions: [["metric", pre.metric], ["decisionRule", pre.decisionRule], ["thresholds", pre.thresholds], ["selectionRule", pre.selectionRule]]
      .filter(([, x]) => x != null).map(([what, value]) => ({ what, value })),
    steps: arr(item.closure.validatedSteps),
    components,
    results: { grade, outcome: o.outcome, basis: isObj(v.result) ? v.result.basis || null : null },
    difficulties: lessons.filter((l) => l.class === "INTERNAL_EXPERIENCE").map((l) => l.text),
    corrections,
    costs: { status: "NOT_MEASURED", note: "costs/durations are read from the experiment record when it declares them; never estimated here" },
    evidence: { validationRecord: item.closure.record, validationSha256, contractSha256: item.closure.contractSha256 || null, experimentSha256: item.closure.experimentSha256 || null,
      validationContractSha256: v.contractSha256 || null, inspection: inspected ? { verdict: "ACCEPT", inspectorSessionId: insp.inspectorSessionId || null, pr: insp.pr || null } : mechanical ? { verdict: "CONSISTENT", kind: "MECHANICAL_VERIFIER", verifier: insp.verifier || null } : { verdict: insp.verdict || "ABSENT" } },
    knowledgeClass: "INTERNAL_EXPERIENCE",
    confidence: inspected ? "INSPECTED_CRITERIA_VALIDATED" : mechanical ? "MECHANICALLY_VERIFIED_NEGATIVE" : "CRITERIA_VALIDATED_UNINSPECTED",
    method: { outcome: o.outcome, reuse: o.reuse },
    lessons,
    features: features([item.title, w.objective, pre.metric, pre.question].map(str).join(" "), components),
  };
  return ep;
}

/* reevaluate(episode, current) — conditions changed ⇒ INVALIDATED (new version; history kept; never deleted). */
function reevaluate(ep: any, current: any): any {
  const reasons: string[] = [];
  const e = ep.evidence || {};
  if (e.validationContractSha256 && current && current.contractSha256 && e.validationContractSha256 !== current.contractSha256) reasons.push("contract sha changed since validation");
  if (e.experimentSha256 && current && current.experimentSha256 && e.experimentSha256 !== current.experimentSha256) reasons.push("experiment sha differs from the validated experiment");
  if (!e.validationSha256) reasons.push("validation record unreadable (sha absent)");
  if (!reasons.length || ep.status === "INVALIDATED") return ep;
  return { ...ep, version: ep.version + 1, status: "INVALIDATED", statusHistory: [...ep.statusHistory, { from: ep.status, to: "INVALIDATED", reasons }] };
}
function suspend(ep: any, reason: string): any {
  if (!reason) throw new Error("suspend: a reason is required");
  return { ...ep, version: ep.version + 1, status: "SUSPENDED", statusHistory: [...arr(ep.statusHistory), { from: ep.status, to: "SUSPENDED", reasons: [reason] }] };
}

/* buildEpisodes({ register, contracts, readRecord, contractSha256 }) — every CLOSED_* register item with a CLOSE-1 record,
 * each re-evaluated against the CURRENT conditions: the current contract's sha (contractSha256(contract), injected — e.g.
 * odg-authorization-scope.contractSha256; absent ⇒ the register's recorded closure sha) and the validated experiment sha. */
function buildEpisodes(src: any): any[] {
  const items = arr(src && src.register && src.register.items);
  const C = new Map(arr(src && src.contracts).map((c: any) => [c.scenario, c]));
  const out: any[] = [];
  for (const it of items) {
    if (!String(it.status || "").startsWith("CLOSED_") || !isObj(it.closure) || !it.closure.record) continue;
    let rec: any = null;
    try { rec = src.readRecord(it.closure.record); } catch { rec = null; }
    const contract = C.get(it.id) || null;
    const ep = buildEpisode(it, contract, rec ? rec.json : null, rec ? rec.sha256 : null);
    if (!ep) continue;
    let currentSha: any = it.closure.contractSha256 || null;
    if (typeof src.contractSha256 === "function") { try { currentSha = contract ? src.contractSha256(contract) : null; } catch { currentSha = null; } }
    const ev = rec && isObj(rec.json) && isObj(rec.json.experimentEvidence) ? rec.json.experimentEvidence.experimentSha256 || null : null;
    out.push(reevaluate(ep, { contractSha256: currentSha || "ABSENT", experimentSha256: ev }));
  }
  return out;
}

/* toPrecedentStore(episodes) — record every episode in the canonical decision-precedent store. */
function toPrecedentStore(episodes: any[], store?: any): any {
  const s = store || DP.emptyStore();
  for (const ep of episodes) {
    DP.recordPrecedent(s, { signature: ep.id, sourceMission: ep.itemId, sourceEvidence: ep.evidence.validationRecord, capturedAt: null, version: ep.version,
      decision: { method: ep.method, steps: ep.steps, decisions: ep.decisions }, applicability: { status: ep.status, knowledgeClass: ep.knowledgeClass, confidence: ep.confidence },
      limitations: ep.difficulties, authoredBy: "ODG", features: ep.features, episode: ep });
  }
  return s;
}

/* recallForMission(store, mission, opts) — comparable experiences for a NEW mission (id excluded; never auto-applied). */
function recallForMission(store: any, mission: any, opts?: any): any {
  const o = { k: 3, minSimilarity: 0.05, ...(opts || {}) };
  if (!isObj(mission)) return { status: "NOT_MEASURED", reason: "no mission", rule: RULE };
  const q = features([mission.title, mission.objective, mission.metric, mission.question].map(str).join(" "), arr(mission.components));
  if (!q.length) return { status: "NOT_MEASURED", reason: "mission has no usable features", rule: RULE };
  const ranked = DP.recallComparable(store, { features: q }, { k: o.k, minSimilarity: o.minSimilarity, excludeMissions: [mission.id].filter(Boolean) });
  const comparable = ranked.map((r: any) => {
    const ep = r.entry.episode;
    const blockers: string[] = [];
    if (ep.status !== "ACTIVE") blockers.push(`episode ${ep.status}`);
    if (ep.method.reuse === "AVOID_UNCHANGED") blockers.push("method FAILED: re-use only with a cited changed input (RB-REATTEMPT-CHANGED-INPUT)");
    return { episode: ep.id, item: ep.itemId, similarity: r.similarity, shared: r.shared, onlyInPrecedent: r.onlyInPrecedent.slice(0, 12), onlyInMission: r.onlyInQuery.slice(0, 12),
      outcome: ep.method.outcome, reuse: ep.method.reuse, status: ep.status, applicable: blockers.length === 0 && ep.method.reuse !== "NOT_REUSABLE", blockers,
      knowledgeClass: ep.knowledgeClass, confidence: ep.confidence, lessons: ep.lessons, steps: ep.steps, decisions: ep.decisions, evidence: ep.evidence.validationRecord };
  });
  return {
    status: comparable.length ? "RECALLED" : "NO_COMPARABLE", rule: RULE, queryFeatures: q,
    comparable,
    succeeded: comparable.filter((c: any) => c.outcome === "SUCCEEDED").map((c: any) => c.item),
    failed: comparable.filter((c: any) => c.outcome === "FAILED").map((c: any) => c.item),
    partial: comparable.filter((c: any) => c.outcome === "PARTIAL").map((c: any) => c.item),
    adaptation: { autoApply: false, note: "a precedent's steps/decisions are a starting point; every difference (onlyInMission/onlyInPrecedent) must be checked against the present contract before reuse" },
    uncertainty: `${comparable.length} comparable episode(s) at similarity ≥ ${o.minSimilarity} (lexical-structural Jaccard, not semantic proof); episodes are INTERNAL_EXPERIENCE, never corroborated facts`,
  };
}

module.exports = { SCHEMA, RULE, KNOWLEDGE_CLASSES, STATUSES, tokens, features, buildEpisode, buildEpisodes, reevaluate, suspend, toPrecedentStore, recallForMission };
export {};
