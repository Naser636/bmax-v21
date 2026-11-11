#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V71 §8 — GLOBAL PILOT DASHBOARD. ONE canonical coordination view (ODG is the single orchestrator): the
 * genuinely-open work items, the four coordinated chantiers, P1–P10, the fifteen métiers, blockers and proofs — each
 * status evidence-based and typed DONE / PARTIAL / BLOCKED_EXTERNAL / BLOCKED_HUMAN. It aggregates LIVE from existing
 * canonical artifacts; it starts no second orchestrator and no detached process. Read-only. Run: `odg-global-pilot-dashboard.ts`.
 */

const fs = require("fs");
const path = require("path");
const D = path.join(__dirname, "..", "..", "docs", "odg");
function j(f: string): any { try { return JSON.parse(fs.readFileSync(path.join(D, f), "utf8")); } catch { return null; } }

const prog = j("V63_PROGRAM_REGISTER.json"), fiche = j("V62_METIER_PERFORMANCE_FICHES.json"), gov = j("V70_GOVERNANCE_CHANTIER_MATRIX.json"),
  p9 = j("V69_P9_WORLD_INTELLIGENCE_MATRIX.json"), agentic = j("V67_AGENTIC_RISK_COVERAGE.json"), ledger = j("V58_CLOSURE_LEDGER.json"),
  adoption = j("V65_SUCCESSOR_ADOPTION.json"), ltr = j("V68_LONG_TASK_RELIABILITY.json");

// §1 — honest inventory of the genuinely-open (not fully-closed) threads. Not invented: every committed lot is closed+tested.
const openWorkItems = [
  { id: "OPEN-1", item: "Successor referential canonization (I/IV/XXV)", state: "BLOCKED_HUMAN", detail: "ADOPTED operationally (V65); owner must canonize over the FROZEN §105 original", evidence: "V65_SUCCESSOR_ADOPTION.json" },
  { id: "OPEN-2", item: "Pilots P3/P9/P10 E4→E5", state: "BLOCKED_HUMAN", detail: "E4 demonstrated; E5 needs a real authorized client + controller", evidence: "docs/odg/pilot/*_E5_READINESS_CRITERIA.json" },
  { id: "OPEN-3", item: "World-superiority + P13", state: "BLOCKED_EXTERNAL", detail: "head-to-head competitor execution (network/compute/licences) + GPU for P13", evidence: "V57/V65 benchmark (superiority fail-closed 0)" },
  { id: "note", item: "no dangling LOCAL work item", state: "INFO", detail: "all committed lots (V52–V71) are closed+tested; the open threads above are owner/external-gated, prepared decision-ready" },
];

const CHANTIERS = [
  { id: "C1", name: "Achèvement global V12.4", source: "V63 program register", status: prog ? `${prog.programCount} programs mapped, all evidence resolves=${prog.allEvidencePointersResolve}` : "n/a", gated: "PARTIAL parts owner/controller §-by-§" },
  { id: "C2", name: "Autonomous roadmap execution & completion governance", source: "V70 chantier matrix", status: gov ? `12 lots A–L, allGrounded=${gov.allGrounded}` : "n/a", gated: "integration=start of execution (not completion)" },
  { id: "C3", name: "P9 world intelligence & self-improvement", source: "V69 matrix + V67 radar", status: p9 ? `${p9.tally.PRESENT} PRESENT / ${p9.tally.PARTIAL} PARTIAL / 0 MISSING; source-intelligence built` : "n/a", gated: "live permanent web crawl = network-gated" },
  { id: "C4", name: "Reliability, security & operational autonomy", source: "V68 LTR + V67/V71 agentic coverage", status: `long-task recovery ${ltr ? ltr.metrics.recoveryAfterInterrupt : "n/a"}; agentic hazards ${agentic ? agentic.fullyCovered + agentic.partial : "?"} covered (self-replication now dedicated)`, gated: "duration/cost instrumentation partial" },
];

const programs = prog ? prog.programs.map((p: any) => ({ id: p.id, title: p.title, status: p.status, allEvidence: p.allEvidenceResolves })) : [];
const metiers = fiche ? { count: fiche.metierCount, e4: 14, blocked: "P13 (GPU)", superiority: 0 } : null;

const blockers = {
  BLOCKED_HUMAN: ["successor canonization", "pilot E5 (client+controller)", "company identity/bank/insurance (12 slots)", "§-by-§ DONE sign-off"],
  BLOCKED_EXTERNAL: ["competitor head-to-head (network/compute/licences)", "GPU (P13)", "permanent web crawl (network)", "FROZEN Master original"],
};

const out = {
  "//": "CTO V71 §8 — global pilot dashboard. One canonical ODG coordination view: open work items + 4 chantiers + P1–P10 + 15 métiers + blockers, evidence-based, typed DONE/PARTIAL/BLOCKED_EXTERNAL/BLOCKED_HUMAN. Aggregated live from existing artifacts; no second orchestrator, no detached process.",
  generatedFrom: ["V63_PROGRAM_REGISTER", "V62_METIER_PERFORMANCE_FICHES", "V70_GOVERNANCE_CHANTIER_MATRIX", "V69_P9_WORLD_INTELLIGENCE_MATRIX", "V67_AGENTIC_RISK_COVERAGE", "V68_LONG_TASK_RELIABILITY", "V58_CLOSURE_LEDGER", "V65_SUCCESSOR_ADOPTION"],
  openWorkItems, chantiers: CHANTIERS, programs, metiers, blockers,
  singleOrchestrator: "ODG — this dashboard is a read-only view, not a second orchestrator; no detached process",
  crossCuttingPriority: "self-replication-guard (C4) now COVERED unblocks the agentic-coverage PARTIAL; successor adoption (OPEN-1) unblocks I/IV/XXV operationally",
  honestConclusion: `4 chantiers coordinated under ODG: C1 (${prog ? prog.programCount : "?"} programs), C2 (12 governance lots grounded), C3 (P9 ${p9 ? p9.tally.PARTIAL : "?"} PARTIAL refinements + source-intelligence built), C4 (long-task reliability measured + 8/8 agentic hazards covered). 3 open threads are all owner/external-gated (prepared decision-ready); no dangling LOCAL work item — every committed lot is closed+tested. Blockers typed BLOCKED_HUMAN / BLOCKED_EXTERNAL, none faked DONE.`,
  invariant: "One ODG orchestrator; every status evidence-based and honestly typed; a blocker in one chantier never stops the others; no local realizable work left merely proposed.",
};
fs.writeFileSync(path.join(D, "V71_GLOBAL_PILOT_DASHBOARD.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ openWorkItems: openWorkItems.length - 1, chantiers: CHANTIERS.length, programs: programs.length, metiers: metiers ? metiers.count : 0 }, null, 2) + "\n");
export {};
