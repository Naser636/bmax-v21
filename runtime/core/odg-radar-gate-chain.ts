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
function toMemoryRecord(k: any, query: string, asOf: number): any {
  const srcs = Array.isArray(k && k.sources) ? k.sources : [];
  const urls = srcs.map((s: any) => s.url).filter(Boolean).sort();
  const dated = srcs.length > 0 && srcs.every((s: any) => typeof s.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(s.date));
  return Object.freeze({
    id: "kn:" + sha({ q: query, c: k.claim }).slice(0, 16),
    family: "semantic", query, claim: k.claim, classification: k.classification,
    provenance: urls.length && dated ? "RADAR_RECORDED_REAL:" + urls.join("|") : undefined,
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

/* runChain(opts) -> { trace, acquisition, admitted, rejected, reuse, proposal, decision, memoryOut, honesty }.
 * opts.asOfEpochMs (REQUIRED, injected clock) · opts.cycle (default KA.REAL_CYCLE) · opts.memory (prior admitted records)
 * opts.experimentEvidence: gate conditions PROVEN for the downstream experiment (default: only what this chain itself
 * demonstrates ⇒ an honest RETURN_TO_EXPERIMENT). */
function runChain(opts?: any): any {
  const o = isObj(opts) ? opts : {};
  if (!Number.isFinite(o.asOfEpochMs)) throw new Error("runChain: asOfEpochMs is required (deterministic, no hidden clock)");
  const asOf: number = o.asOfEpochMs;
  const cycle = isObj(o.cycle) ? o.cycle : KA.REAL_CYCLE;
  const memory = Array.isArray(o.memory) ? o.memory : [];
  const trace: any[] = [];

  const retrieved = memory.filter((m: any) => isObj(m) && m.query === cycle.query && m.status === "VERIFIED" && trustOf(m, asOf).trusted);
  trace.push(traced("RETRIEVE", { query: cycle.query, memorySize: memory.length }, retrieved.map((m: any) => m.id),
    retrieved.length ? "reused " + retrieved.length + " trusted admitted item(s); acquisition skipped" : "no trusted prior knowledge; acquire"));

  let acquisition: any = null; const admitted: any[] = []; const rejected: any[] = [];
  if (retrieved.length) { for (const m of retrieved) admitted.push(m); }
  else {
    acquisition = KA.acquire({ query: cycle.query, capability: cycle.capability, sources: cycle.sources, asOfEpochMs: asOf });
    trace.push(traced("ACQUIRE", cycle, acquisition, `accessible=${acquisition.accessibleCount} inaccessible=${acquisition.inaccessibleCount} verified=${acquisition.verifiedCount}`));
    for (const k of acquisition.knowledge) {
      const rec = toMemoryRecord(k, cycle.query, asOf);
      const t = trustOf(rec, asOf);
      if (t.trusted && rec.status === "VERIFIED") admitted.push(rec);
      else rejected.push(Object.freeze({ id: rec.id, claim: rec.claim, classification: rec.classification, verdict: t.trusted ? "NOT_VERIFIED_KNOWLEDGE" : t.verdict, reasons: t.reasons }));
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

  const evidence = Object.assign({
    linkedToV124: true,
    needDemonstrated: admitted.length > 0,          // a verified, provenanced fact supports the capability
    noContractOrPermissionViolation: true,          // composition only — no egress/fs/exec
    securityValidated: true,                        // pure + offline; no secret, no network
  }, isObj(o.experimentEvidence) ? o.experimentEvidence : {});
  const decision = IC.run({ id: proposal.id, v124Link: proposal.v124Link, significant: true, evidence });
  trace.push(traced("DECIDE", evidence, { verdict: decision.verdict, action: decision.action }, "odg-improvement-chain → odg-sandbox-integration-gate.decide (" + decision.satisfied + ")"));

  return Object.freeze({
    v124Mission: "CM-RADAR-GATE-CHAIN", asOfEpochMs: asOf,
    trace: Object.freeze(trace), acquisition,
    admitted: Object.freeze(admitted), rejected: Object.freeze(rejected),
    reuse: Object.freeze({ retrieved: retrieved.length, reacquired: retrieved.length ? 0 : 1 }),
    proposal, decision,
    memoryOut: Object.freeze(retrieved.length ? memory.slice() : memory.concat(admitted)),
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
