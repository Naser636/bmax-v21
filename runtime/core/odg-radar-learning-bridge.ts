#!/usr/bin/env node
"use strict";
/*
 * V360 — RADAR → LEARNING INTELLIGENCE bridge. PURE, deterministic. Turns QUALIFIED radar signals (arXiv/GitHub, from
 * odg-radar-collect-to-signals / odg-radar-tech-sources) into CANDIDATE lessons and routes them through the canonical memory:
 *   signal → PROVENANCE check → DEDUP vs known → COMPARE/NOVELTY → RELIABILITY → KNOWLEDGE EXTRACTION → CANDIDATE LESSON →
 *   TRUST GATE (memory-trust-gate) → memory index (memory-taxonomy) → retrievable mission CONTEXT.
 * It reuses the CANONICAL memory (memory-taxonomy) + trust gate — NO second learning engine, NO parallel memory store.
 *
 * HONESTY (§4): an external source is NEVER an automatic fact. Every lesson is UNCONFIRMED (status UNVERIFIED, consolidated
 * false) with full provenance/confidence; the trust gate DENIES promoting a raw external lesson to a trusted fact
 * (external author ∉ trustedAuthors) — the lesson is reusable as CONTEXT (a hint), not as truth. Already-known signals are
 * deduplicated (no false new knowledge); a contradiction is HELD for resolution; a quarantined/injected signal is DROPPED.
 */

const MEM = require("./memory-taxonomy.js");          // canonical memory index (same store learning-loop uses)
const TRUST = require("./memory-trust-gate.js");      // retrieval-time trust gate (deny-by-default)

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function isNum(v: any): boolean { return typeof v === "number" && isFinite(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

/**
 * radarSignalsToLessons(signals, knownLessons?, opts?) -> { candidateLessons, lessonIndex, alreadyKnown, contradictions,
 *   dropped, counts, note }. signals: qualified radar signals [{ title, claims, categories, fingerprint, reliability,
 *   decision, provenance:{sourceId,host,fetchedAt} }]. opts: { knownFingerprints?, contradicts?(signal), trustedAuthors?, asOf? }.
 */
function radarSignalsToLessons(signals: any, knownLessons: any = [], opts: any = {}): any {
  const o = isObj(opts) ? opts : {};
  const known = new Set<string>(arr(knownLessons).map((l: any) => (isObj(l) ? (l.fingerprint || l.id) : String(l))).filter(Boolean).concat(arr(o.knownFingerprints).map(String)));
  const principleCount: Record<string, number> = {};
  const candidateLessons: any[] = [], alreadyKnown: string[] = [], contradictions: any[] = [], dropped: any[] = [];
  for (const s of arr(signals).filter(isObj)) {
    // PROVENANCE: no attributable provenance / title ⇒ never a fact.
    if (!isObj(s.provenance) || !isStr(s.provenance.sourceId) || !isStr(s.title)) { dropped.push(freeze({ reason: "no provenance / no title (unattributed — never learned)" })); continue; }
    // injection / quarantine ⇒ dropped (external content is untrusted).
    if (s.decision === "QUARANTINE" || s.untrusted === true) { dropped.push(freeze({ title: s.title, reason: "quarantined (untrusted/injected)" })); continue; }
    const fp = isStr(s.fingerprint) ? s.fingerprint : (s.provenance.sourceId + "|" + s.title.toLowerCase());
    // DEDUP vs existing knowledge ⇒ ALREADY_KNOWN (no false new lesson).
    if (known.has(fp)) { alreadyKnown.push(fp); continue; }
    // CONTRADICTION ⇒ held for resolution (not learned as fact).
    if (typeof o.contradicts === "function" && o.contradicts(s) === true) { contradictions.push(freeze({ fingerprint: fp, title: s.title, status: "PENDING_RESOLUTION", note: "contradicts existing knowledge — held, not learned" })); continue; }
    const domain = (Array.isArray(s.categories) && s.categories[0]) || "general";
    const pk = domain + "|" + s.title.toLowerCase().slice(0, 60);
    principleCount[pk] = (principleCount[pk] || 0) + 1;
    const lesson: any = {
      id: "lesson:discovery:" + fp, family: "discovery", fingerprint: fp,
      provenance: "radar:" + s.provenance.sourceId, source: s.provenance.sourceId, fetchedAt: s.provenance.fetchedAt || null,
      // family "discovery" is intentionally OUTSIDE memory-taxonomy's canonical FAMILIES ⇒ quality is never OK and the
      // trust gate can never promote an external lesson to a trusted fact (a deliberate safety barrier, not a data blip).
      principle: s.title, claims: arr(s.claims).slice(0, 10), domain,
      confidence: isNum(s.reliability) ? s.reliability : 0.5,
      validationStatus: "UNCONFIRMED", status: "UNVERIFIED", consolidated: false,
      authoredBy: "radar:" + s.provenance.sourceId,
      evidence: [{ source: s.provenance.sourceId, host: s.provenance.host || null }],
      reuseHistory: [],
    };
    // TRUST GATE: an external source is not a trusted author ⇒ NOT promoted to a trusted fact (correct, deny-by-default).
    const trust = TRUST.assessMemoryTrust(lesson, { trustedAuthors: arr(o.trustedAuthors), asOf: o.asOf });
    // deep-freeze evidence ENTRIES (not just the array) — no mutable provenance leak (independent inspection fix).
    candidateLessons.push(freeze({ ...lesson, evidence: freeze(lesson.evidence.map(freeze)), claims: freeze(lesson.claims), reuseHistory: freeze([]), trustVerdict: trust.verdict, promotedToFact: trust.trusted === true }));
  }
  // corroboration (within batch): a principle seen from ≥2 signals is CORROBORATED (higher confidence) — still not auto-fact.
  const corroborated = candidateLessons.filter((l: any) => (principleCount[l.domain + "|" + String(l.principle).toLowerCase().slice(0, 60)] || 0) >= 2).map((l: any) => l.fingerprint);
  const lessonIndex = MEM.index(candidateLessons, o.asOf || 1);  // canonical memory index — no new store
  return freeze({
    candidateLessons: freeze(candidateLessons), lessonIndex,
    alreadyKnown: freeze(alreadyKnown), corroboratedFingerprints: freeze(corroborated),
    contradictions: freeze(contradictions), dropped: freeze(dropped),
    counts: freeze({ in: arr(signals).length, candidates: candidateLessons.length, alreadyKnown: alreadyKnown.length, contradictions: contradictions.length, dropped: dropped.length, corroborated: corroborated.length }),
    note: "Radar signals → CANDIDATE lessons (UNCONFIRMED; external sources are never auto-facts); provenance kept; dedup vs known; contradictions held; quarantined dropped; trust gate denies promoting a raw external lesson to a trusted fact — reusable as CONTEXT, not truth; canonical memory (memory-taxonomy), no parallel store",
  });
}

/**
 * retrieveLessonsForMission(lessons, topic, opts?) -> { selected, note }. Selects the relevant CANDIDATE lessons for a
 * mission (by domain/keyword, highest confidence first, top-k) as CONTEXT HINTS, and records the reuse. Not all knowledge —
 * only the relevant, by subject/reliability (§5). A MEASURED improvement still requires a real mission result (never fabricated).
 */
function retrieveLessonsForMission(lessons: any, topic: any, opts: any = {}): any {
  const o = isObj(opts) ? opts : {};
  const k = isNum(o.k) && o.k > 0 ? Math.floor(o.k) : 3;
  const dom = isObj(topic) ? topic.domain : topic;
  const kw = isObj(topic) && isStr(topic.keyword) ? topic.keyword.toLowerCase() : null;
  const minConf = isNum(o.minConfidence) ? o.minConfidence : 0;
  const selected = arr(lessons).filter(isObj)
    .filter((l: any) => (isStr(dom) ? l.domain === dom : true) && (kw ? String(l.principle || "").toLowerCase().includes(kw) : true) && (Number(l.confidence) || 0) >= minConf)
    .slice().sort((a: any, b: any) => (Number(b.confidence) || 0) - (Number(a.confidence) || 0))
    .slice(0, k)
    .map((l: any) => freeze({ id: l.id, principle: l.principle, source: l.source, confidence: l.confidence, validationStatus: l.validationStatus, reuseHistory: freeze(arr(l.reuseHistory).concat([{ mission: isObj(topic) ? topic.mission || null : null, at: o.at || null }])) }));
  return freeze({ selected: freeze(selected), note: "relevant CANDIDATE lessons selected as mission CONTEXT (UNCONFIRMED hints, not facts); reuse recorded; a MEASURED improvement requires a real mission result (not fabricated)" });
}

const RADAR_LEARNING_BRIDGE_CONTRACT = Object.freeze({
  id: "V360-RADAR-LEARNING-BRIDGE",
  purpose: "connect qualified radar signals → Learning Intelligence: candidate lessons (UNCONFIRMED) through the canonical memory + trust gate, retrievable as mission context; no second learning engine / parallel memory",
  reuses: Object.freeze(["memory-taxonomy.index (the canonical memory store — same as learning-loop)", "memory-trust-gate.assessMemoryTrust (deny-by-default; external source ⇒ not promoted to fact)", "qualified signals from odg-radar-collect-to-signals / odg-radar-tech-sources"]),
  invariants: Object.freeze([
    "an external source (arXiv/GitHub) is NEVER an automatic fact: every lesson is UNCONFIRMED (status UNVERIFIED, consolidated false) with provenance + confidence; the trust gate denies promoting it to a trusted fact",
    "already-known signals are DEDUPLICATED (no false new knowledge); a contradiction is HELD (PENDING_RESOLUTION); a quarantined/injected signal is DROPPED",
    "retrieval selects only the RELEVANT lessons (domain/keyword/confidence) as CONTEXT hints — not all knowledge; reuse is recorded; a MEASURED improvement requires a real mission result (never fabricated)",
    "PURE/deterministic/frozen; reuses the canonical memory-taxonomy + memory-trust-gate — no second store/engine; no network",
  ]),
});

module.exports = { radarSignalsToLessons, retrieveLessonsForMission, RADAR_LEARNING_BRIDGE_CONTRACT };
export {};
