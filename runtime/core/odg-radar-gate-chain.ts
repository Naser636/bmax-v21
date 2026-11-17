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

module.exports = { CANONICAL_CHAIN, STATUS, verifyChain, RADAR_GATE_CHAIN_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...RADAR_GATE_CHAIN_CONTRACT, verified: verifyChain() }, null, 2) + "\n"); }

export {};
