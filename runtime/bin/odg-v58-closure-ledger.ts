#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V58 — REMAINING-WORK CLOSURE LEDGER. For every OPEN part of the coverage matrix (PARTIAL / NOT_VALIDATED)
 * it records an explicit closure criterion, the current evidence state (from the SSOT), and a gating classification:
 *   LOCALLY_CLOSEABLE   — could be closed now with local evidence already present;
 *   NEEDS_LOCAL_BUILD   — more local, reversible work would advance it;
 *   INHERENTLY_REFERENTIAL — a doctrine/decision part whose "validation" is owner acknowledgement, not code;
 *   OWNER_GATED         — needs an owner decision (E5, authorizations, commercial commitment);
 *   EXTERNAL_DEPENDENCY — needs an external resource unavailable locally (GPU, real clients, competitor products).
 * It does NOT flip any bucket to DONE (that stays the SSOT's job with real proof); it tells the truth about WHY each
 * remaining item is open and what the next action is. Read-only aggregation; no new engine. Run: `odg-v58-closure-ledger.ts`.
 */

const fs = require("fs");
const path = require("path");
const D = path.join(__dirname, "..", "..", "docs", "odg");
function readJson(f: string): any { try { return JSON.parse(fs.readFileSync(path.join(D, f), "utf8")); } catch { return null; } }
const cov = readJson("V56_V124_COVERAGE_MATRIX.json");

// per-part closure criterion + gating (keyed by the roman-numeral/Préambule prefix of the matrix row).
const LEDGER: any = {
  "Préambule": { criterion: "truth-level discipline + version preservation acknowledged by owner", gating: "INHERENTLY_REFERENTIAL", next: "owner acknowledgement; already practiced (compass + closure-register); no code to build" },
  "I": { criterion: "the 26 fundamental capabilities each E1+ with evidence", gating: "NEEDS_LOCAL_BUILD", next: "most are E1–E2 via Frontier lots; enumerate the remaining capabilities as individual tested missions" },
  "III": { criterion: "G0/Root-of-Trust + G1/G2/G3 + R0–R3 all proven", gating: "LOCALLY_CLOSEABLE", next: "G0 §11 already PRESENT_AND_PROVEN (root-of-trust + 24-assertion suite); remaining G1/G2/G3 edges have modules — assert each with a focused test" },
  "IV": { criterion: "12 dimensions + 10 cognitive responsibilities each enumerated + tested", gating: "NEEDS_LOCAL_BUILD", next: "world-model/cognitive-loop exist; enumerate the 12/10 as an explicit coverage checklist with per-item tests" },
  "V": { criterion: "cognitive loop + World Model + Causal Graph proven", gating: "LOCALLY_CLOSEABLE", next: "world-model.ts + cognitive-loop.ts present; Causal Graph PARTIAL — add a reproducible causal-graph test" },
  "VI": { criterion: "discovery pipeline + radar + scientific research live-proven", gating: "LOCALLY_CLOSEABLE", next: "FR-07 live collection + scientific-research already EXECUTED; assert the 18-step pipeline end-to-end in one test" },
  "VII": { criterion: "4 memories + WAKE/CONSOLIDATION/DREAM/VALIDATION + knowledge integrity", gating: "NEEDS_LOCAL_BUILD", next: "memory-taxonomy + compounding-loop present; full WAKE/DREAM cycle PARTIAL — build the missing cycle stage test" },
  "VIII": { criterion: "self-improvement + evaluator protection + meta-intelligence proven", gating: "LOCALLY_CLOSEABLE", next: "self-improvement + evaluator-independence + champion-challenger already PRESENT_AND_PROVEN; consolidate into one §34–§37 assertion" },
  "IX": { criterion: "autonomy A1–A5 + mission contract + checkpoints + continuity", gating: "LOCALLY_CLOSEABLE", next: "autonomy-persistence A3+ DEMONSTRATED; add an A4/A5-boundary test to close the ladder" },
  "X": { criterion: "15 métiers + responsibility matrix + 11 historical recovered", gating: "LOCALLY_CLOSEABLE", next: "ALL 15 E2/E3 PRESENT_AND_PROVEN (matrix DONE); schema-B mapping is the only open sub-item — document as owner decision" },
  "XI": { criterion: "control plane + roles + validation independence + parallelization", gating: "LOCALLY_CLOSEABLE", next: "agent-factory/identity/third-party-gate present; Builder≠Tester≠Verifier proven; assert parallelization in one test" },
  "XIII": { criterion: "benchmark factory + 10 experiments + statistical validity + superiority", gating: "EXTERNAL_DEPENDENCY", next: "benchmark factory + eval-significance PRESENT; SUPERIORITY needs head-to-head reference execution (no competitor product locally) — V57 §2 designed, fail-closed" },
  "XIV": { criterion: "agentic security + identity/secrets + resilience + emergency stop", gating: "LOCALLY_CLOSEABLE", next: "modules present; assert emergency-stop + secret-handling in a focused security test" },
  "XVI": { criterion: "six CTO dossiers A–F complete + validated", gating: "OWNER_GATED", next: "dossiers are owner-facing deliverables; prepare drafts locally, validation is owner acknowledgement" },
  "XVII": { criterion: "seven steps official order + operational correction", gating: "INHERENTLY_REFERENTIAL", next: "doctrine part; already reflected in the mission cycle — owner acknowledgement, no code" },
  "XVIII": { criterion: "historical assets recovered + anti-duplication proven", gating: "LOCALLY_CLOSEABLE", next: "anti-duplication audited repeatedly; produce a single recovery-completeness assertion" },
  "XIX": { criterion: "four campaigns C1–C4 + dependencies/gates", gating: "OWNER_GATED", next: "campaigns are operational programs; C2 (15 métiers) advanced; C1/C3/C4 completion needs owner prioritization" },
  "XXII": { criterion: "proof statuses + decision/evidence/change registers complete", gating: "LOCALLY_CLOSEABLE", next: "closure-register (427) + evidence-provenance present; assert the four registers' coherence in one test" },
  "XXIII": { criterion: "gates A–G all closed with evidence", gating: "OWNER_GATED", next: "gate machinery present (gates-ledger); some gates require owner/controller sign-off to close — document which" },
  "XXV": { criterion: "fault register F01–F40 each addressed", gating: "NEEDS_LOCAL_BUILD", next: "failures-register present; enumerate F01–F40 status individually" },
  "XXVII": { criterion: "33 final deliverables + study/operational closure", gating: "OWNER_GATED", next: "deliverables largely built; final closure is an owner acceptance act" },
  "XXVIII": { criterion: "seven steps + four campaigns marching order", gating: "INHERENTLY_REFERENTIAL", next: "doctrine/ordering part; owner acknowledgement" },
  "XXIX": { criterion: "execution mandate: authority + method + priorities P0–P8", gating: "INHERENTLY_REFERENTIAL", next: "mandate part; reflected in this very execution — owner acknowledgement" },
  "XXX": { criterion: "first operational mandate: dossier A A1–A10 + uncertainty register", gating: "OWNER_GATED", next: "dossier A buildable locally; A1–A10 validation is owner acceptance" },
  "XXXII": { criterion: "commercialization: offers + acquisition + real clients", gating: "OWNER_GATED", next: "model + pilots prepared (V50–V57); needs real clients/contracts/conversion — 0 observed, owner/market-gated" },
};

// V59 §3: the 9 LOCALLY_CLOSEABLE parts whose KEY functional invariant is now independently re-verified by the
// consolidation test (nominal + violation). This RAISES confidence; it does NOT flip the SSOT bucket (full §-by-§
// closure + controller sign-off remains the matrix maintainer's act — proof before declaration).
const CONSOLIDATION_VERIFIED = new Set(["III", "V", "VI", "VIII", "IX", "XI", "XIV", "XVIII", "XXII", "VII", "XII", "XV"]);
// V59 Lot 2: NEEDS_LOCAL_BUILD parts whose closure is blocked on the FROZEN Master's enumerations (NOT_RECOVERABLE —
// enumerating the 26 capabilities / 12 dimensions + 10 responsibilities / F01–F40 would be fabrication, forbidden).
const CANONICAL_SOURCE_BLOCKED = new Set(["I", "IV", "XXV"]);

const open = (cov && cov.parts ? cov.parts : []).filter((p: any) => p.bucket === "PARTIAL" || p.bucket === "NOT_VALIDATED");
// include Part XXXII (tracked separately in the coverage matrix).
const rows = open.map((p: any) => {
  const key = p.part.split(/\s/)[0];
  const rec = LEDGER[key] || { criterion: "(closure criterion to define)", gating: "NEEDS_LOCAL_BUILD", next: "define closure criterion" };
  const cv = CONSOLIDATION_VERIFIED.has(key);
  const csb = CANONICAL_SOURCE_BLOCKED.has(key);
  return { part: p.part, bucket: p.bucket, closureCriterion: rec.criterion, gating: rec.gating, nextAction: rec.next,
    consolidationVerified: cv, consolidationTest: cv ? (["VII", "XII", "XV"].includes(key) ? "v59-consolidation-lot2.test.ts" : "v59-consolidation-s-level.test.ts") + " (key invariant, nominal+violation)" : null,
    canonicalSourceBlocked: csb, canonicalSourceNote: csb ? "original FROZEN enumeration NOT_RECOVERABLE (V64 exhaustive search); a V64 SUCCESSOR referential reconstructs it (labelled, grounded) — owner validation needed to canonize over the original" : null,
    successorReconstruction: csb ? "V64_SUCCESSOR_REFERENTIAL.json (RECONSTRUCTED; owner-validation pending)" : null };
});
if (cov && cov.partXXXII && !rows.some((r: any) => /XXXII/.test(r.part))) {
  const rec = LEDGER["XXXII"];
  rows.push({ part: cov.partXXXII.part, bucket: cov.partXXXII.bucket, closureCriterion: rec.criterion, gating: rec.gating, nextAction: rec.next });
}

const tally: any = { LOCALLY_CLOSEABLE: 0, NEEDS_LOCAL_BUILD: 0, INHERENTLY_REFERENTIAL: 0, OWNER_GATED: 0, EXTERNAL_DEPENDENCY: 0 };
for (const r of rows) tally[r.gating] = (tally[r.gating] || 0) + 1;

const out = {
  "//": "CTO V58 — remaining-work closure ledger. Every open part gets a closure criterion + gating classification + next action. It does NOT flip buckets to DONE (the SSOT + real proof do that); it states honestly WHY each remaining item is open. Read-only; no new engine.",
  generatedFrom: ["V56_V124_COVERAGE_MATRIX.json"],
  openParts: rows.length,
  consolidationVerifiedCount: rows.filter((r: any) => r.consolidationVerified).length,
  canonicalSourceBlockedCount: rows.filter((r: any) => r.canonicalSourceBlocked).length,
  rows, tally,
  honestConclusion: `${rows.length} open parts: ${tally.LOCALLY_CLOSEABLE} LOCALLY_CLOSEABLE (local assertion tests would close them), ${tally.NEEDS_LOCAL_BUILD} NEEDS_LOCAL_BUILD, ${tally.INHERENTLY_REFERENTIAL} INHERENTLY_REFERENTIAL (doctrine — owner acknowledgement), ${tally.OWNER_GATED} OWNER_GATED (decisions/acceptance), ${tally.EXTERNAL_DEPENDENCY} EXTERNAL_DEPENDENCY (reference/clients/GPU). The locally-closeable parts have their machinery in-repo; full functional closure of the rest is owner/external-gated. No bucket is declared DONE without the SSOT's proof.`,
  invariant: "The ledger classifies and routes; it never closes a part by assertion. Owner-gated and external-dependency parts stay explicitly open — never faked closed. Proof before declaration.",
};
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
fs.writeFileSync(path.join(D, "V58_CLOSURE_LEDGER.json"), JSON.stringify(out, null, 2) + "\n");
export {};
