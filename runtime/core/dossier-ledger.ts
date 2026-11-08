#!/usr/bin/env node
"use strict";

/*
 * V12.4 §71–§76 (Partie XVI) — SIX CTO DOSSIERS A–F LEDGER. PURE, verifiable. Enumerates the six study dossiers, each
 * with its KNOWN purpose (honestly marked NOT_RECOVERABLE where the preserved V12.4 is an index only — the verbatim
 * dossier content is NOT fabricated), the REAL artifact that seeds it (where one exists), an independent verifier, and
 * an honest status. It creates NO dossier content; it is the traceable ledger. `verifyLedger` checks completeness + that
 * a dossier is only marked PRESENT when it cites a real seeding artifact (never asserted from an index). Dual export.
 */

const STATUS = Object.freeze(["PRESENT", "PARTIAL", "TO_AUDIT", "BLOCKED"]);

const DOSSIERS = Object.freeze([
  { id: "A", section: "§71", purpose: "Research dossier (knowledge base: sources, coverage, uncertainties)", seededBy: ["ODG_GLOBAL_RESEARCH_AND_EXECUTION_READINESS", "FRONTIER_V124_PREPARATION"], verifier: "independent research-coverage review", status: "PARTIAL" },
  { id: "B", section: "§72", purpose: "NOT_RECOVERABLE_VERBATIM — preserved V12.4 is an index; dossier B content is not reconstructed (capabilities/responsibilities framing per Gate B)", seededBy: [], verifier: "capability/coherence audit", status: "TO_AUDIT" },
  { id: "C", section: "§73", purpose: "NOT_RECOVERABLE_VERBATIM — architecture/Target-to-Reality framing (matrix references §73 in the confrontation); verbatim not reconstructed", seededBy: [], verifier: "architectural coherence audit", status: "TO_AUDIT" },
  { id: "D", section: "§74", purpose: "NOT_RECOVERABLE_VERBATIM — meta-improvement/decision framing per Gate D; verbatim not reconstructed", seededBy: [], verifier: "role-separated independent evaluation", status: "TO_AUDIT" },
  { id: "E", section: "§75", purpose: "Reality dossier (technical truth: repo, contracts, tests, real execution) — realized as the Target-to-Reality matrix", seededBy: ["V12.4_SECTION_TRACEABILITY_MATRIX"], verifier: "repo Truth Lock + odg-test-report", status: "PARTIAL" },
  { id: "F", section: "§76", purpose: "NOT_RECOVERABLE_VERBATIM — reconciliation framing (gaps/decisions/alternatives/risks) per Gate F; verbatim not reconstructed", seededBy: [], verifier: "target-vs-reality reconciliation + ODG-ADR", status: "TO_AUDIT" },
]);

function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

/** verifyLedger(loaded?) -> fail-closed completeness + presence-discipline. A dossier marked PRESENT MUST cite ≥1
 * real seeding artifact (and that artifact must be in a supplied present-set); TO_AUDIT must cite none (honest). */
function verifyLedger(loaded?: any): any {
  const present = loaded ? new Set((Array.isArray(loaded) ? loaded : Object.keys(loaded)).filter(isStr)) : null;
  const incomplete: string[] = [];
  const unsoundPresence: string[] = [];
  const unknownArtifacts: string[] = [];
  const byStatus: any = { PRESENT: 0, PARTIAL: 0, TO_AUDIT: 0, BLOCKED: 0 };
  const ids = new Set();
  for (const d of DOSSIERS) {
    ids.add(d.id);
    if (!isStr(d.id) || !isStr(d.purpose) || !Array.isArray(d.seededBy) || !isStr(d.verifier) || !STATUS.includes(d.status)) incomplete.push(d.id || "?");
    // fail-closed: PRESENT/PARTIAL must cite a seeding artifact; TO_AUDIT must NOT claim one (no fabricated seed).
    if ((d.status === "PRESENT" || d.status === "PARTIAL") && d.seededBy.length === 0) unsoundPresence.push(d.id);
    if (d.status === "TO_AUDIT" && d.seededBy.length > 0) unsoundPresence.push(d.id);
    byStatus[d.status] = (byStatus[d.status] || 0) + 1;
    if (present) for (const a of d.seededBy) if (!present.has(a)) unknownArtifacts.push(d.id + ":" + a);
  }
  return Object.freeze({
    ok: DOSSIERS.length === 6 && ids.size === 6 && incomplete.length === 0 && unsoundPresence.length === 0,
    count: DOSSIERS.length, distinct: ids.size,
    byStatus: Object.freeze(byStatus), incomplete: Object.freeze(incomplete), unsoundPresence: Object.freeze(unsoundPresence),
    unknownArtifacts: present ? Object.freeze(unknownArtifacts) : null,
  });
}

const DOSSIER_LEDGER_CONTRACT = Object.freeze({
  id: "V124-DOSSIERS-A-F-LEDGER",
  source: "V12.4 §71–§76 (Partie XVI) — six CTO dossiers A–F, honest status",
  statuses: STATUS, count: DOSSIERS.length,
  notAuthority: "a traceable ledger mapping each dossier to its real seeding artifact; it fabricates no dossier content",
  invariants: Object.freeze([
    "exactly six dossiers A–F; each has a purpose (verbatim marked NOT_RECOVERABLE where index-only, never fabricated), a seededBy list, an independent verifier, a valid status",
    "a dossier is PRESENT/PARTIAL only when it cites ≥1 real seeding artifact; TO_AUDIT cites none (no fabricated seed)",
    "A seeded by the research readiness doc, E realized as the Target-to-Reality matrix; B/C/D/F verbatim NOT_RECOVERABLE (index-only)",
    "pure/deterministic; verifyLedger fails closed on an incomplete dossier OR an unsound presence claim",
  ]),
});

module.exports = { STATUS, DOSSIERS, DOSSIER_LEDGER_CONTRACT, verifyLedger };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...DOSSIER_LEDGER_CONTRACT, verify: verifyLedger() }, null, 2) + "\n"); }

export {};
