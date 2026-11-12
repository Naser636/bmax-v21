#!/usr/bin/env node
"use strict";

/*
 * WI-FR-01 — ODG FRONTIER RADAR (foundation). PURE, deterministic. The Radar OBSERVES the external world
 * (science/technology/models/market/security/regulation) and turns raw signals into QUALIFIED technology
 * candidates and MISSION PROPOSALS. It is NOT a link aggregator and NOT a weekly newsletter: it carries a
 * Source Registry + the full qualification pipeline
 *   SIGNAL → NORMALIZE → SANITIZE(untrusted) → DEDUPLICATE → QUALIFY → DECIDE → TECHNOLOGY CANDIDATE
 *          → COMPARE-WITH-ODG (frontier gap) → MISSION PROPOSAL.
 *
 * Hard separations (enforced, not decorative): SIGNAL ≠ FACT (a signal is epistemic status "UNVERIFIED",
 * NEVER auto-promoted to PROVEN/OBSERVED); the Radar GOVERNS NOTHING and GRANTS NO PERMISSION (a mission
 * proposal is PROPOSED, linked to the canonical mission path, never an authorization); external content is
 * UNTRUSTED DATA, never an instruction (prompt-injection ⇒ QUARANTINE). Decisions are fail-closed:
 * ACCEPT_FOR_EXPERIMENT | WATCH | REJECT | QUARANTINE | DEFER | ESCALATE.
 *
 * REUSE, NO DUPLICATION: real network collection reuses bounded-http-client (HTTPS-only allowlist + SSRF
 * guard) via an INJECTED authorized fetcher — this module adds NO new network client; absent fetcher ⇒
 * fail-closed AUTH_REQUIRED (fixtures prove the PROCESSING pipeline, never live Internet). The epistemic
 * status vocabulary reuses world-model's EPISTEMIC_STATUS. Pure (no clock/random; `now` passed in). Dual export.
 */

const crypto = require("crypto");
const { validateUrl, ALLOWLIST } = require("./bounded-http-client");
const { EPISTEMIC_STATUS } = require("./world-model");

const SOURCE_TYPES = Object.freeze(["rss", "api", "release", "repo", "publication", "bulletin", "standard", "documentation"]);
const DECISIONS = Object.freeze(["ACCEPT_FOR_EXPERIMENT", "WATCH", "REJECT", "QUARANTINE", "DEFER", "ESCALATE"]);
const COLLECT_STATE = Object.freeze({ COLLECTED: "COLLECTED", AUTH_REQUIRED: "AUTH_REQUIRED", BLOCKED_SOURCE: "BLOCKED_SOURCE", SOURCE_UNAVAILABLE: "SOURCE_UNAVAILABLE" });
// External text we must treat as DATA, never as instructions (OWASP-LLM01 prompt-injection surface).
const INJECTION_PATTERNS = Object.freeze([
  /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions/i,
  /disregard\s+(?:the\s+)?(?:system|previous)/i,
  /you\s+are\s+now\s+(?:a|an|the)\b/i,
  /system\s*prompt/i,
  /<\s*script\b/i,
  /\bBEGIN\s+(?:SYSTEM|PROMPT)\b/i,
]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function clamp01(n: any): number { const x = typeof n === "number" && isFinite(n) ? n : 0; return x < 0 ? 0 : x > 1 ? 1 : x; }
function round(n: number): number { return Number(n.toFixed(4)); }
function sha(s: string): string { return crypto.createHash("sha256").update(String(s)).digest("hex").slice(0, 16); }

/**
 * registerSource(registry, spec, {now}) -> { ok, registry, source } | { ok:false, error }.
 * Fail-closed: id/owner/url/type required; url must pass the bounded-http-client allowlist (reuse, no new client);
 * reliability ∈ [0,1]; license recorded (unknown license is allowed into the registry but carried as a limit).
 */
function registerSource(registry: any, spec: any, opts: any): any {
  const reg = isObj(registry) ? { ...registry } : {};
  const s = isObj(spec) ? spec : {};
  const now = opts && opts.now !== undefined ? opts.now : null;
  if (!isStr(s.id)) return Object.freeze({ ok: false, error: "source id required" });
  if (!isStr(s.owner)) return Object.freeze({ ok: false, error: "source owner required (provenance)" });
  if (!isStr(s.url)) return Object.freeze({ ok: false, error: "source url required" });
  if (!SOURCE_TYPES.includes(s.type)) return Object.freeze({ ok: false, error: "source type ∈ " + SOURCE_TYPES.join(",") });
  const urlCheck = validateUrl(s.url);
  if (!urlCheck || urlCheck.ok !== true) return Object.freeze({ ok: false, error: "source url rejected by egress allowlist/SSRF guard: " + (urlCheck && urlCheck.reason ? urlCheck.reason : "not allowed") });
  const source = Object.freeze({
    id: s.id, owner: s.owner, url: s.url, type: s.type,
    cadence: isStr(s.cadence) ? s.cadence : "weekly",
    method: isStr(s.method) ? s.method : "GET",
    reliability: clamp01(s.reliability),
    license: isStr(s.license) ? s.license : "UNKNOWN",
    limits: isStr(s.limits) ? s.limits : null,
    lastCollected: s.lastCollected !== undefined ? s.lastCollected : null,
    registeredAt: now,
    errors: Object.freeze(arr(s.errors).slice()),
  });
  reg[s.id] = source;
  return Object.freeze({ ok: true, registry: Object.freeze(reg), source });
}

/** normalizeSignal(raw, {sourceId, now}) -> canonical signal. A signal is epistemic status UNVERIFIED (never a fact). */
function normalizeSignal(raw: any, opts: any): any {
  const r = isObj(raw) ? raw : {};
  const o = isObj(opts) ? opts : {};
  const title = isStr(r.title) ? r.title.trim() : "";
  const sourceId = isStr(o.sourceId) ? o.sourceId : (isStr(r.sourceId) ? r.sourceId : "unknown");
  const fingerprint = sha(sourceId + "|" + title.toLowerCase() + "|" + (isStr(r.version) ? r.version : ""));
  return Object.freeze({
    id: sha(fingerprint + "|id"),
    sourceId,
    title,
    lang: isStr(r.lang) ? r.lang : "und",
    publishedAt: r.publishedAt !== undefined ? r.publishedAt : null,
    version: isStr(r.version) ? r.version : null,
    author: isStr(r.author) ? r.author : null,
    categories: Object.freeze(arr(r.categories).filter(isStr)),
    claims: Object.freeze(arr(r.claims).filter(isStr)),
    body: isStr(r.body) ? r.body : "",
    provenance: Object.freeze({ sourceId, collectedAt: o.now !== undefined ? o.now : null }),
    fingerprint,
    // SIGNAL ≠ FACT: a freshly observed signal is never factual (world-model vocabulary reused).
    epistemicStatus: EPISTEMIC_STATUS.includes("UNVERIFIED") ? "UNVERIFIED" : "UNVERIFIED",
  });
}

/** sanitizeExternal(signal) -> { untrusted, injectionFlags }. External content is DATA, never an instruction. */
// V141 (OWASP-LLM01: string filters are EVADED via encodings, e.g. Base64) — decode suspicious base64 blobs and re-scan, so
// an injection hidden as base64 can no longer slip past the plain-text denylist. PURELY ADDITIVE: it can only ADD flags
// (more untrusted), never clear one. Bounded (blob length 16–4096, max 20 blobs) so it stays cheap and cannot be abused to hang.
function decodeB64Matches(hay: string): number[] {
  const flags: number[] = [];
  const blobs = String(hay).match(/[A-Za-z0-9+/]{16,4096}={0,2}/g) || [];
  for (const b of blobs.slice(0, 20)) {
    if (b.length % 4 !== 0 && !/=+$/.test(b)) continue;                          // skip obviously non-base64 runs
    let dec = "";
    try { dec = Buffer.from(b, "base64").toString("utf8"); } catch { continue; }
    if (!dec || !/[ -~]/.test(dec)) continue;                                    // ignore binary-looking decodes
    INJECTION_PATTERNS.forEach((re: RegExp, i: number) => { if (re.test(dec)) flags.push(100 + i); });   // 100+ = encoded-injection
  }
  return flags;
}
function sanitizeExternal(signal: any): any {
  const s = isObj(signal) ? signal : {};
  const hay = [s.title, s.body].concat(arr(s.claims)).filter(isStr).join("\n");
  const plain = INJECTION_PATTERNS.map((re: RegExp, i: number) => (re.test(hay) ? i : -1)).filter((i: number) => i >= 0);
  const encoded = decodeB64Matches(hay);                                         // OWASP-LLM01: catch base64-encoded injection
  const flags = plain.concat(encoded);
  return Object.freeze({ untrusted: flags.length > 0, injectionFlags: Object.freeze(flags), encodedInjection: encoded.length > 0 });
}

/** deduplicate(signals) -> unique by fingerprint (stable, keeps first occurrence). Pure. */
function deduplicate(signals: any): any {
  const seen = new Set();
  const out: any[] = [];
  for (const s of arr(signals)) { if (!isObj(s) || !isStr(s.fingerprint)) continue; if (seen.has(s.fingerprint)) continue; seen.add(s.fingerprint); out.push(s); }
  return Object.freeze(out);
}

/**
 * qualify(signal, ctx) -> scores. ctx: { sourceReliability, baseline:{ seenFingerprints?, focusAreas?, crossChecked? } }.
 * Deterministic: a CLAIM is discounted by source reliability (claim ≠ reality); relevance = category overlap with focus.
 */
function qualify(signal: any, ctx: any): any {
  const s = isObj(signal) ? signal : {};
  const c = isObj(ctx) ? ctx : {};
  const b = isObj(c.baseline) ? c.baseline : {};
  const reliability = clamp01(c.sourceReliability);
  const seen = new Set(arr(b.seenFingerprints).filter(isStr));
  const novelty = seen.has(s.fingerprint) ? 0.1 : (arr(s.claims).length > 0 ? 0.8 : 0.5);
  const focus = new Set(arr(b.focusAreas).filter(isStr));
  const cats = arr(s.categories).filter(isStr);
  const hits = cats.filter((x: string) => focus.has(x)).length;
  const relevance = focus.size === 0 ? 0.5 : clamp01(cats.length ? hits / cats.length : 0);
  // impact is a CLAIM, trusted only in proportion to source reliability (claim ≠ reality).
  const impact = round(clamp01(c.impactHint) * reliability);
  const crossChecked = b.crossChecked === true;
  const confidence = round(reliability * (crossChecked ? 1 : 0.6));
  const contradiction = s.contradiction === true || b.contradiction === true;
  return Object.freeze({ novelty: round(novelty), reliability: round(reliability), relevance: round(relevance), impact, confidence, crossChecked, contradiction });
}

/** decide(qualified, signalMeta) -> a DECISION. Fail-closed. signalMeta: { untrusted } from sanitizeExternal. */
function decide(qualified: any, signalMeta: any): any {
  const q = isObj(qualified) ? qualified : {};
  const m = isObj(signalMeta) ? signalMeta : {};
  if (m.untrusted === true) return "QUARANTINE";                 // injection/active content ⇒ isolate
  if (clamp01(q.reliability) === 0) return "REJECT";             // unknown/zero-reliability source ⇒ reject
  if (q.contradiction === true) return "ESCALATE";              // contradicts known state ⇒ human/verify
  if (q.confidence >= 0.7 && q.relevance >= 0.5) return "ACCEPT_FOR_EXPERIMENT";
  if (q.relevance >= 0.5 && q.confidence < 0.7) return "DEFER";  // relevant but not yet confident ⇒ defer (before novelty-WATCH)
  if (q.novelty >= 0.5 && q.relevance >= 0.3) return "WATCH";
  return "WATCH";
}

/** toCandidate(signal, qualified, {now}) -> a technology candidate registry entry (PROPOSED maturity). */
function toCandidate(signal: any, qualified: any, opts: any): any {
  const s = isObj(signal) ? signal : {};
  const q = isObj(qualified) ? qualified : {};
  const o = isObj(opts) ? opts : {};
  return Object.freeze({
    id: "cand:" + (isStr(s.fingerprint) ? s.fingerprint : sha(String(s.title))),
    title: s.title, sourceId: s.sourceId, version: s.version,
    claims: Object.freeze(arr(s.claims).filter(isStr)),
    scores: Object.freeze({ novelty: q.novelty, reliability: q.reliability, relevance: q.relevance, impact: q.impact, confidence: q.confidence }),
    maturity: "CANDIDATE",            // declared ≠ configured ≠ testable ≠ operational
    epistemicStatus: "UNVERIFIED",     // a candidate is never a fact
    createdAt: o.now !== undefined ? o.now : null,
  });
}

/** compareWithOdg(candidate, odgBaseline) -> frontier gap (limitation/gap/gain/cost/risk/experimentRequired). Pure. */
function compareWithOdg(candidate: any, odgBaseline: any): any {
  const c = isObj(candidate) ? candidate : {};
  const base = isObj(odgBaseline) ? odgBaseline : {};
  const known = new Set(arr(base.capabilities).filter(isStr));
  const addresses = arr(c.claims).filter(isStr);
  const alreadyCovered = addresses.every((a: string) => known.has(a)) && addresses.length > 0;
  const gain = alreadyCovered ? 0 : round(clamp01((c.scores && c.scores.impact) || 0));
  return Object.freeze({
    candidateId: c.id,
    limitation: isStr(base.limitation) ? base.limitation : null,
    gap: alreadyCovered ? "NONE (already covered)" : "POTENTIAL",
    potentialGain: gain,
    cost: isStr(base.adoptionCost) ? base.adoptionCost : "UNKNOWN",
    risk: (c.scores && c.scores.reliability < 0.5) ? "HIGH (low-reliability source)" : "MEDIUM",
    // a gap worth an experiment exists when the capability is NOT already covered; the real gain is UNKNOWN
    // (potentialGain is only the discounted CLAIM) until the Frontier Lab experiment measures it.
    experimentRequired: !alreadyCovered,
  });
}

/**
 * toMissionProposal(candidate, gap, {now}) -> a PROPOSAL only. GRANTS NO PERMISSION and does not enter execution;
 * it links to the canonical mission path at status PROPOSED (the human/ODG governance decides admission).
 */
function toMissionProposal(candidate: any, gap: any, opts: any): any {
  const c = isObj(candidate) ? candidate : {};
  const g = isObj(gap) ? gap : {};
  const o = isObj(opts) ? opts : {};
  if (!g.experimentRequired) return null; // no gap ⇒ no proposal
  return Object.freeze({
    kind: "MISSION_PROPOSAL",
    status: "PROPOSED",                 // PROPOSED ≠ AUTHORIZED ≠ EXECUTING
    grantsNoPermission: true,
    candidateId: c.id,
    objective: "Experiment: evaluate \"" + (isStr(c.title) ? c.title : "candidate") + "\" against ODG baseline in isolation (Frontier Lab).",
    rationale: Object.freeze({ gap: g.gap, potentialGain: g.potentialGain, risk: g.risk }),
    linksToCanonicalMissionPath: true,
    proposedAt: o.now !== undefined ? o.now : null,
  });
}

/**
 * collect(source, {httpGet, now}) -> { state, provenance, raw? }. FAIL-CLOSED. Reuses bounded-http-client's
 * allowlist via validateUrl; performs NO built-in network I/O — the real fetch is the INJECTED httpGet
 * (absent ⇒ AUTH_REQUIRED; blocked url ⇒ BLOCKED_SOURCE). Fixtures/mock httpGet prove the pipeline, never the Internet.
 */
async function collect(source: any, opts: any): Promise<any> {
  const s = isObj(source) ? source : {};
  const o = isObj(opts) ? opts : {};
  const provenance = Object.freeze({ sourceId: s.id || null, url: s.url || null, collectedAt: o.now !== undefined ? o.now : null });
  const urlCheck = validateUrl(s.url);
  if (!urlCheck || urlCheck.ok !== true) return Object.freeze({ state: COLLECT_STATE.BLOCKED_SOURCE, reason: "url not allowed by egress allowlist/SSRF guard", provenance });
  if (typeof o.httpGet !== "function") return Object.freeze({ state: COLLECT_STATE.AUTH_REQUIRED, reason: "no authorized fetcher/egress injected — live collection not possible without an authorized connector", provenance });
  try {
    const resp = await o.httpGet(s.url, { timeoutMs: typeof o.timeoutMs === "number" ? o.timeoutMs : 8000 });
    if (!resp || typeof resp.statusCode !== "number" || resp.statusCode >= 400) return Object.freeze({ state: COLLECT_STATE.SOURCE_UNAVAILABLE, reason: "HTTP " + (resp && resp.statusCode), provenance });
    return Object.freeze({ state: COLLECT_STATE.COLLECTED, provenance, raw: resp.body !== undefined ? resp.body : null });
  } catch (e: any) {
    return Object.freeze({ state: COLLECT_STATE.SOURCE_UNAVAILABLE, reason: "fetch error: " + (e && e.message ? e.message : String(e)), provenance });
  }
}

/**
 * runRadar(input) -> structured frontier report. input: { registry, rawSignals, baseline, odgBaseline, now }.
 * Orchestrates NORMALIZE → SANITIZE → DEDUP → QUALIFY → DECIDE → CANDIDATE → GAP → PROPOSAL. Pure (collect is separate).
 */
function runRadar(input: any): any {
  const i = isObj(input) ? input : {};
  const registry = isObj(i.registry) ? i.registry : {};
  const baseline = isObj(i.baseline) ? i.baseline : {};
  const odgBaseline = isObj(i.odgBaseline) ? i.odgBaseline : {};
  const now = i.now !== undefined ? i.now : null;

  const normalized = arr(i.rawSignals).map((r: any) => normalizeSignal(r, { sourceId: isObj(r) ? r.sourceId : undefined, now }));
  const unique = deduplicate(normalized);
  const assessed = unique.map((sig: any) => {
    const meta = sanitizeExternal(sig);
    const src = registry[sig.sourceId];
    const sourceReliability = src ? src.reliability : 0; // unknown source ⇒ reliability 0 ⇒ REJECT (fail-closed)
    const q = qualify(sig, { sourceReliability, impactHint: isObj(baseline.impactHints) ? baseline.impactHints[sig.fingerprint] : undefined, baseline });
    const decision = decide(q, meta);
    let candidate = null, gap = null, proposal = null;
    if (decision === "ACCEPT_FOR_EXPERIMENT") {
      candidate = toCandidate(sig, q, { now });
      gap = compareWithOdg(candidate, odgBaseline);
      proposal = toMissionProposal(candidate, gap, { now });
    }
    return Object.freeze({ signal: sig, untrusted: meta.untrusted, qualification: q, decision, candidate, gap, proposal });
  });

  const byDecision: any = {};
  for (const d of DECISIONS) byDecision[d] = 0;
  for (const a of assessed) byDecision[a.decision] = (byDecision[a.decision] || 0) + 1;
  const candidates = assessed.map((a: any) => a.candidate).filter(Boolean);
  const proposals = assessed.map((a: any) => a.proposal).filter(Boolean);
  const quarantined = assessed.filter((a: any) => a.decision === "QUARANTINE").length;

  return Object.freeze({
    total: normalized.length,
    unique: unique.length,
    byDecision: Object.freeze(byDecision),
    quarantined,
    candidates: Object.freeze(candidates),
    proposals: Object.freeze(proposals),
    assessed: Object.freeze(assessed),
    note: "SIGNAL ≠ FACT; proposals are PROPOSED (grant no permission); the Radar governs nothing",
  });
}

const FRONTIER_RADAR_CONTRACT = Object.freeze({
  id: "WI-FR-01-FRONTIER-RADAR",
  source: "Resumption mandate §4.1 (Frontier Radar / ODG World Radar) — source registry + qualification pipeline + mission proposal",
  sourceTypes: SOURCE_TYPES,
  decisions: DECISIONS,
  collectStates: Object.freeze(Object.values(COLLECT_STATE)),
  allowlist: ALLOWLIST,
  notAuthority: "the Radar OBSERVES the external world; it governs ODG nothing, grants NO permission, and certifies no discovery of its own — a mission proposal is PROPOSED, decided by ODG governance",
  invariants: Object.freeze([
    "pure/deterministic: signals + registry + baseline in → frontier report out (no clock/random; now passed in)",
    "SIGNAL ≠ FACT: a signal/candidate is epistemic status UNVERIFIED, never auto-promoted to PROVEN/OBSERVED",
    "external content is UNTRUSTED DATA, never an instruction; prompt-injection ⇒ QUARANTINE",
    "collection reuses bounded-http-client (allowlist+SSRF) via an INJECTED fetcher; absent ⇒ AUTH_REQUIRED (no built-in network client)",
    "unknown/zero-reliability source ⇒ REJECT; contradiction ⇒ ESCALATE (fail-closed decisions)",
    "a mission proposal GRANTS NO PERMISSION and links to the canonical mission path at status PROPOSED",
    "a CLAIM is discounted by source reliability (claim ≠ reality); impact is never trusted at face value",
  ]),
});

module.exports = {
  SOURCE_TYPES, DECISIONS, COLLECT_STATE, FRONTIER_RADAR_CONTRACT,
  registerSource, normalizeSignal, sanitizeExternal, deduplicate, qualify, decide,
  toCandidate, compareWithOdg, toMissionProposal, collect, runRadar,
};

if (require.main === module) { process.stdout.write(JSON.stringify(FRONTIER_RADAR_CONTRACT, null, 2) + "\n"); }

export {};
