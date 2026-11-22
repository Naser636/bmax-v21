#!/usr/bin/env node
"use strict";

/*
 * V254/V257 CM-RADAR-GATE-CHAIN (read-only). The directive's canonical chain is
 *   RECHERCHE → SOURCE → QUALIFICATION → COMPARAISON → LACUNE → PRIORITÉ → MISSION → MANDAT → CONSTRUCTION → TEST →
 *   INSPECTION → PREUVE → DÉCISION.
 * The research→mission half already EXISTS in odg-radar-to-mission-loop (pathMap: detect/provenance/reliability/
 * qualification/dedup/métier/proposal/gate). This module builds NO second radar/engine — it COMPOSES that real pathMap
 * with the EXECUTION half (construction/test/inspection/preuve/décision), each mapped to the REAL component that implements
 * it, and verifies end-to-end COVERAGE. FAIL-CLOSED: a stage with no backing component is MISSING and the chain is NOT wired.
 * HONESTY: the terminal DÉCISION (creating a REAL mission / real-world action) is OWNER_GATED (V184 K=OWNER_GATED); fully
 * AUTONOMOUS end-to-end execution is NOT_MEASURED — "wired as a governed pipeline" is NOT "autonomously executing".
 */

const RTM = require("./odg-radar-to-mission-loop.js");   // the REAL research→mission loop (pathMap, qualify, governanceGate)
// V372 step 1 (WIC-CM-RADAR-GATE-CHAIN-STEP1): the EXECUTED data path — reuses these canonical components, no new engine.
const crypto = require("crypto");
const KA = require("./odg-knowledge-acquisition.js");   // acquire(): corroboration, FACT vs single-source vs contested, 403 recorded
const MTG = require("./memory-trust-gate.js");          // assessMemoryTrust(): deny-by-default retrieval/admission gate
const IC = require("./odg-improvement-chain.js");       // run(): consumes odg-sandbox-integration-gate.decide()
const ACTOR = require("./actor-provenance.js");         // EXECUTOR.ODG attribution
const COR = require("./odg-claim-corroboration.js");    // re-derive corroboration at reuse (never trust a record's declared counts)

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

const STATUS = Object.freeze(["EXISTING_VALIDATED", "EXISTING_PARTIAL", "OWNER_GATED", "NOT_MEASURED", "MISSING"]);

// the EXECUTION half — each stage mapped to the REAL merged+tested component that backs it (no second engine).
const EXECUTION_STAGES = Object.freeze([
  Object.freeze({ stage: "CONSTRUCTION", component: "odg-transform-catalog (deterministic) + odg-native-engineering-loop (decide→drive) + ODG-CTC-001 provider mandate for novel code", status: "EXISTING_VALIDATED", evidence: "V250/V251 merged + gated; novel code is a bounded provider delegation" }),
  Object.freeze({ stage: "TEST", component: "package.json test:report gate (ODG_TEST_WORKERS) + per-module .test.ts", status: "EXISTING_VALIDATED", evidence: "692-suite gate green on every checkpoint" }),
  Object.freeze({ stage: "INSPECTION", component: "independent inspection in a DISTINCT context (Inspecteur 1 / validateur) + CI", status: "EXISTING_VALIDATED", evidence: "every merged checkpoint has an independent PASS reproduced from scratch" }),
  Object.freeze({ stage: "PREUVE", component: "evidence-provenance (sourceCommit/sha256) + gates-ledger + closure-register", status: "EXISTING_VALIDATED", evidence: "registers intact @V123; evidence is provenance-tagged" }),
]);

// map the REAL pathMap steps onto the canonical chain stage names (research→mission→mandat→decision half).
const RESEARCH_STAGE_OF: Record<string, string> = Object.freeze({
  "A detect": "RECHERCHE", "B provenance+freshness": "SOURCE", "C reliability": "SOURCE",
  "D qualification": "QUALIFICATION", "E dedup": "COMPARAISON", "G capability/gap": "LACUNE",
  "F métier attachment": "PRIORITE", "H mission proposal": "MISSION", "I/J governance gate": "MANDAT",
  "K canonical mission creation": "DECISION",
}) as any;
const CANONICAL_CHAIN = Object.freeze(["RECHERCHE", "SOURCE", "QUALIFICATION", "COMPARAISON", "LACUNE", "PRIORITE", "MISSION", "MANDAT", "CONSTRUCTION", "TEST", "INSPECTION", "PREUVE", "DECISION"]);

function deriveStatus(state: any): string {
  const s = String(state);
  if (s === "EXISTING_VALIDATED") return "EXISTING_VALIDATED";
  if (/OWNER_GATED/.test(s)) return "OWNER_GATED";
  if (/NOT_MEASURED/.test(s)) return "NOT_MEASURED";
  if (/PARTIAL/.test(s)) return "EXISTING_PARTIAL";
  return "EXISTING_PARTIAL";                               // unknown ⇒ PARTIAL, never silently "VALIDATED" (fail-closed)
}

/** verifyChain() -> per-stage coverage over the FULL canonical chain, composing the real pathMap + execution components. */
function verifyChain(): any {
  const path = Array.isArray(RTM.pathMap ? RTM.pathMap() : null) ? RTM.pathMap() : [];
  const researchStages: Record<string, any> = {};
  for (const p of path) {
    const stage = RESEARCH_STAGE_OF[p.step];
    if (!stage) continue;
    if (!researchStages[stage]) researchStages[stage] = Object.freeze({ stage, component: p.module, status: deriveStatus(p.state), evidence: p.proof });
  }
  const execByStage: Record<string, any> = {}; for (const e of EXECUTION_STAGES) execByStage[e.stage] = e;

  const stages = CANONICAL_CHAIN.map((name) => researchStages[name] || execByStage[name] || Object.freeze({ stage: name, component: null, status: "MISSING", evidence: "no backing component found (fail-closed)" }));
  const count = (s: string) => stages.filter((x: any) => x.status === s).length;
  const missing = stages.filter((x: any) => x.status === "MISSING").map((x: any) => x.stage);
  return Object.freeze({
    stages: Object.freeze(stages), total: stages.length,
    covered: count("EXISTING_VALIDATED"), partial: count("EXISTING_PARTIAL"), ownerGated: count("OWNER_GATED"), notMeasured: count("NOT_MEASURED"), missing: Object.freeze(missing),
    chainWired: missing.length === 0,                     // every stage has a REAL backing component
    endToEndAutonomous: "NOT_MEASURED",                   // wired ≠ autonomously executing (honest)
    terminalDecision: "OWNER_GATED",                      // real mission creation / real-world action is owner-gated (V184)
    note: "the full RECHERCHE→…→DÉCISION chain is COMPOSED from REAL existing components (odg-radar-to-mission-loop pathMap + the merged execution/test/inspection/evidence stack) — no second radar/engine. chainWired means every stage has a backing component; it does NOT mean the chain runs autonomously end-to-end (NOT_MEASURED) nor that the terminal real-world DÉCISION is self-authorized (it is OWNER_GATED).",
  });
}

const RADAR_GATE_CHAIN_CONTRACT = Object.freeze({
  id: "V254-CM-RADAR-GATE-CHAIN",
  source: "V12.4 CM-RADAR-GATE-CHAIN — read-only end-to-end chain-coverage verifier (composes odg-radar-to-mission-loop; no second radar)",
  chain: CANONICAL_CHAIN, statuses: STATUS,
  notAuthority: "a READ-ONLY coverage projection; it creates no mission, authorizes nothing, and claims no autonomous execution",
  invariants: Object.freeze([
    "COMPOSES the REAL odg-radar-to-mission-loop.pathMap + the merged execution/test/inspection/evidence components — builds NO second radar/engine",
    "FAIL-CLOSED: a stage with no backing component is MISSING and chainWired is false (coverage is never inflated)",
    "HONESTY: chainWired (every stage has a component) ≠ end-to-end AUTONOMOUS execution (NOT_MEASURED); the terminal DÉCISION (real mission creation / real-world action) is OWNER_GATED (V184)",
    "pure/deterministic; read-only; no new primitive",
  ]),
});

/* ───────────────── V372 step 1 — EXECUTED chain on REAL recorded Radar data (offline) ─────────────────
 * verifyChain() proves every stage HAS a component; runChain() makes real data FLOW through them:
 *   RETRIEVE (memory-trust-gate on prior admitted knowledge) → ACQUIRE (knowledge-acquisition on a REAL recorded cycle)
 *   → ADMIT (memory-trust-gate, deny-by-default) → PROPOSE (experiment linked to V12.4 §I) → DECIDE (improvement-chain
 *   consuming sandbox-integration-gate). Every stage is sha256-traced. Pure + deterministic given the injected clock.
 * HONESTY: without PROVEN downstream experiment evidence the gate RETURNS (never a fabricated pass); the default cycle is
 * KA.REAL_CYCLE (4 sources consulted 2026-11-16 under the then-valid V141 grant) — live-world quality stays NOT_MEASURED. */
const DAY_MS = 86400000;
const KNOWLEDGE_TTL_DAYS = 90;          // admitted knowledge validity window; past it ⇒ STALE ⇒ re-acquire
const MIN_CONFIDENCE = 0.5;
const V124_LINK = "V12.4 §I CM-RADAR-GATE-CHAIN";

function sha(v: any): string { return crypto.createHash("sha256").update(JSON.stringify(v === undefined ? null : v)).digest("hex"); }
function traced(name: string, input: any, output: any, note: string): any {
  return Object.freeze({ stage: name, inputSha256: sha(input), outputSha256: sha(output), note });
}

/* toMemoryRecord(knowledgeItem, query, asOf) -> canonical memory record (memory-taxonomy family "semantic"). A record
 * whose sources are not ALL dated gets NO provenance ⇒ memory-taxonomy quality NO_PROVENANCE ⇒ never admitted. */
/* validSourceDate(date, asOf): a REAL calendar date (YYYY-MM-DD, round-trips through Date.UTC) that is NOT in the future
 * relative to the injected clock and not before 1990 (implausible for web evidence). Regex alone is not enough (inspection). */
const MIN_SOURCE_EPOCH = Date.UTC(1990, 0, 1);
function validSourceDate(date: any, asOf: number): boolean {
  if (typeof date !== "string") return false;
  // anchored: a bare date, or a full ISO-8601 timestamp that Date.parse accepts (no trailing garbage).
  const m = /^(\d{4})-(\d{2})-(\d{2})(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2}))?$/.exec(date); if (!m) return false;
  if (m[4]) { const tp = Date.parse(date); if (!Number.isFinite(tp) || tp > asOf) return false; }   // timestamp: exact instant must not be after asOf
  const y = +m[1], mo = +m[2], d = +m[3]; const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return false;   // e.g. 2026-99-99
  return t >= MIN_SOURCE_EPOCH && t <= asOf;
}
function knowledgeId(query: string, claim: any): string { return "kn:" + sha({ q: query, c: claim }).slice(0, 16); }
/* registrableDomains(urls): approximate eTLD+1 (last two host labels) — so x.a.com and y.a.com are ONE domain. A stricter
 * independence check than host-distinctness alone (an approximation: multi-label public suffixes like co.uk collapse). */
function registrableDomains(urls: string[]): Set<string> {
  const out = new Set<string>();
  for (const u of urls) { try { const h = new URL(u).hostname.toLowerCase().replace(/\.$/, ""); if (/^\[.*\]$/.test(h) || /^\d{1,3}(\.\d{1,3}){3}$/.test(h)) continue; const p = h.split("."); out.add(p.length >= 2 ? p.slice(-2).join(".") : h); } catch { /* invalid ⇒ not counted */ } }
  return out;
}
const PROVENANCE_PREFIX = "RADAR_RECORDED_REAL:";

function toMemoryRecord(k: any, query: string, asOf: number): any {
  const srcs = Array.isArray(k && k.sources) ? k.sources : [];
  const urls = srcs.map((s: any) => s.url).filter(Boolean).sort();
  const dated = srcs.length > 0 && srcs.every((s: any) => validSourceDate(s.date, asOf) && typeof s.url === "string" && /^https:\/\//.test(s.url));
  return Object.freeze({
    id: knowledgeId(query, k.claim),
    claimType: k.type, corroborationLevel: k.corroborationLevel, independentSupportCount: k.independentSupportCount,
    family: "semantic", query, claim: k.claim, classification: k.classification,
    provenance: urls.length && dated ? PROVENANCE_PREFIX + urls.join("|") : undefined,
    sources: Object.freeze(srcs.slice()),
    status: k.verifiedKnowledge ? "VERIFIED" : "UNVERIFIED",
    confidence: k.verifiedKnowledge ? 0.9 : 0.3,
    learnedAt: asOf, validUntil: asOf + KNOWLEDGE_TTL_DAYS * DAY_MS,
    authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR",
    dataNature: "REAL_RECORDED (not live; see consulted dates)",
  });
}
function trustOf(rec: any, asOf: number): any {
  return MTG.assessMemoryTrust(rec, { asOf, trustedAuthors: [ACTOR.EXECUTOR.ODG], minConfidence: MIN_CONFIDENCE });
}

/* reusable(rec, query, asOf) -> {ok, reasons}. RETRIEVE-time integrity (fix for inspection HIGH: a caller-supplied record
 * carrying ODG labels must NOT be reused on labels alone). ALL must hold, else the record is ignored and ACQUIRE runs:
 * content-bound id (recomputed from query+claim), canonical provenance prefix with https urls matching the sources, every
 * source dated (real date, not future), FACT_CORROBORATED with ≥2 independent supports, numeric confidence ≥ min,
 * numeric validUntil (no immortal records), and memory-trust-gate TRUSTED. */
function reusable(rec: any, query: string, asOf: number): any {
  const reasons: string[] = [];
  if (!isObj(rec)) return { ok: false, reasons: ["not a record"] };
  if (rec.query !== query) reasons.push("different query");
  if (rec.id !== knowledgeId(query, rec.claim)) reasons.push("id not bound to (query, claim) — possible forgery");
  const srcs = Array.isArray(rec.sources) ? rec.sources : [];
  const urls = srcs.map((s: any) => s && s.url).filter((u: any) => typeof u === "string").sort();
  if (typeof rec.provenance !== "string" || rec.provenance !== PROVENANCE_PREFIX + urls.join("|")) reasons.push("provenance not canonical / not matching sources");
  if (srcs.length < 2 || !srcs.every((s: any) => s && typeof s.url === "string" && /^https:\/\//.test(s.url) && validSourceDate(s.date, asOf))) reasons.push("sources missing, non-https or not validly dated");
  if (rec.classification !== "FACT_CORROBORATED") reasons.push("not classified FACT_CORROBORATED");
  // RE-DERIVE corroboration from the record's OWN sources (never trust its declared counts — inspection HIGH #2).
  if (new Set(urls).size !== urls.length) reasons.push("duplicate source urls");
  if (!srcs.every((s: any) => s && s.stance === "SUPPORTS")) reasons.push("a source does not SUPPORT the claim");
  const cor = COR.corroborate({ claim: rec.claim, evidence: srcs, asOfEpochMs: asOf });
  if (!(cor && cor.level === "CORROBORATED" && cor.independentSupportCount >= 2)) reasons.push("re-derived corroboration is " + (cor ? cor.level : "NONE") + " (needs CORROBORATED, ≥2 independent hosts)");
  if (registrableDomains(urls).size < 2) reasons.push("supports come from fewer than 2 distinct registrable domains");
  if (!Number.isFinite(rec.confidence) || rec.confidence < MIN_CONFIDENCE) reasons.push("confidence missing or below minimum");
  if (!Number.isFinite(rec.validUntil)) reasons.push("no numeric validUntil (immortal record refused)");
  if (!Number.isFinite(rec.learnedAt) || rec.learnedAt > asOf) reasons.push("learnedAt missing or in the future");
  else if (Number.isFinite(rec.validUntil) && rec.validUntil > rec.learnedAt + KNOWLEDGE_TTL_DAYS * DAY_MS) reasons.push("validUntil exceeds learnedAt + TTL");
  const srcDays = srcs.map((x: any) => (x && typeof x.date === "string" ? Date.UTC(+x.date.slice(0, 4), +x.date.slice(5, 7) - 1, +x.date.slice(8, 10)) : NaN));
  if (srcDays.length && (srcDays.some((t: number) => !Number.isFinite(t)) || Math.min(...srcDays) + KNOWLEDGE_TTL_DAYS * DAY_MS < asOf)) reasons.push("sources older than TTL (freshness tied to source dates, not to relabelled learnedAt)");
  if (rec.status !== "VERIFIED") reasons.push("status not VERIFIED");
  if (!reasons.length) { const t = trustOf(rec, asOf); if (!t.trusted) reasons.push("memory-trust-gate: " + t.verdict); }
  return { ok: reasons.length === 0, reasons };
}

/* runChain(opts) -> { trace, acquisition, admitted, rejected, reuse, proposal, decision, memoryOut, honesty }.
 * opts.asOfEpochMs (REQUIRED, injected clock) · opts.cycle (default KA.REAL_CYCLE) · opts.memory (prior admitted records)
 * opts.experimentEvidence: gate conditions PROVEN for the downstream experiment (default: only what this chain itself
 * demonstrates ⇒ an honest RETURN_TO_EXPERIMENT). */
function runChain(opts?: any): any {
  const o = isObj(opts) ? opts : {};
  if (!Number.isFinite(o.asOfEpochMs)) throw new Error("runChain: asOfEpochMs is required (deterministic, no hidden clock)");
  const asOf: number = o.asOfEpochMs;
  const cycle = isObj(o.cycle) ? o.cycle : KA.REAL_CYCLE;
  if (typeof cycle.query !== "string" || !cycle.query.trim()) throw new Error("runChain: cycle.query must be a non-empty string");
  const memory = Array.isArray(o.memory) ? o.memory : [];
  const trace: any[] = [];

  const ignoredMemory: any[] = [];
  const retrieved = memory.filter((m: any) => {
    if (!isObj(m) || m.query !== cycle.query) return false;
    const r = reusable(m, cycle.query, asOf);
    if (!r.ok) ignoredMemory.push(Object.freeze({ id: m.id == null ? null : m.id, reasons: Object.freeze(r.reasons) }));
    return r.ok;
  });
  trace.push(traced("RETRIEVE", { query: cycle.query, memorySize: memory.length }, { reused: retrieved.map((m: any) => m.id), ignored: ignoredMemory },
    retrieved.length ? "reused " + retrieved.length + " integrity-checked, trusted item(s); acquisition skipped" : "no reusable prior knowledge (" + ignoredMemory.length + " ignored); acquire"));

  let acquisition: any = null; const admitted: any[] = []; const rejected: any[] = [];
  if (retrieved.length) { for (const m of retrieved) admitted.push(m); }
  else {
    acquisition = KA.acquire({ query: cycle.query, capability: cycle.capability, sources: cycle.sources, asOfEpochMs: asOf });
    trace.push(traced("ACQUIRE", cycle, acquisition, `accessible=${acquisition.accessibleCount} inaccessible=${acquisition.inaccessibleCount} verified=${acquisition.verifiedCount}`));
    for (const k of acquisition.knowledge) {
      const rec = toMemoryRecord(k, cycle.query, asOf);
      const t = trustOf(rec, asOf);
      const domains = registrableDomains((rec.sources || []).map((x: any) => x && x.url).filter((u: any) => typeof u === "string"));
      if (t.trusted && rec.status === "VERIFIED" && domains.size >= 2) admitted.push(rec);
      else rejected.push(Object.freeze({ id: rec.id, claim: rec.claim, classification: rec.classification,
        verdict: !t.trusted ? t.verdict : rec.status !== "VERIFIED" ? "NOT_VERIFIED_KNOWLEDGE" : "SINGLE_REGISTRABLE_DOMAIN",
        reasons: !t.trusted || rec.status !== "VERIFIED" ? t.reasons : Object.freeze(["supports come from fewer than 2 distinct registrable domains (subdomains are not independent)"]) }));
    }
    trace.push(traced("ADMIT", acquisition.knowledge.map((k: any) => k.claim), { admitted: admitted.map((a: any) => a.id), rejected: rejected.map((r: any) => r.id) },
      "memory-trust-gate deny-by-default: only a FACT_CORROBORATED, dated, fresh, ODG-attributed item is admitted"));
  }

  const proposal = Object.freeze({
    id: "rgc:" + sha({ q: cycle.query, k: admitted.map((a: any) => a.id) }).slice(0, 16),
    v124Link: V124_LINK, discovery: cycle.query, capability: cycle.capability || null,
    knowledgeIds: Object.freeze(admitted.map((a: any) => a.id)),
  });
  trace.push(traced("PROPOSE", admitted.map((a: any) => a.id), proposal, "experiment linked to " + V124_LINK));

  // Gate evidence. Only linkedToV124 + needDemonstrated are MEASURED by this chain. The two hard conditions are asserted
  // about THE CHAIN ITSELF (pure/offline composition) — labelled CHAIN_SELF_ONLY in evidenceBasis, NOT a claim about any
  // downstream experiment; a caller with real experiment evidence must supply its own (experimentEvidence overrides).
  const evidence = Object.assign({
    linkedToV124: true,
    needDemonstrated: admitted.length > 0,
    noContractOrPermissionViolation: true,
    securityValidated: true,
  }, isObj(o.experimentEvidence) ? o.experimentEvidence : {});
  const evidenceBasis = Object.freeze({
    linkedToV124: "MEASURED (proposal carries " + V124_LINK + ")",
    needDemonstrated: "MEASURED (admitted corroborated facts = " + admitted.length + ")",
    noContractOrPermissionViolation: isObj(o.experimentEvidence) && "noContractOrPermissionViolation" in o.experimentEvidence ? "CALLER_SUPPLIED" : "CHAIN_SELF_ONLY (pure offline composition; says nothing about a downstream experiment)",
    securityValidated: isObj(o.experimentEvidence) && "securityValidated" in o.experimentEvidence ? "CALLER_SUPPLIED" : "CHAIN_SELF_ONLY (no network/fs/exec/secret in this chain; says nothing about a downstream experiment)",
    others: isObj(o.experimentEvidence) ? "CALLER_SUPPLIED where present, else unproven (false)" : "unproven (false) ⇒ gate RETURNs",
  });
  const decision = IC.run({ id: proposal.id, v124Link: proposal.v124Link, significant: true, evidence });
  trace.push(traced("DECIDE", evidence, { verdict: decision.verdict, action: decision.action }, "odg-improvement-chain → odg-sandbox-integration-gate.decide (" + decision.satisfied + ")"));

  return Object.freeze({
    v124Mission: "CM-RADAR-GATE-CHAIN", asOfEpochMs: asOf,
    trace: Object.freeze(trace), acquisition,
    admitted: Object.freeze(admitted), rejected: Object.freeze(rejected),
    reuse: Object.freeze({ retrieved: retrieved.length, reacquired: retrieved.length ? 0 : 1, ignored: Object.freeze(ignoredMemory) }),
    proposal, decision, evidenceBasis,
    memoryOut: Object.freeze(retrieved.length ? memory.slice() : memory.concat(admitted)),
    integrityLimit: "reuse proves a record is SELF-CONSISTENT (content-bound id, canonical provenance, re-derived corroboration over ≥2 registrable domains, valid dates, bounded TTL) — NOT who wrote it: without a keyed provenance stamp (memory-trust-gate stamp/key; key strategy is owner-gated, register item p0e-audit-log-keyed-integrity) a forger who fabricates sources on 2 distinct domains can still pass. Memory must come from ODG's own store, not untrusted callers.",
    honesty: "REAL_RECORDED sample (" + (Array.isArray(cycle.sources) ? cycle.sources.length : 0) + " sources); live-world knowledge quality NOT_MEASURED; RETURN means the downstream experiment is not yet proven, never a fabricated pass",
  });
}

/* summarize(result) -> compact consumer indicator (consumed by odg-cto-dashboard). */
function summarize(r: any): any {
  if (!isObj(r) || !Array.isArray(r.trace)) return Object.freeze({ ok: false, reason: "no chain result" });
  return Object.freeze({
    ok: true, mission: r.v124Mission, stages: Object.freeze(r.trace.map((t: any) => t.stage)),
    admitted: r.admitted.length, rejected: r.rejected.length, retrieved: r.reuse.retrieved,
    verdict: r.decision.verdict, action: r.decision.action, deployed: r.decision.deployed,
  });
}

const EXECUTED_CHAIN_CONTRACT = Object.freeze({
  id: "WIC-CM-RADAR-GATE-CHAIN-STEP1",
  authorizedBy: "owner V372 (2026-11-22)",
  composes: Object.freeze(["odg-knowledge-acquisition", "memory-trust-gate", "odg-improvement-chain", "odg-sandbox-integration-gate", "actor-provenance"]),
  invariants: Object.freeze([
    "composition only — no second radar/memory/gate/orchestrator",
    "fail-closed admission: undated/unprovenanced/single-source/contested knowledge is NOT admitted",
    "INACCESSIBLE sources stay recorded, never circumvented",
    "reuse before re-acquisition: trusted, fresh admitted memory short-circuits ACQUIRE; stale/untrusted memory does not",
    "the canonical gate decides; INTEGRATE = MERGE_ELIGIBLE only, never deployed",
    "offline + deterministic: injected clock, no network/fs/exec",
  ]),
});

module.exports = { CANONICAL_CHAIN, STATUS, verifyChain, RADAR_GATE_CHAIN_CONTRACT, runChain, summarize, toMemoryRecord, EXECUTED_CHAIN_CONTRACT, KNOWLEDGE_TTL_DAYS };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...RADAR_GATE_CHAIN_CONTRACT, verified: verifyChain() }, null, 2) + "\n"); }

export {};
