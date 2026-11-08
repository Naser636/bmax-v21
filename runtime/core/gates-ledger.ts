#!/usr/bin/env node
"use strict";

/*
 * V12.4 §97–§103 (Partie XXIII) — GATES A–G LEDGER. PURE, verifiable. Enumerates the seven validation gates, each with
 * its purpose, acceptance criteria, the REAL protection mechanism that realizes it, an independent verifier, and an
 * honest status. It creates NO new gate — it is the traceable ledger mapping the V12.4 gates onto the existing
 * mechanisms (action-gate, reality-gate, excellence-gate, root-of-trust, the traceability matrix, …). `verifyLedger`
 * checks completeness + that each gate cites a real mechanism; it never fabricates a PASS. A gate PASSES only when its
 * criteria are demonstrated (§103) — a complete document is not enough. Dual export.
 */

const STATUS = Object.freeze(["PASS", "PARTIAL", "TO_AUDIT", "BLOCKED"]);

const GATES = Object.freeze([
  { gate: "A", name: "Connaissance (knowledge)", criteria: "sources, coverage, uncertainties, contradictions surfaced", mechanism: ["ODG_GLOBAL_RESEARCH_AND_EXECUTION_READINESS", "V12.4_SECTION_TRACEABILITY_MATRIX"], verifier: "independent review of the research dossier", status: "PARTIAL" },
  { gate: "B", name: "Capacités (capabilities)", criteria: "responsibilities, overlaps, dependencies, gaps", mechanism: ["FRONTIER_V124_PREPARATION", "primitive-validation", "discovery-engine"], verifier: "capability/coherence audit", status: "PARTIAL" },
  { gate: "C", name: "Architecture", criteria: "central intelligence, 9 primitives, 15 métiers, G0", mechanism: ["primitive-validation", "root-of-trust", "V12.4_SECTION_TRACEABILITY_MATRIX"], verifier: "architectural coherence audit (1 authorizer/scheduler/store, no 10th primitive)", status: "PARTIAL" },
  { gate: "D", name: "Méta-amélioration (meta-improvement)", criteria: "independent verification, audited evaluators, proofs", mechanism: ["evolution-loop", "frontier-lab", "meta-intelligence", "compounding-loop"], verifier: "role-separated independent evaluation", status: "PARTIAL" },
  { gate: "E", name: "Vérité technique (technical truth)", criteria: "repo, contracts, tests, dependencies, real execution", mechanism: ["V12.4_SECTION_TRACEABILITY_MATRIX", "reality-gate", "mission-evidence"], verifier: "repo Truth Lock + odg-test-report", status: "PARTIAL" },
  { gate: "F", name: "Réconciliation (reconciliation)", criteria: "gaps, decisions, alternatives, risks (target vs reality)", mechanism: ["V12.4_SECTION_TRACEABILITY_MATRIX"], verifier: "target-vs-reality matrix + ODG-ADR", status: "PARTIAL" },
  { gate: "G", name: "Construction", criteria: "missions, criteria, proofs, verification, recovery", mechanism: ["campaign-controller", "action-gate", "mission-evidence", "root-of-trust"], verifier: "independent verification before acceptance (frontier-lab)", status: "PARTIAL" },
]);

function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

/** verifyLedger(loaded?) -> { ok, count, byStatus, incomplete, unknownMechanisms }. Fail-closed on an incomplete gate;
 * flags cited mechanisms absent from a supplied present-set (so a gate status is checkable, not merely asserted). */
function verifyLedger(loaded?: any): any {
  const present = loaded ? new Set((Array.isArray(loaded) ? loaded : Object.keys(loaded)).filter(isStr)) : null;
  const incomplete: string[] = [];
  const unknownMechanisms: string[] = [];
  const byStatus: any = { PASS: 0, PARTIAL: 0, TO_AUDIT: 0, BLOCKED: 0 };
  const ids = new Set();
  for (const g of GATES) {
    ids.add(g.gate);
    if (!isStr(g.gate) || !isStr(g.criteria) || !Array.isArray(g.mechanism) || g.mechanism.length === 0 || !isStr(g.verifier) || !STATUS.includes(g.status)) incomplete.push(g.gate || "?");
    byStatus[g.status] = (byStatus[g.status] || 0) + 1;
    if (present) for (const m of g.mechanism) if (!present.has(m)) unknownMechanisms.push(g.gate + ":" + m);
  }
  return Object.freeze({
    ok: GATES.length === 7 && ids.size === 7 && incomplete.length === 0,
    count: GATES.length, distinct: ids.size, byStatus: Object.freeze(byStatus),
    incomplete: Object.freeze(incomplete), unknownMechanisms: present ? Object.freeze(unknownMechanisms) : null,
  });
}

const GATES_LEDGER_CONTRACT = Object.freeze({
  id: "V124-GATES-A-G-LEDGER",
  source: "V12.4 §97–§103 (Partie XXIII) — validation gates A–G mapped to existing mechanisms",
  statuses: STATUS, count: GATES.length,
  notAuthority: "a traceable ledger mapping each gate to its REAL mechanism + independent verifier; it creates no gate and fabricates no PASS",
  invariants: Object.freeze([
    "exactly seven gates A–G; each has criteria + ≥1 real mechanism + an independent verifier + a valid status",
    "a gate is PASS only when its criteria are DEMONSTRATED (§103) — a complete document is not enough",
    "maps existing gates (action-gate/reality-gate/excellence-gate/root-of-trust/traceability matrix); duplicates none",
    "pure/deterministic; verifyLedger is checkable against the set of present mechanisms",
  ]),
});

module.exports = { STATUS, GATES, GATES_LEDGER_CONTRACT, verifyLedger };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...GATES_LEDGER_CONTRACT, verify: verifyLedger() }, null, 2) + "\n"); }

export {};
